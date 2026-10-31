/**
 * The state of ONE person's employments, for a card: the record's edges, each dereferenced, and the writes of a person's edits.
 *
 *   - an employment's ENTITY is minted on its first real edit (company, title or role), not on "add employment" (which writes
 *     nothing); a company picked on the empty card adds AND mints in one act;
 *   - the entity is then patched in place on every edit; a delete drops the EDGE and never destroys the entity;
 *   - writes run one at a time, status per row (`emp:<key>`, `emp:<key>:<title>`), a failure can be retried;
 *   - an edge that did not read is carried, never dropped (`unresolved`), and the edge list is always changed AS STORED;
 *   - MOUNT, RENDER, IDLE and a change of `canEdit` write nothing: the only effect that calls anything reads.
 *
 * A null goes on the wire only for a value the person removed: each row remembers the titles and the role as last read or
 * written (`titlesStored`, `roleStored`) and hands them to `updateEmploymentEntity`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { idFromResourceUri } from "@kaigilb/gilbplatformcode-resource-id";
import type { EmploymentRoleFacts } from "@kaigilb/gilbplatformcode-employment-role";
import { positionalTitleHandle } from "@kaigilb/gilbplatformcode-claim-handle";
import { createEmploymentEntity, resolveEmployments, updateEmploymentEntity, type StoredEmploymentEntity } from "@kaigilb/gilbplatformcode-employment-store";
import { resolveEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { resolveEmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";
import { changeEmploymentEdges, edgeIdOf, storedEdgeItems, withEdge, withoutEdges } from "@kaigilb/gilbplatformcode-employment-edges";

/** What the state says when a read failed. The detail goes to the console: the person is told no more than this. */
export const EMPLOYMENT_READ_FAILED_TEXT = "Employment could not be read right now. This is not a statement that there is none.";

/** MyNet `model/profile.ts` `EmploymentTitle`. */
export interface EmploymentTitle {
  key: string;
  value: string;
}

/** MyNet `model/profile.ts` `EmploymentRole`: dates and place; the label is display only. */
export interface EmploymentRole extends EmploymentRoleFacts {
  placeLabel: string;
}

/** MyNet `model/profile.ts` `Employment`, without `access` / `accessRaw` (no rung, see the header). */
export interface Employment {
  /** Stable row key for this card (React key + status key). */
  key: string;
  company: string;
  titles: EmploymentTitle[];
  order: number;
  /** The `t:Employment` entity's address, once it has one. */
  uri?: string;
  role?: EmploymentRole;
  /** s8 organization card: the organization RECORD this employment names (what a company picked from the records
   *  sets), or null for a name-only employment. Written as `a:employer` with `a:employee` (the person). */
  employer?: string | null;
  /** s8: the organization record the STORE holds for this employment (to know a retraction is owed). */
  employerStored?: string | null;
  /** The non-blank titles the entity held when last read or written. Licenses a null of `a:jobTitle` only when one of them is gone. */
  titlesStored: string[];
  /** The role the entity held when last read or written (none: it had no role). The "before" of a role edit. */
  roleStored?: EmploymentRoleFacts;
}

/** s8 organization card: a company chosen as an organization RECORD (the name stays `a:org`). */
export interface EmployerRecord {
  uri: string;
}

/** MyNet `hooks.ts` `FieldSaveStatus` (the states a GilbApp row can reach). */
export type FieldSaveStatus = "idle" | "saving" | "saved" | "failed";

/** MyNet `model/profile.ts` `nextTitleKey`, verbatim. The next free title key (`t0`, `t1`, …). */
export function nextTitleKey(emp: Employment): string {
  const used = new Set(emp.titles.map((t) => t.key));
  let n = 0;
  while (used.has(positionalTitleHandle(n))) n++;
  return positionalTitleHandle(n);
}

