/**
 * One stakeholder list READER per holder, as the shared list needs it:
 *   - a NEW reader per holder (and per held-vault set, kind set and own card): its caches are that holder's only;
 *   - `onRows` feeds the list each time a draw has rows (first rows, joined rows, settled rows);
 *   - `more` is `() => reader.more()`, returning the reader's promise, so the list can say at once that a page did not come;
 *   - `names` is ONE stable function for the list's life: the list keeps one label window and always calls the latest function;
 *   - the screen's requests are counted from when the list opened (its first render, before the kinds and the own card are read),
 *     and for a later reader (a holder switch) from when it was made, so its up-front read gets only what that screen has left of
 *     40;
 *   - a record deleted anywhere in the app (`useDeleteRecord`, watched in the mutation cache by `RECORD_DELETE_KEY`) leaves the
 *     list AT ONCE, as on main: its record row goes, and a linked person's row becomes the placed person. Once the DELETE has
 *     landed the list is drawn again from the first pages, and the kept up-front answers have already forgotten the record
 *     (`forgetDeletedLinkedRecord`), so no draw brings it back. A refused delete puts the row back;
 *   - a record taken as ended leaves the list the same way, at once and with no request, and comes back if a page lists it again
 *     (`forgetEndedLinkedRecord` of `stakeholder-list-state`). A record is taken as ended only when its resolve
 *     answered 404 AND this session saw it joined to a person before AND it is on the holder's own vault: the platform's 404 also means "no card behind the link" and "not on the caller's own vault", so a
 *     404 alone is not "deleted in another tab or device".
 *
 * Nothing is read until `args` is given (the kinds and the own-card finding are known). ⛔ No writes.
 */
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  createStakeholderListReader,
  type NameState,
  type StakeholderList,
  type StakeholderListReader,
  type StakeholderListRow,
} from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { stakeholderListDeps } from "./listDoors";
import { StakeholderListDoorsHostContext } from "./doorsHost";
import type { RecordsPage } from "@kaigilb/gilbplatformcode-stakeholder-list-reader";
import { watchRecordDeletes } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { endedLinkedRecords, onEndedLinkedRecords } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { idFromUri } from "@kaigilb/gilbplatformcode-lws-vault-sets";

/** What one reader is made from. Its identity is these values: a change makes a new reader. */
export interface StakeholderListReaderArgs {
  holder: string;
  /** The held vaults, the holder's own first. */
  vaults: readonly string[];
  ownVaultId: string | null;
  typeNames: readonly string[];
  ownCardIds: readonly string[];
  /**
   * The records the screen already loaded, per vault, with their links (`listDoors` `screenPages`). Given:
   * the reader reads no records page of its own. Read through a ref, so a newer screen is used without a new reader; whether it is
   * given at all is part of the reader's identity.
   */
  screenPages?: (vaultId: string) => RecordsPage | null;
  /**
   * The links of the records the screen loaded, by person, when it holds every given vault's list whole (`listDoors`
   * `screenLinks`): the up-front linked read then sends no find. Read through a ref, like `screenPages`.
   */
  screenLinks?: (vaults: readonly string[]) => { byPerson: ReadonlyMap<string, readonly string[]>; partial: ReadonlySet<string> } | null;
}

export interface StakeholderListReading {
  /** The latest list, or null while the first rows are read. */
  list: StakeholderList | null;
  /** Why the first draw failed as a whole, or null. (A failed input is a partial list, not this.) */
  error: string | null;
  /** The list's names door (stable). */
  names: (keys: readonly string[]) => Promise<Map<string, NameState>>;
  /** The list's next page (`reader.more()`). */
  more: () => Promise<StakeholderList> | undefined;
  /** Draws the list again from the first pages (`reader.refresh()`), e.g. after a create. The new rows go to `list`. */
  refresh: () => Promise<StakeholderList> | undefined;
  /** The current reader's identity (its args), or null: a new value is a new reader (its names start again). */
  identity: string | null;
}

