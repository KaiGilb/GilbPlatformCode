/**
 * React binding for a person card's held skill or interest notes (`heldNote.ts`
 * holds the rules). ONE hook for both kinds.
 *
 * THE READ: the claims about THIS person in THIS vault, through the platform's
 * per-person find, asked at the vault's own host . ONE React Query key per (vault, person)
 * holds every held claim about the person: the Skills and the Interests sections share it,
 * and each keeps its own kind. A card load may use a read up to {@link HELD_NOTES_STALE_MS} old.
 *
 * 🔴 ONE AT A TIME PER CATEGORY . Every save, add and removal of one (vault, person, kind,
 * category) runs after the one before it has finished, on a promise chain shared by every card on the
 * page. Measured before this: two saves 3 ms apart at N = 100 made TWO claims for one person and skill,
 * and a removal during a save reported "removed" while the note stayed stored.
 *   - Each act plans on a FRESH read of this person's claims (⛔ never the held one: another tab may
 *     have written since; ⛔ never a read already in flight, which may have started before the act
 *     before it wrote), writes, then reads back ONLY THE CLAIM IT WROTE and puts it into the shared
 *     query (⛔ no second read of everything).
 *   - Two tabs or two devices can still race; that needs the platform (recorded).
 *
 * WHO STATED WHAT: a note's `a:statedBy` is the card of the person who ADDED it, their own card in their own
 * landing vault (`useAdderCard`), ⛔ never the card of the vault written into. Every claim the platform returns about the person is shown
 * (the platform enforces who may read); only the claims the viewer stated themselves (their own card is the one `a:statedBy`) are edited or
 * deleted by them, so one adder never changes another's. A claim an old vault card stated, or another person, reads and has no edit here.
 */
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useAdderCard } from "@kaigilb/gilbplatformcode-adder-card";
import { isStatedBy } from "@kaigilb/gilbplatformcode-stated-by";
import {
  addHeldTopic,
  heldNoteSurvived,
  heldNotesAbout,
  heldNotesOfKind,
  ownHeldNotes,
  listHeldClaimsAbout,
  notesForTopic,
  readHeldClaimDoc,
  removeHeldNotes,
  saveHeldNote,
  toHeldNote,
  type HeldClaimDoc,
  type HeldNote,
  type HeldNoteWriteResult,
} from "./heldNote";
import { resolveHeldNoteVocab, type HeldNoteKind } from "./heldNoteVocab";
import { privateMarkFacts, sharedMarkFacts, writeHeldMark } from "./heldDetailMark";

/** The React Query key of EVERY held claim about one person in one vault (both kinds share it). */
export const heldClaimsKey = (vaultId: string, subject: string) => ["mynet", "held-claims", vaultId, subject] as const;
/** How old a held read a card LOAD may use. A plan before a write is always fresh. */
export const HELD_NOTES_STALE_MS = 60_000;

/** Said when someone tries to change who sees a detail they did not add. */
const NOT_ADDED = "You did not add this, so you cannot change who sees it.";

/** One chain per (kind, vault, person, category): an act starts only when the one before has settled. */
const chains = new Map<string, Promise<unknown>>();
export function runSerial<T>(key: string, act: () => Promise<T>): Promise<T> {
  const prev = chains.get(key) ?? Promise.resolve();
  const next = prev.then(act, act);
  const tail = next.catch(() => undefined);
  chains.set(key, tail);
  void tail.then(() => {
    if (chains.get(key) === tail) chains.delete(key);
  });
  return next;
}
/** Test seam — ⛔ never called by product code. */
export function __resetHeldNoteChains(): void {
  chains.clear();
}

