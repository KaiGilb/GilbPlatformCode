// A test double for the app's SkillPickerSheet (src/components/mynet/SkillPickerSheet.tsx lines 40-297): the same dialog, search box, states and
// result buttons, with the live search replaced by the tests' fake `search`. The catalogue's constants are the app's (1, 2, 140 ms, 20).
import { useEffect, useRef, useState } from "react";
import { search } from "./records";
import { skillReferentUri, type ThinSkill } from "../src/thinSkills";

const SKILL_SEARCH_DEBOUNCE_MS = 140;
const SKILL_SEARCH_MIN_CHARS = 1;
const SKILL_SEARCH_LIST_CHARS = 2;
const SKILL_SEARCH_RESULT_CAP = 20;

type LoadState =
  | { kind: "idle" }
  | { kind: "keep-typing"; q: string }
  | { kind: "loading"; q: string }
  | { kind: "results"; q: string; hits: ThinSkill[]; complete: boolean }
  | { kind: "empty"; q: string }
  | { kind: "error"; q: string; message: string };

export function SkillPickerSheet({
  onPick,
  onClose,
  excludeUris = [],
  noun = "skill",
}: {
  onPick: (skill: ThinSkill) => void;
  onClose: () => void;
  excludeUris?: string[];
  noun?: "skill" | "interest";
}) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  const abortRef = useRef<AbortController | null>(null);
  const excluded = useRef(new Set(excludeUris));
  excluded.current = new Set(excludeUris);

  useEffect(() => {
    const needle = q.trim();
    abortRef.current?.abort();
    abortRef.current = null;
    if (needle.length < SKILL_SEARCH_MIN_CHARS) {
      setState({ kind: "idle" });
      return;
    }
    if (needle.length < SKILL_SEARCH_LIST_CHARS) {
      setState({ kind: "keep-typing", q: needle });
      return;
    }
    setState({ kind: "loading", q: needle });
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => {
      void (search(needle, { signal: ac.signal, limit: SKILL_SEARCH_RESULT_CAP }) as Promise<{ skills: ThinSkill[]; complete: boolean }>)
        .then((res) => {
          if (ac.signal.aborted) return;
          const hits = res.skills.filter((s) => !excluded.current.has(s.uri) && !excluded.current.has(s.typeUri));
          if (hits.length === 0) setState({ kind: "empty", q: needle });
          else setState({ kind: "results", q: needle, hits, complete: res.complete });
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          setState({ kind: "error", q: needle, message: e instanceof Error ? e.message : String(e) });
        });
    }, SKILL_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  return (
    <div role="dialog" aria-modal aria-label={`Add ${noun}s`}>
      <button type="button" aria-label="Close" onClick={onClose} />
      <header>
        <h2>Add {noun}s</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          aria-label={noun === "interest" ? "Search interests" : "Search skills"}
        />
      </header>
      <div>
        {state.kind === "keep-typing" ? (
          <p>Keep typing — enter at least {SKILL_SEARCH_LIST_CHARS} characters to see matches.</p>
        ) : state.kind === "loading" ? (
          <p aria-live="polite">Searching the live catalogue…</p>
        ) : state.kind === "error" ? (
          <p role="alert">Skill search failed: {state.message}. This is not a statement that the skill does not exist.</p>
        ) : state.kind === "empty" ? (
          <p>No skills match “{state.q}”. Try another word (any of 29 languages).</p>
        ) : state.kind === "results" ? (
          <ul>
            {state.hits.map((s) => (
              <li key={s.typeUri || s.uri}>
                <button
                  type="button"
                  onClick={() => {
                    void skillReferentUri(s);
                    onPick(s);
                  }}
                >
                  <span>{s.tag}</span>
                  {s.does ? <span>{s.does}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
