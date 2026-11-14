import { useCallback, useEffect, useRef, useState } from "react";
import { accessFailure, defaultShareApi, granteeFromInput, type AccessView, type ShareApi, type ShareLevel } from "./model";
import { namesKey, principalsOf, readNames, writeNames, type KeyValueStore, type RememberedNames } from "./rememberNames";

export interface ShareState {
  /** The read of who has access. */
  status: "loading" | "ready" | "error";
  /** The last read, null before the first one and after a failed one. */
  view: AccessView | null;
  /** The sentence for a failed read. */
  error: string | null;
  /** A request is in flight. Every control is off, and a second submit or remove is ignored. */
  busy: boolean;
  /** Under the form: what was typed is no good, or the share failed. */
  submitProblem: string | null;
  /** On one row: that person could not be removed. */
  removeProblem: { principal: string; message: string } | null;
  /** The last share that worked (a new object each time), for "Shared with …". */
  done: { name: string } | null;
  /** The names remembered for this vault (principal to the name typed when sharing); empty without a store. */
  names: RememberedNames;
}

const START: ShareState = { status: "loading", view: null, error: null, busy: false, submitProblem: null, removeProblem: null, done: null, names: {} };

/**
 * The sheet's state and actions, for a host that draws its own. Reads when it mounts and when `vaultId` changes, and again after every
 * successful share or remove. While a request is in flight a second `submit` or `remove` does nothing (no second request).
 */
export function useVaultShare(vaultId: string, api?: Partial<ShareApi>, opts: { you?: string | undefined; rememberNames?: KeyValueStore | undefined } = {}): {
  state: ShareState;
  submit(text: string, level: ShareLevel): Promise<void>;
  remove(principal: string): Promise<void>;
  reread(): void;
  /** Clear the problem and the "shared" line (when the person types again). */
  clearMessages(): void;
} {
  const [state, setState] = useState<ShareState>(START);
  const apiRef = useRef<ShareApi>(defaultShareApi);
  apiRef.current = { ...defaultShareApi, ...api };
  const storeRef = useRef<KeyValueStore | undefined>(undefined);
  storeRef.current = opts.rememberNames;
  const hasStore = opts.rememberNames !== undefined;
  const youRef = useRef<string | undefined>(undefined);
  youRef.current = opts.you;
  const lastView = useRef<AccessView | null>(null);
  const busy = useRef(false);
  const generation = useRef(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const patch = useCallback((p: Partial<ShareState>) => {
    if (alive.current) setState((s) => ({ ...s, ...p }));
  }, []);

  const read = useCallback(async () => {
    const mine = ++generation.current;
    try {
      const view = await apiRef.current.load(vaultId);
      if (mine === generation.current) {
        lastView.current = view;
        patch({ status: "ready", view, error: null });
      }
    } catch (e) {
      if (mine === generation.current) {
        lastView.current = null;
        patch({ status: "error", view: null, error: accessFailure(e) });
      }
    }
  }, [vaultId, patch]);

  const keep = useCallback(
    (change: (names: RememberedNames) => void) => {
      const store = storeRef.current;
      if (!store) return;
      const key = namesKey(vaultId, youRef.current);
      const names = readNames(store, key);
      change(names);
      writeNames(store, key, names);
      patch({ names });
    },
    [vaultId, patch],
  );

  useEffect(() => {
    lastView.current = null;
    setState(START);
    busy.current = false;
    void read();
  }, [read]);

  // The remembered names for this vault (and this person), read again when either changes.
  useEffect(() => {
    const store = storeRef.current;
    patch({ names: store ? readNames(store, namesKey(vaultId, youRef.current)) : {} });
  }, [vaultId, opts.you, hasStore, patch]);

  const act = useCallback(
    async (work: () => Promise<void>, onFail: (message: string) => Partial<ShareState>): Promise<boolean> => {
      busy.current = true;
      patch({ busy: true });
      try {
        await work();
        await read();
        return true;
      } catch (e) {
        patch(onFail(accessFailure(e)));
        return false;
      } finally {
        busy.current = false;
        patch({ busy: false });
      }
    },
    [patch, read],
  );

  const submit = useCallback(
    async (text: string, level: ShareLevel): Promise<void> => {
      if (busy.current) return;
      const g = granteeFromInput(text);
      if ("problem" in g) {
        patch({ submitProblem: g.problem, done: null });
        return;
      }
      patch({ submitProblem: null, done: null, removeProblem: null });
      const before = principalsOf(lastView.current);
      const ok = await act(async () => {
        await apiRef.current.share(vaultId, g.grantee, level);
        patch({ done: { name: g.name } });
      }, (message) => ({ submitProblem: message }));
      if (!ok || !storeRef.current) return;
      // Which principal is the new person: the one that was not there before, else the one that is exactly the grantee.
      const after = principalsOf(lastView.current) ?? [];
      const fresh = before ? after.filter((k) => !before.includes(k)) : [];
      const who = (fresh.length > 0 ? fresh : after.filter((k) => k === g.grantee))[0];
      if (who !== undefined && who !== youRef.current) keep((names) => { names[who] = g.name; });
    },
    [act, keep, patch, vaultId],
  );

  const remove = useCallback(
    async (principal: string): Promise<void> => {
      if (busy.current) return;
      patch({ removeProblem: null });
      const ok = await act(() => apiRef.current.unshare(vaultId, principal), (message) => ({ removeProblem: { principal, message } }));
      if (ok) keep((names) => { delete names[principal]; });
    },
    [act, keep, patch, vaultId],
  );

  const reread = useCallback(() => {
    void read();
  }, [read]);
  const clearMessages = useCallback(() => patch({ submitProblem: null, done: null }), [patch]);

  return { state, submit, remove, reread, clearMessages };
}
