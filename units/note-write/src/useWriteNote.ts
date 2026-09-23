import { useCallback, useState } from "react";
import {
  writeNote,
  type NoteWriteDeps,
  type NoteWriteInput,
  type NoteWriteResult,
} from "./writeNote";

export type WriteNoteStatus = "idle" | "saving" | "saved" | "error";

/**
 * Thin React hook over {@link writeNote}. Holds no vault data of record —
 * status is session chrome; the vault is the store.
 *
 * @param deps Injected host, vaultId, Authorization
 */
export function useWriteNote(deps: NoteWriteDeps): {
  write: (input: NoteWriteInput) => Promise<NoteWriteResult>;
  status: WriteNoteStatus;
  error: string | null;
  last: NoteWriteResult | null;
} {
  const [status, setStatus] = useState<WriteNoteStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [last, setLast] = useState<NoteWriteResult | null>(null);

  const write = useCallback(
    async (input: NoteWriteInput) => {
      setStatus("saving");
      setError(null);
      try {
        const result = await writeNote(deps, input);
        setLast(result);
        setStatus("saved");
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : "write failed";
        setError(message);
        setStatus("error");
        throw err;
      }
    },
    [deps],
  );

  return { write, status, error, last };
}