/** The reader's options a screen may set. */
export interface StakeholderListReaderOptions {
  /** Also read the names (with photo address and caption) of linked rows (`linkedNames` of `stakeholder-list-reader`). Default false. */
  linkedNames?: boolean;
}

/**
 * @param args the reader's identity, or null: nothing is read yet
 * @returns the latest list, its names door and its next-page act
 */
export function useStakeholderListReader(args: StakeholderListReaderArgs | null, options: StakeholderListReaderOptions = {}): StakeholderListReading {
  const linkedNames = options.linkedNames === true;
  const host = useContext(StakeholderListDoorsHostContext);
  if (!host) throw new Error("useStakeholderListReader needs a StakeholderListDoorsHostContext.Provider above it.");
  const qc = useQueryClient();
  // A reader is rebuilt only when what it reads changes (the arrays are compared by value, not identity).
  const identity = args ? JSON.stringify([args.holder, args.vaults, args.ownVaultId, args.typeNames, args.ownCardIds, !!args.screenPages, !!args.screenLinks]) : null;
  const screenRef = useRef(args?.screenPages);
  screenRef.current = args?.screenPages;
  const linksRef = useRef(args?.screenLinks);
  linksRef.current = args?.screenLinks;
  // Each list is kept WITH the identity of the reader that drew it. On a holder switch the new holder is passed in the same render
  // as `list: null`, ⛔ never with A's rows still drawn (B's shared people showed "Name could not be read" and B's
  // names door was never read when A's list stayed on screen under B's holder).
  const [drawn, setDrawn] = useState<{ identity: string; list: StakeholderList } | null>(null);
  const [failed, setFailed] = useState<{ identity: string; error: string } | null>(null);
  // The ids of records whose delete is out or has landed; their rows are taken out of every list drawn here. From the app's one
  // delete watcher and the session's deleted list, shared with the grid.
  const deleting = host.useRecordsBeingDeleted();
  // The ids taken as ended (a resolve's 404 for a kept linked record); their rows are taken out the same way.
  const [ended, setEnded] = useState<ReadonlySet<string>>(() => endedLinkedRecords());
  useEffect(() => {
    setEnded(endedLinkedRecords()); // a change between the first render and this subscription
    return onEndedLinkedRecords(setEnded);
  }, []);
  const drawnList = drawn && drawn.identity === identity ? drawn.list : null;
  const list = useMemo(
    () => (drawnList ? withoutDeleted(drawnList, ended.size > 0 ? new Set([...deleting, ...ended]) : deleting) : null),
    [drawnList, deleting, ended],
  );
  const error = failed && failed.identity === identity ? failed.error : null;

  // Where this screen's request count starts. The first reader's screen opened with the list; a later one's when it is made.
  // Keyed by the reader's identity, so a second run of this memo for the same reader (React's StrictMode) keeps the mark.
  const screenStart = useRef<{ at: number; identity: string | null }>({ at: host.requestsSent(), identity: null });
  const reader = useMemo<StakeholderListReader | null>(() => {
    if (!args) return null;
    if (screenStart.current.identity === null) screenStart.current.identity = identity;
    else if (screenStart.current.identity !== identity) screenStart.current = { at: host.requestsSent(), identity };
    // `onRows` of an older reader must never draw into this one's list: each reader writes only while it is the current one.
    const me: { current: boolean } = { current: true };
    const r = createStakeholderListReader(
      stakeholderListDeps(host, {
        qc,
        ...args,
        screenStartedAt: screenStart.current.at,
        ...(args.screenPages ? { screenPages: (v: string) => screenRef.current?.(v) ?? null } : {}),
        ...(args.screenLinks ? { screenLinks: (vs: readonly string[]) => linksRef.current?.(vs) ?? null } : {}),
        // A found record as the screen's full-row page carried it (the record reads' cache): not read again.
        held: (id: string, uri: string) => host.heldRecordOf(qc, id, uri),
      }),
      {
      onRows: (l) => {
        if (me.current) setDrawn({ identity: identity!, list: l });
      },
      ...(linkedNames ? { linkedNames: true } : {}),
    });
    readers.set(r, me);
    return r;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, qc, linkedNames]);

  useEffect(() => {
    if (!reader) return;
    const me = readers.get(reader)!;
    me.current = true;
    const at = identity!;
    reader.read().then(
      (l) => {
        if (me.current) setDrawn({ identity: at, list: l });
      },
      (e: unknown) => {
        if (me.current) setFailed({ identity: at, error: e instanceof Error ? e.message : String(e) });
      },
    );
    return () => {
      me.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reader]);

  const latest = useRef(reader);
  latest.current = reader;
  // A delete's redraw still to come, per deleted id. A person whose linked row became placed here is placed only in the
  // NEXT draw's rows, which the reader's names door reads; so a name asked meanwhile waits for that draw (else it would answer
  // "could not be read", and the list keeps that answer).
  const redraws = useRef(new Map<string, Promise<unknown>>());
  const names = useCallback(async (keys: readonly string[]) => {
    if (redraws.current.size > 0) await Promise.all(redraws.current.values());
    return latest.current ? latest.current.names(keys) : new Map<string, NameState>();
  }, []);
  const more = useCallback(() => latest.current?.more(), []);
  const refresh = useCallback(() => latest.current?.refresh(), []);

  // Follow every record delete of the app. The pane's "Delete record" runs `useDeleteRecord`, the
  // app's one delete door; its key is watched here, ⛔ not a second signal. The row goes when the delete starts (as main's
  // optimistic remove), comes back if the store refuses, and the list is drawn again once it has landed (after the first screen:
  // the first pages, the members not asked yet, and, with what the budget has left, the finds of members this reader was given;
  // the deleted record itself is read and asked for no more).
  useEffect(
    () =>
      watchRecordDeletes(qc).subscribe((id, step) => {
        if (step === "pending") {
          if (!redraws.current.has(id)) redraws.current.set(id, deferred(id));
        } else if (step === "error") {
          settleRedraw(id);
        } else {
          const drawn = latest.current?.refresh() ?? Promise.resolve();
          void drawn.catch(() => undefined).finally(() => settleRedraw(id));
        }
      }),
    [qc],
  );
  // The waits of the names above, released when their redraw is in (or the delete was refused).
  const releases = useRef(new Map<string, () => void>());
  function deferred(id: string): Promise<void> {
    return new Promise<void>((resolve) => releases.current.set(id, resolve));
  }
  function settleRedraw(id: string): void {
    releases.current.get(id)?.();
    releases.current.delete(id);
    redraws.current.delete(id);
  }
  return { list, error, names, more, refresh, identity };
}

/**
 * The list without the deleted records and those taken as ended: a record row is taken out; a linked person's row whose only record is deleted
 * becomes the placed person (no record to open), as the next draw draws it. A linked row with more records (`alsoRecords`) and the
 * holder's own row are kept as they are until the next draw, which comes once the delete has landed. ⛔ Nothing is read here.
 */
function withoutDeleted(list: StakeholderList, gone: ReadonlySet<string>): StakeholderList {
  if (gone.size === 0) return list;
  const hit = (r: StakeholderListRow) => !!r.recordId && gone.has(idFromUri(r.recordId));
  if (!list.rows.some(hit)) return list;
  const rows: StakeholderListRow[] = [];
  for (const r of list.rows) {
    if (!hit(r) || r.kind === "self") rows.push(r);
    else if (r.kind === "both" && r.alsoRecords === 0)
      rows.push({ ...r, kind: "placed", recordId: null, vaultId: null, title: null, recordType: null, linking: false });
    else if (r.kind === "both") rows.push(r);
  }
  return { ...list, rows };
}

/** Whether a reader is still the current one (its hook's effect is mounted). */
const readers = new WeakMap<StakeholderListReader, { current: boolean }>();