/** MyNet `titlesToModel`: an employment always shows at least one title row. */
function titlesToModel(values: string[]): EmploymentTitle[] {
  const arr = values.length ? values : [""];
  return arr.map((v, i) => ({ key: positionalTitleHandle(i), value: v }));
}

function fromStored(e: StoredEmploymentEntity, order: number): Employment {
  return {
    key: e.uri,
    company: e.company,
    titles: titlesToModel(e.titles),
    order,
    uri: e.uri,
    ...(e.role ? { role: { ...e.role, placeLabel: "" } } : {}),
    employer: e.employer ?? null,
    employerStored: e.employer ?? null,
    titlesStored: [...e.titles],
    ...(e.role ? { roleStored: e.role } : {}),
  };
}

/** The non-blank titles of a row, as the store keeps them. */
const titlesOf = (row: Employment): string[] => row.titles.map((t) => t.value.trim()).filter((v) => v !== "");

let localSeq = 0;

export interface EmploymentsEditor {
  employments: Employment[];
  /** Edges the record holds whose entity did not read: carried, never dropped. */
  unresolved: string[];
  /** F23 (Agent.Scaling ae4292a): items of the fact that are not links (a plain text an older writer
   *  left). Shown as text, as Address shows a legacy `postalAddress`; carried verbatim, never edited. */
  legacyText: string[];
  status: Record<string, FieldSaveStatus>;
  loading: boolean;
  error: string | null;
  addEmployment: (initial?: { company?: string; employer?: EmployerRecord }) => string;
  /** `record` set: the company is an organization RECORD (`a:employer` is written); not set: typed text, and any
   *  stored link is retracted (the holder's own act). */
  editEmploymentCompany: (empKey: string, value: string, record?: EmployerRecord) => void;
  deleteEmployment: (empKey: string) => void;
  addJobTitle: (empKey: string) => void;
  editJobTitle: (empKey: string, titleKey: string, value: string) => void;
  editEmploymentRole: (empKey: string, role: EmploymentRole) => void;
  deleteJobTitle: (empKey: string, titleKey: string) => void;
  retryOutbox: () => void;
}

