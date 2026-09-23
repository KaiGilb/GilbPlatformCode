import { useCallback, useState } from "react";
import {
  findLiveNotes,
  openNote,
  type NoteLivePage,
  type NoteView,
  type NoteViewDeps,
} from "./viewNote";

export type ViewNoteStatus = "idle" | "finding" | "opening" | "ready" | "error";

/**
 * Thin React hook over {@link findLiveNotes} and {@link openNote}. Holds no
 * vault data of record — status is session chrome; the vault is the store.
 *
 * @param deps Injected host, vaultId, Authorization
 */
export function useViewNote(deps: NoteViewDeps): {
  find: () => Promise<NoteLivePage>;
  open: (id: string) => Promise<NoteView>;
  status: ViewNoteStatus;
  error: string | null;
  page: NoteLivePage | null;
  current: NoteView | null;
} {
  const [status, setStatus] = useState<ViewNoteStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState<NoteLivePage | null>(null);
  const [current, setCurrent] = useState<NoteView | null>(null);

  const find = useCallback(async () => {
    setStatus("finding");
    setError(null);
    try {
      const result = await findLiveNotes(deps);
      setPage(result);
      setStatus("ready");
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : "find failed";
      setError(message);
      setStatus("error");
      throw err;
    }
  }, [deps]);

  const open = useCallback(
    async (id: string) => {
      setStatus("opening");
      setError(null);
      try {
        const result = await openNote(deps, id);
        setCurrent(result);
        setStatus("ready");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "open failed";
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [deps],
  );

  return { find, open, status, error, page, current };
}