export interface HeldNotesState {
  /** The note on one category ("" when none), or null while the notes are not read. */
  noteFor: (topic: string) => string | null;
  /** This card's categories of this kind that have a claim, in mint order; null while not read. */
  topics: () => string[] | null;
  /** The read failed: said, ⛔ never shown as "no note". ⛔ Not set when the vault simply has no card of its own (`noCard`). */
  readError: string | null;
  /** The person has no landing vault of their own, so what they add would have no source: nothing of this kind is offered (the card says it once). */
  noOwnVault: boolean;
  /** The viewer may change this category's note: they stated it, or nobody has stated one yet. False when only another's (or an old vault card's) claim is there. */
  editableFor: (topic: string) => boolean;
  /** The last save or removal that did not happen, and why, per category. */
  errorFor: (topic: string) => string | null;
  /** Categories whose note is being saved. */
  savingFor: (topic: string) => boolean;
  /** Save the note on one category; TRUE only when the read-back of the claim written carries it. */
  save: (topic: string, text: string) => Promise<boolean>;
  /** Add a category as its own claim (no note); TRUE only when the read-back carries it. */
  add: (topic: string) => Promise<boolean>;
  /** The category left the card: remove its claims about this person; TRUE only when each is gone. */
  removeFor: (topic: string) => Promise<boolean>;
  /**
   * Who sees the viewer's own claim on this category: "private" (only they), "shared" (everyone who may read the vault, the default), or null when
   * the viewer stated none (then there is no switch: only the adder may set it).
   */
  markFor: (topic: string) => "private" | "shared" | null;
  /**
   * The claim the category's line is drawn from (the viewer's own when they stated one, else the first the platform returned): its address, whether
   * the viewer added it, and whether it names a source at all; null when the category has no claim. The "Added by" line asks about this.
   */
  sourceFor: (topic: string) => { item: string; own: boolean; hasSource: boolean } | null;
  /** Set the viewer's own claim on this category private (`true`) or back to shared (`false`): one PATCH with If-Match. Refuses a claim the viewer did not add. TRUE only when the read-back carries it. */
  setPrivate: (topic: string, makePrivate: boolean) => Promise<boolean>;
}

/** Put one claim as read back into the shared query (replace by id, or drop it when gone). */
/** Exported: the held languages hook puts its read-back into the same shared query. */
export function mergeClaim(qc: QueryClient, key: readonly unknown[], id: string, next: HeldClaimDoc | null): void {
  qc.setQueryData<HeldClaimDoc[]>(key, (old) => {
    const rest = (old ?? []).filter((n) => n.id !== id);
    const out = next ? [...rest, next] : rest;
    return out.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  });
}