export function useEmployments(opts: {
  recordId: string;
  recordEntityUri: string;
  /** The vault that HOLDS the record (where each employment is minted). */
  vaultId: string | null;
  /** The record's field key for the `a:employment` term (found by term). */
  edgeKey: string;
  /** The edge fact as the record served it. */
  servedEdges: unknown;
  /** After the record's edge list changed (the card re-reads the record). */
  onSaved?: () => void;
  /** F23: false while the record's own served document has not arrived (a list row's flattened value
   *  is not the edge list): the section waits, ⛔ it never reads that text as an edge. Default true. */
  servedReady?: boolean;
  /** The origin of the place catalogue, so that a place stored as a compact `base:e/<id>` reads as an address. Absent: it reads as none. */
  catalogueOrigin?: string;
}): EmploymentsEditor {
  const { recordId, recordEntityUri, vaultId, edgeKey, servedEdges, onSaved, servedReady = true, catalogueOrigin } = opts;
  const [employments, setEmployments] = useState<Employment[]>([]);
  const [unresolved, setUnresolved] = useState<string[]>([]);
  const [legacyText, setLegacyText] = useState<string[]>([]);
  const [status, setStatus] = useState<Record<string, FieldSaveStatus>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Bumped when the write queue drains, so a served change that arrived meanwhile is adopted then.
  const [drained, setDrained] = useState(0);
  const modelRef = useRef<Employment[]>([]);
  const tail = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const failed = useRef(new Map<string, () => Promise<void>>());
  /** The edge list as this card last wrote or loaded it (a served list equal to it is not news). */
  const knownSig = useRef<string | null>(null);
  /** The served list last handled by the load. */
  const processedSig = useRef<string | null>(null);
  /** B4 (Agent.Scaling ae4292a): the entities the record is KNOWN to link (loaded through its edges,
   *  or linked by this card's own write). Any other minted entity is linked on its next write. */
  const linked = useRef(new Set<string>());
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  const setModel = useCallback((next: (m: Employment[]) => Employment[]) => {
    modelRef.current = next(modelRef.current);
    setEmployments(modelRef.current);
  }, []);
  const markStatus = useCallback((keys: string[], s: FieldSaveStatus) => {
    setStatus((prev) => {
      const out = { ...prev };
      for (const k of keys) out[k] = s;
      return out;
    });
  }, []);

  // ── Load: the record's edges, each dereferenced (MyNet's load effect, `resolveEmployments`). ──
  const servedSig = JSON.stringify(storedEdgeItems(servedEdges));
  useEffect(() => {
    if (!vaultId) {
      setLoading(false);
      return;
    }
    if (!servedReady) return;
    // Only a CHANGE of the served list is news: after this card's own write the parent still holds the
    // list it read before, and adopting that would bring back what was just removed.
    if (processedSig.current === servedSig) return;
    // The record re-read after this card's own write: the list it wrote, nothing to load.
    if (knownSig.current === servedSig) {
      processedSig.current = servedSig;
      return;
    }
    // ⚠ A served change while this card's own write is out is adopted when the queue drains.
    if (pending.current > 0) return;
    let alive = true;
    setLoading(true);
    void (async () => {
      try {
        const vocab = await resolveEmploymentVocab(edgeKey);
        const items = JSON.parse(servedSig) as unknown[];
        // F23: a link is an `{"@id"}` or an address; any other text is an older writer's value, not an edge.
        const edges = items.filter((i) => edgeIdOf(i) !== null);
        const texts = items.filter((i): i is string => typeof i === "string" && edgeIdOf(i) === null && i.trim() !== "");
        const doc = { [vocab.employment.replace(/^a:/, "")]: edges };
        // s8: the link vocabulary is asked beside; a master that does not answer costs only which organization
        // each employment names, ⛔ never the employments themselves.
        const linkVocab = await resolveEmploymentLinkVocab().catch(() => undefined);
        const got = await resolveEmployments(doc, vocab, vaultId, linkVocab, catalogueOrigin);
        if (!alive) return;
        for (const e of got.resolved) linked.current.add(e.uri);
        setLegacyText(texts);
        knownSig.current = servedSig;
        processedSig.current = servedSig;
        // An employment added here and not yet minted (no entity) is kept: it is the person's draft.
        setModel((prev) => [
          ...got.resolved.map((e, i) => fromStored(e, i)),
          ...prev.filter((e) => !e.uri),
        ]);
        setUnresolved(got.unresolved);
        setError(null);
      } catch (e) {
        if (alive) {
          // The detail is for the console: what the person reads names no term and no address.
          console.error("[employments] the read failed", e);
          setError(EMPLOYMENT_READ_FAILED_TEXT);
        }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [servedSig, vaultId, edgeKey, setModel, drained, servedReady, catalogueOrigin]);

  /** MyNet's `enqueue`: one write at a time; a failure marks the row and can be retried. */
  const enqueue = useCallback(
    (keys: string[], write: () => Promise<void>) => {
      pending.current++;
      markStatus(keys, "saving");
      const run = async () => {
        try {
          await write();
          for (const k of keys) failed.current.delete(k);
          markStatus(keys, "saved");
        } catch (e) {
          console.error("[employments] a write failed", e);
          for (const k of keys) failed.current.set(k, write);
          markStatus(keys, "failed");
        } finally {
          pending.current--;
          if (pending.current === 0) setDrained((n) => n + 1);
        }
      };
      tail.current = tail.current.then(run);
      return tail.current;
    },
    [markStatus],
  );

  /** Link the entity from the record (no write when the link is already stored). */
  const linkEntity = useCallback(
    async (uri: string) => {
      const written = await changeEmploymentEdges(recordId, recordEntityUri, edgeKey, (stored) => withEdge(stored, uri));
      linked.current.add(uri);
      knownSig.current = JSON.stringify(written);
      onSavedRef.current?.();
    },
    [recordId, recordEntityUri, edgeKey],
  );

  /** Mint the row's entity or patch it (MyNet `syncEmploymentEntity`), reading the row at write time. */
  const syncEntity = useCallback(
    async (empKey: string, writeRole: boolean) => {
      if (!vaultId) throw new Error("The vault that holds this record is not known, so the employment was not saved.");
      const row = modelRef.current.find((e) => e.key === empKey);
      if (!row) return; // removed meanwhile: nothing to write
      const vocab = await resolveEmploymentVocab(edgeKey);
      // s8 organization card: an employment that names an organization record carries `a:employer` and
      // `a:employee` together with `a:org`; one that names none, but stored a link, retracts it (the holder's
      // company act). ⛔ A master that does not name the link terms fails THIS write loud (the row shows "retry").
      const wantsLink = !!row.employer;
      const mustUnlink = !row.employer && !!row.employerStored;
      const linkVocab = wantsLink || mustUnlink ? await resolveEmploymentLinkVocab() : undefined;
      const facts = {
        ...(wantsLink ? { links: { employer: row.employer!, employee: recordEntityUri } } : {}),
        ...(mustUnlink ? { unlink: true } : {}),
        company: row.company,
        titles: row.titles.map((t) => t.value),
        ...(writeRole && row.role
          ? { role: { start: row.role.start, end: row.role.end, current: row.role.current, placeId: row.role.placeId } }
          : {}),
      };
      if (row.uri) {
        await updateEmploymentEntity(
          idFromResourceUri(row.uri),
          { ...facts, key: "", titlesStored: row.titlesStored, ...(facts.role ? { roleBefore: row.roleStored } : {}) },
          vocab,
          vaultId,
          row.uri,
          linkVocab,
        );
        // The write kept: what the entity holds now is what this row said, the "before" of the next edit.
        setModel((m) => m.map((e) => (e.key === empKey ? { ...e, ...(wantsLink || mustUnlink ? { employerStored: row.employer ?? null } : {}), titlesStored: titlesOf(row), ...(facts.role ? { roleStored: facts.role } : {}) } : e)));
        // B4 (Agent.Scaling ae4292a): an entity minted here whose link write failed is linked now; a
        // retry, or any later edit, never reports "saved" for an employment the record does not link.
        // `withEdge` writes nothing when the link is already stored.
        if (!linked.current.has(row.uri)) await linkEntity(row.uri);
        return;
      }
      const created = await createEmploymentEntity(vaultId, facts, vocab, linkVocab);
      // Removed while the mint was out: the entity stays unlinked (MyNet never destroys one), and no
      // edge brings the row back.
      if (!modelRef.current.some((e) => e.key === empKey)) return;
      setModel((m) => m.map((e) => (e.key === empKey ? { ...e, uri: created.uri, employerStored: row.employer ?? null, titlesStored: titlesOf(row), ...(facts.role ? { roleStored: facts.role } : {}) } : e)));
      await linkEntity(created.uri);
    },
    [vaultId, edgeKey, setModel, linkEntity],
  );

  const addEmployment = useCallback(
    (initial?: { company?: string; employer?: EmployerRecord }) => {
      const empKey = `new-${++localSeq}`;
      const company = typeof initial?.company === "string" ? initial.company : undefined;
      setModel((m) => [
        ...m,
        { key: empKey, company: company ?? "", titles: titlesToModel([]), order: m.length, employer: initial?.employer?.uri ?? null, employerStored: null, titlesStored: [] },
      ]);
      if (company !== undefined) void enqueue([`emp:${empKey}`], () => syncEntity(empKey, false));
      return empKey;
    },
    [enqueue, setModel, syncEntity],
  );

  const editEmploymentCompany = useCallback(
    (empKey: string, value: string, record?: EmployerRecord) => {
      setModel((m) => m.map((e) => (e.key === empKey ? { ...e, company: value, employer: record?.uri ?? null } : e)));
      void enqueue([`emp:${empKey}`], () => syncEntity(empKey, false));
    },
    [enqueue, setModel, syncEntity],
  );

  const deleteEmployment = useCallback(
    (empKey: string) => {
      const emp = modelRef.current.find((e) => e.key === empKey);
      const at = modelRef.current.findIndex((e) => e.key === empKey);
      const drop = () => setModel((m) => m.filter((e) => e.key !== empKey).map((e, i) => ({ ...e, order: i })));
      drop();
      if (!emp?.uri) return; // never minted: nothing stored
      const goneUri = emp.uri;
      void enqueue([`emp:${empKey}`], async () => {
        drop(); // a retry takes the row off again
        try {
          const written = await changeEmploymentEdges(recordId, recordEntityUri, edgeKey, (stored) => withoutEdges(stored, [goneUri]));
          linked.current.delete(goneUri);
          knownSig.current = JSON.stringify(written);
          onSavedRef.current?.();
        } catch (e) {
          // F22 (Agent.Scaling ae4292a): the remove did not land, so the row comes back where it was,
          // with its "not saved · retry" (the badge is the row's own), ⛔ never a silent disappearance.
          setModel((m) =>
            m.some((x) => x.key === empKey)
              ? m
              : [...m.slice(0, Math.max(0, at)), emp, ...m.slice(Math.max(0, at))].map((x, i) => ({ ...x, order: i })),
          );
          throw e;
        }
      });
    },
    [enqueue, setModel, recordId, recordEntityUri, edgeKey],
  );

  const addJobTitle = useCallback(
    (empKey: string) => {
      setModel((m) => m.map((e) => (e.key === empKey ? { ...e, titles: [...e.titles, { key: nextTitleKey(e), value: "" }] } : e)));
    },
    [setModel],
  );

  const editJobTitle = useCallback(
    (empKey: string, titleKey: string, value: string) => {
      setModel((m) =>
        m.map((e) => (e.key === empKey ? { ...e, titles: e.titles.map((t) => (t.key === titleKey ? { ...t, value } : t)) } : e)),
      );
      void enqueue([`emp:${empKey}:${titleKey}`], () => syncEntity(empKey, false));
    },
    [enqueue, setModel, syncEntity],
  );

  const deleteJobTitle = useCallback(
    (empKey: string, titleKey: string) => {
      const emp = modelRef.current.find((e) => e.key === empKey);
      const had = emp?.titles.find((t) => t.key === titleKey);
      setModel((m) => m.map((e) => (e.key === empKey ? { ...e, titles: e.titles.filter((t) => t.key !== titleKey) } : e)));
      // A blank title was never stored; removing it writes nothing.
      if (!emp?.uri || !had?.value.trim()) return;
      void enqueue([`emp:${empKey}:${titleKey}`], () => syncEntity(empKey, false));
    },
    [enqueue, setModel, syncEntity],
  );

  const editEmploymentRole = useCallback(
    (empKey: string, role: EmploymentRole) => {
      setModel((m) => m.map((e) => (e.key === empKey ? { ...e, role } : e)));
      void enqueue([`emp:${empKey}`], () => syncEntity(empKey, true));
    },
    [enqueue, setModel, syncEntity],
  );

  const retryOutbox = useCallback(() => {
    const jobs = new Map<() => Promise<void>, string[]>();
    for (const [k, w] of failed.current) jobs.set(w, [...(jobs.get(w) ?? []), k]);
    for (const [w, keys] of jobs) void enqueue(keys, w);
  }, [enqueue]);

  return {
    employments,
    unresolved,
    legacyText,
    status,
    loading,
    error,
    addEmployment,
    editEmploymentCompany,
    deleteEmployment,
    addJobTitle,
    editJobTitle,
    editEmploymentRole,
    deleteJobTitle,
    retryOutbox,
  };
}
