/**
 * What the catalogue says about each listed language (its name, its tag, its countries), read once per entry per session
 * (`readLanguageEntry`).
 *
 * Each entry's info is set AS IT LANDS (one slow entry does not hold back every name), each read is bounded by a timeout and goes
 * through the shared pool, and an entry that could not be read is NAMED to the caller (`failed`) and can be tried again
 * (`retry`): a card says so and never shows it as another language.
 */
import { useCallback, useEffect, useState } from "react";
import { readLanguageEntry, type LanguageEntryInfo } from "./languageEntries";

export interface LanguageInfosState {
  /** The infos read so far (grows as each entry lands). */
  infos: ReadonlyMap<string, LanguageEntryInfo>;
  /** True when every wanted entry has an answer: read, or failed. Nothing wanted is ready at once. */
  ready: boolean;
  /** The wanted entries whose read FAILED (no answer in time, unreachable, refused). Not "unknown": not read. */
  failed: readonly string[];
  /** Try the failed entries again. */
  retry: () => void;
}

/**
 * @returns the infos read so far, whether every entry has been tried, which failed, and a way to try them again.
 *   An entry with no info yet is listed by its address, unmarked; a failed one says so (the caller shows it).
 */
export function useLanguageInfos(uris: readonly string[]): LanguageInfosState {
  const key = uris.join("\n");
  const [infos, setInfos] = useState<ReadonlyMap<string, LanguageEntryInfo>>(() => new Map());
  const [failedMap, setFailedMap] = useState<ReadonlyMap<string, string>>(() => new Map());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    const want = key === "" ? [] : key.split("\n");
    for (const u of want) {
      // A read already made this session answers at once (`readLanguageEntry` keeps what it read).
      readLanguageEntry(u).then(
        (i) => {
          if (live) setInfos((m) => (m.get(u) === i ? m : new Map(m).set(u, i)));
        },
        (e: Error) => {
          if (live) setFailedMap((m) => new Map(m).set(u, e.message));
        },
      );
    }
    return () => {
      live = false;
    };
  }, [key, attempt]);
  const retry = useCallback(() => {
    setFailedMap(new Map());
    setAttempt((a) => a + 1);
  }, []);
  const want = key === "" ? [] : key.split("\n");
  const failed = want.filter((u) => !infos.has(u) && failedMap.has(u));
  return { infos, ready: want.every((u) => infos.has(u) || failedMap.has(u)), failed, retry };
}