export function useHeldNotes(
  kind: HeldNoteKind,
  /** The vault that HOLDS the person's record — where the notes are written and read. */
  vaultId: string | null | undefined,
  /** The person's record (its entity IRI): every note's `a:heldParty`. */
  subject: string,
  /** The signed-in principal, granted read on each claim at mint. */
  principal?: string | null,
): HeldNotesState {
  const qc = useQueryClient();
  // The source is the adder: the viewer's OWN card (one read per session, the own-card finding). Known = they may edit what they stated; a
  // write asks `adder.resolve()` for the card to state (and makes the basic card when they have none).
  const adder = useAdderCard(!!subject);
  const card = adder.card;
  // This kind's terms, from the master (cached per session). A kind the master does not name is said on
  // its own section; ⛔ it does not stop the other kind's read.
  const vocabQuery = useQuery({
    queryKey: ["mynet", "held-note-vocab", kind] as const,
    queryFn: () => resolveHeldNoteVocab(kind),
    staleTime: Infinity,
    retry: false,
  });
  const vocab = vocabQuery.data ?? null;
  const key = heldClaimsKey(vaultId ?? "", subject);
  const query = useQuery({
    queryKey: key,
    queryFn: () => listHeldClaimsAbout(vaultId ?? "", subject),
    enabled: !!vaultId && !!subject,
    staleTime: HELD_NOTES_STALE_MS,
    retry: false,
  });
  /** Every claim about this person of this kind that the platform returned, whoever stated it. */
  const mine = useMemo(
    () => (query.data && vocab ? heldNotesAbout(heldNotesOfKind(query.data, vocab), subject) : null),
    [query.data, subject, vocab],
  );
  const [errors, setErrors] = useState<Readonly<Record<string, string>>>({});
  const [saving, setSaving] = useState<ReadonlyMap<string, number>>(new Map());

  const setError = (topic: string, message: string | null) =>
    setErrors((e) => {
      const next = { ...e };
      if (message) next[topic] = message;
      else delete next[topic];
      return next;
    });
  const mark = (topic: string, on: boolean) =>
    setSaving((s) => {
      const next = new Map(s);
      const n = (next.get(topic) ?? 0) + (on ? 1 : -1);
      if (n > 0) next.set(topic, n);
      else next.delete(topic);
      return next;
    });

  /** A FRESH read of this card's claims of this kind (put into the shared query), or null when the read
   *  itself failed. ⛔ Not `fetchQuery`: that would join a read already in flight (the other section's, or
   *  the card load's), which may have started before the act before this one wrote. `own` is what `stater` stated: the only claims an act changes. */
  const readFresh = useCallback(async (stater: string): Promise<{ all: HeldNote[]; own: HeldNote[] } | null> => {
    if (!vaultId) return null;
    try {
      const [raw, v] = await Promise.all([listHeldClaimsAbout(vaultId, subject), resolveHeldNoteVocab(kind)]);
      qc.setQueryData(heldClaimsKey(vaultId, subject), raw);
      const all = heldNotesAbout(heldNotesOfKind(raw, v), subject);
      return { all, own: ownHeldNotes(all, stater) };
    } catch {
      return null;
    }
  }, [qc, kind, vaultId, subject]);

  /** Read back ONLY the claim a write touched, merge it into the query, and return it as this kind's note
   *  (null = gone, or no longer of this kind). */
  const readBackWritten = useCallback(
    async (res: HeldNoteWriteResult): Promise<HeldNote | null | "unread"> => {
      if (res.kind === "none" || !vaultId) return "unread";
      try {
        const [got, v] = await Promise.all([readHeldClaimDoc(vaultId, res.claim), resolveHeldNoteVocab(kind)]);
        mergeClaim(qc, heldClaimsKey(vaultId, subject), res.claim.id, got);
        return got ? toHeldNote(got.id, got.uri, got.doc, v) : null;
      } catch {
        return "unread";
      }
    },
    [qc, kind, vaultId, subject],
  );

  const chainKey = (topic: string) => `${kind}\u0000${vaultId ?? ""}\u0000${subject}\u0000${topic}`;

  const save = useCallback(
    (topic: string, text: string): Promise<boolean> => {
      if (!vaultId) {
        setError(topic, "Not signed in to a vault, so there is nowhere to store this note.");
        return Promise.resolve(false);
      }
      mark(topic, true);
      return runSerial(chainKey(topic), async () => {
        try {
          // The source first: with no own vault (or no card that can be made) nothing is written, and the reason is said as it is.
          let stater: string;
          try {
            stater = await adder.resolve();
          } catch (e) {
            setError(topic, (e as Error).message);
            return false;
          }
          const before = await readFresh(stater);
          if (before === null) {
            setError(topic, "The notes could not be read, so this note is not saved. Try again.");
            return false;
          }
          const existing = notesForTopic(before.own, topic);
          const res = await saveHeldNote({ kind, vaultId, subject, topic, text, existing, stater, readerPrincipal: principal });
          const after = res.kind === "none" ? existing : await readBackWritten(res);
          if (after === "unread") {
            setError(topic, "Saved, but the note could not be read back, so this is not confirmed. Try again.");
            return false;
          }
          if (!heldNoteSurvived(Array.isArray(after) ? after : after ? [after] : [], text)) {
            setError(topic, "The store accepted this note but did not keep it, so it is not saved. Try again.");
            return false;
          }
          setError(topic, null);
          return true;
        } catch (e) {
          setError(topic, `Could not save this note: ${(e as Error).message}`);
          return false;
        } finally {
          mark(topic, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, vaultId, subject, principal, adder.resolve, readFresh, readBackWritten],
  );

  const add = useCallback(
    (topic: string): Promise<boolean> => {
      if (!vaultId) {
        setError(topic, "Not signed in to a vault, so there is nowhere to store this.");
        return Promise.resolve(false);
      }
      mark(topic, true);
      return runSerial(chainKey(topic), async () => {
        try {
          let stater: string;
          try {
            stater = await adder.resolve();
          } catch (e) {
            setError(topic, (e as Error).message);
            return false;
          }
          const before = await readFresh(stater);
          if (before === null) {
            setError(topic, "The card could not be read, so this is not added. Try again.");
            return false;
          }
          const existing = notesForTopic(before.own, topic);
          const res = await addHeldTopic({ kind, vaultId, subject, topic, existing, stater, readerPrincipal: principal });
          if (res.kind === "none") return true;
          const after = await readBackWritten(res);
          if (after === "unread" || after === null || after.topic !== topic) {
            setError(topic, "The store accepted this but did not keep it, so it is not added. Try again.");
            return false;
          }
          setError(topic, null);
          return true;
        } catch (e) {
          setError(topic, `Could not add this: ${(e as Error).message}`);
          return false;
        } finally {
          mark(topic, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, vaultId, subject, principal, adder.resolve, readFresh, readBackWritten],
  );

  const setPrivate = useCallback(
    (topic: string, makePrivate: boolean): Promise<boolean> => {
      if (!vaultId || !principal) {
        setError(topic, "Not signed in, so who sees this cannot be changed.");
        return Promise.resolve(false);
      }
      mark(topic, true);
      return runSerial(chainKey(topic), async () => {
        try {
          // Only the adder: the claims whose one `a:statedBy` is the viewer's own card. With no card of their own they added nothing.
          const stater = await adder.find();
          const before = stater ? await readFresh(stater) : null;
          if (!stater || before === null) {
            setError(topic, stater ? "The notes could not be read, so who sees this was not changed. Try again." : NOT_ADDED);
            return false;
          }
          const claims = notesForTopic(before.own, topic);
          if (claims.length === 0) {
            setError(topic, NOT_ADDED);
            return false;
          }
          for (const c of claims) {
            await writeHeldMark(c, makePrivate ? privateMarkFacts(principal) : sharedMarkFacts());
            const got = await readBackWritten({ kind: "patch", claim: { id: c.id, uri: c.uri } });
            if (got === "unread" || got === null || (got.isPrivate === true) !== makePrivate) {
              setError(topic, "The store accepted this but did not keep it, so who sees it is not changed. Try again.");
              return false;
            }
          }
          setError(topic, null);
          return true;
        } catch (e) {
          setError(topic, `Could not change who sees this: ${(e as Error).message}`);
          return false;
        } finally {
          mark(topic, false);
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, vaultId, subject, principal, adder.find, readFresh, readBackWritten],
  );

  const removeFor = useCallback(
    (topic: string): Promise<boolean> => {
      if (!vaultId) return Promise.resolve(false);
      return runSerial(chainKey(topic), async () => {
        try {
          // Only what the viewer stated themselves is removed. With no card of their own they have stated nothing here.
          const stater = await adder.find();
          if (!stater) return true;
          const before = await readFresh(stater);
          if (before === null) {
            setError(topic, "The notes could not be read, so the note on this was not removed.");
            return false;
          }
          const claims = notesForTopic(before.own, topic);
          if (claims.length === 0) return true;
          await removeHeldNotes(vaultId, claims, kind);
          for (const c of claims) {
            const got = await readBackWritten({ kind: "clear", claim: c });
            if (got !== null) {
              setError(topic, "The note on this could not be confirmed removed. Try again.");
              return false;
            }
          }
          setError(topic, null);
          return true;
        } catch (e) {
          setError(topic, `Could not remove the note on this: ${(e as Error).message}`);
          return false;
        }
      });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [kind, vaultId, subject, adder.find, readFresh, readBackWritten],
  );

  return {
    // The viewer's own note on the category when they stated one, else the first one the platform returned.
    noteFor: (topic) => {
      if (mine === null) return null;
      const here = notesForTopic(mine, topic);
      return (here.find((n) => isStatedBy(n.statedBy, card, n.uri)) ?? here[0])?.note ?? "";
    },
    sourceFor: (topic) => {
      const here = mine === null ? [] : notesForTopic(mine, topic);
      const pick = here.find((n) => isStatedBy(n.statedBy, card, n.uri)) ?? here[0];
      return pick ? { item: pick.uri, own: isStatedBy(pick.statedBy, card, pick.uri), hasSource: pick.statedBy.length > 0 } : null;
    },
    markFor: (topic) => {
      const own = (mine === null ? [] : notesForTopic(mine, topic)).filter((n) => isStatedBy(n.statedBy, card, n.uri));
      return own.length === 0 ? null : own.some((n) => n.isPrivate === true) ? "private" : "shared";
    },
    setPrivate,
    editableFor: (topic) => {
      const here = mine === null ? [] : notesForTopic(mine, topic);
      return here.length === 0 || here.some((n) => isStatedBy(n.statedBy, card, n.uri));
    },
    topics: () => {
      if (mine === null) return null;
      const seen = new Set<string>();
      return mine.map((n) => n.topic).filter((t) => (seen.has(t) ? false : (seen.add(t), true)));
    },
    readError: vocabQuery.isError
        ? `Could not read the ${kind} notes: ${(vocabQuery.error as Error).message}`
        : query.isError
          ? `Could not read the ${kind} notes: ${(query.error as Error).message}`
          : null,
    noOwnVault: adder.noOwnVault,
    errorFor: (topic) => errors[topic] ?? null,
    savingFor: (topic) => (saving.get(topic) ?? 0) > 0,
    save,
    add,
    removeFor,
  };
}
