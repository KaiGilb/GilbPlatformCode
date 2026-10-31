// Skill picker: live corpus search. Search-first over ~16k ESCO concepts x 29 languages via
// GET /base/search?match=prefix on the ontology vault (`searchSkillsRemote.ts`).
//
// Hierarchy browse is retired: no server path emits skill.path today, and leaving it half-wired is not acceptable.
// Offline thin-catalog browsing is retired with it.
//
// "interest" uses the same search and only changes the words (`noun`): the interest's range is one ontology term (a skill
// they want to learn, a type, or a knowledge area), the same catalogue.
// The sheet is `fixed inset-0`; the caller puts it into the document body (a portal) when it is opened.

import { useEffect, useRef, useState } from "react";
import { Button } from "@kaigilb/gilbplatformcode-button";
import { skillReferentUri, type ThinSkill } from "@kaigilb/gilbplatformcode-contact-rows";
import { formatResultTotal, type ResultTotal } from "@kaigilb/gilbplatformcode-result-total";
import {
  searchSkillsRemote,
  SKILL_SEARCH_DEBOUNCE_MS,
  SKILL_SEARCH_LIST_CHARS,
  SKILL_SEARCH_MIN_CHARS,
  SKILL_SEARCH_RESULT_CAP,
  SkillSearchError,
} from "./searchSkillsRemote";

type LoadState =
  | { kind: "idle" }
  | { kind: "keep-typing"; q: string }
  | { kind: "loading"; q: string }
  | { kind: "results"; q: string; hits: ThinSkill[]; total: ResultTotal | null; complete: boolean }
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
  /** "interest" uses the same search and only changes the words. */
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
    // 1 char: keep-typing (relevance, not speed). List from 2–3 characters.
    if (needle.length < SKILL_SEARCH_LIST_CHARS) {
      setState({ kind: "keep-typing", q: needle });
      return;
    }

    setState({ kind: "loading", q: needle });
    const ac = new AbortController();
    abortRef.current = ac;
    const timer = setTimeout(() => {
      void searchSkillsRemote(needle, {
        signal: ac.signal,
        limit: SKILL_SEARCH_RESULT_CAP,
      })
        .then((res) => {
          if (ac.signal.aborted) return;
          const hits = res.skills.filter(
            (s) => !excluded.current.has(s.uri) && !excluded.current.has(s.typeUri),
          );
          if (hits.length === 0) {
            setState({ kind: "empty", q: needle });
          } else {
            setState({
              kind: "results",
              q: needle,
              hits,
              total: res.total,
              complete: res.complete,
            });
          }
        })
        .catch((e: unknown) => {
          if (ac.signal.aborted) return;
          if (e instanceof DOMException && e.name === "AbortError") return;
          const message =
            e instanceof SkillSearchError
              ? e.message
              : e instanceof Error
                ? e.message
                : String(e);
          setState({ kind: "error", q: needle, message });
        });
    }, SKILL_SEARCH_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-x-hidden bg-black/40"
      role="dialog"
      aria-modal
      aria-label={`Add ${noun}s`}
    >
      <button type="button" className="min-h-[15%] flex-1" aria-label="Close" onClick={onClose} />
      {/* w-full + overflow-x-hidden: iPhone mini must not get horizontal scroll on long "does". */}
      <div className="max-h-[85dvh] w-full max-w-full overflow-x-hidden overflow-y-hidden rounded-t-2xl bg-[var(--surface)] shadow-xl">
        <header className="border-b border-[var(--line)] px-4 py-3">
          <div className="flex min-w-0 items-start justify-between gap-2">
            <div className="min-w-0 flex-1">
              <h2 className="font-[var(--serif)] text-base font-bold text-[var(--ink)]">Add {noun}s</h2>
              <p className="text-xs text-[var(--ink-faint)]">
                Search the live skill catalogue (~16,000 concepts, 29 languages).
              </p>
            </div>
            <Button variant="secondary" className="shrink-0" onClick={onClose}>
              Close
            </Button>
          </div>
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={noun === "interest" ? "Search interests…" : "Search skills (e.g. sykepleie, krankenpflege, phonetics)…"}
            className="mt-3 w-full min-w-0 rounded-lg border border-[var(--line)] bg-[var(--surface-sunken)] px-3 py-2.5 text-base text-[var(--ink)] outline-none focus:border-[var(--accent)]"
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label={noun === "interest" ? "Search interests" : "Search skills"}
          />
        </header>

        <div className="max-h-[60dvh] overflow-x-hidden overflow-y-auto px-2 py-2">
          {state.kind === "idle" ? (
            <EmptySearchPrompt onExample={(word) => setQ(word)} />
          ) : state.kind === "keep-typing" ? (
            <p className="p-4 text-sm text-[var(--ink-faint)]">
              Keep typing — enter at least {SKILL_SEARCH_LIST_CHARS} characters to see matches.
            </p>
          ) : state.kind === "loading" ? (
            <p className="p-4 text-sm text-[var(--ink-faint)]" aria-live="polite">
              Searching the live catalogue…
            </p>
          ) : state.kind === "error" ? (
            <p className="p-4 text-sm text-[var(--bad)]" role="alert">
              Skill search failed: {state.message}. This is not a statement that the skill does
              not exist.
            </p>
          ) : state.kind === "empty" ? (
            <p className="p-4 text-sm text-[var(--ink-faint)]">
              No skills match “{state.q}”. Try another word (any of 29 languages).
            </p>
          ) : (
            <SearchResults
              hits={state.hits}
              query={state.q}
              total={state.total}
              complete={state.complete}
              onPick={(s) => {
                // Preserve the {tag, typeUri} contract — callers use skillReferentUri.
                void skillReferentUri(s);
                onPick(s);
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptySearchPrompt({ onExample }: { onExample: (word: string) => void }) {
  const examples = ["sykepleie", "krankenpflege", "phonetics", "project", "sell"] as const;
  return (
    <div className="flex flex-col gap-3 px-4 py-8 text-center">
      <p className="text-sm text-[var(--ink)]">
        Type a word to search the live skill catalogue — nothing is listed until you type.
      </p>
      <p className="text-xs text-[var(--ink-faint)]">
        Try{" "}
        {examples.map((w, i) => (
          <span key={w}>
            {i > 0 ? ", " : null}
            <button
              type="button"
              className="font-medium text-[var(--ink)] underline-offset-2 hover:underline"
              onClick={() => onExample(w)}
            >
              {w}
            </button>
          </span>
        ))}
        .
      </p>
      <p className="text-xs text-[var(--ink-faint)]">
        Cross-language: Norwegian, German, Greek and more match the same concepts.
      </p>
    </div>
  );
}

function SearchResults({
  hits,
  query,
  total,
  complete,
  onPick,
}: {
  hits: ThinSkill[];
  query: string;
  /** The DISCLOSED corpus total: figure AND kind, or null for none. */
  total: ResultTotal | null;
  complete: boolean;
  onPick: (s: ThinSkill) => void;
}) {
  // THE ONLY PLACE A PLATFORM TOTAL REACHES A HUMAN EYE in this unit. `formatResultTotal`
  // is the only route from a total to text, so a BOUND renders as "more than 200" and
  // can never be printed as a bare numeral. A read with no total prints no total —
  // not a zero, and not `hits.length` wearing the corpus total's name.
  const totalPhrase = formatResultTotal(total);
  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3 pb-2">
      <p className="px-3 py-1 text-[11px] font-medium uppercase tracking-wide text-[var(--ink-faint)]">
        {hits.length === SKILL_SEARCH_RESULT_CAP
          ? totalPhrase === null
            ? `Top ${SKILL_SEARCH_RESULT_CAP} matches`
            : `Top ${SKILL_SEARCH_RESULT_CAP} of ${totalPhrase} matches`
          : `${hits.length} match${hits.length === 1 ? "" : "es"}`}
        {complete ? " · complete" : " · type more to narrow"}
        {" · live corpus"}
      </p>
      <ul className="flex min-w-0 max-w-full flex-col gap-1 px-1">
        {hits.map((s) => (
          <SkillRow key={s.typeUri || s.uri} skill={s} onPick={onPick} />
        ))}
      </ul>
      {/* Reality disclosure: empty is not "skill does not exist" when incomplete. */}
      {!complete && hits.length > 0 ? (
        <p className="px-3 text-xs text-[var(--ink-faint)]">
          Showing a page of matches for “{query}”. Add characters to narrow.
        </p>
      ) : null}
    </div>
  );
}

function SkillRow({
  skill,
  onPick,
}: {
  skill: ThinSkill;
  onPick: (s: ThinSkill) => void;
}) {
  return (
    <li className="min-w-0 max-w-full">
      <button
        type="button"
        className="w-full min-w-0 max-w-full rounded-xl px-3 py-3 text-left hover:bg-[var(--sel)] active:bg-[var(--surface-sunken)]"
        onClick={() => onPick(skill)}
      >
        <span className="font-[var(--serif)] block min-w-0 break-words text-sm font-semibold text-[var(--ink)]">
          {skill.tag}
        </span>
        {skill.does ? (
          <span className="mt-1 block min-w-0 whitespace-normal break-words text-xs leading-relaxed text-[var(--ink-faint)] [overflow-wrap:anywhere]">
            {skill.does}
          </span>
        ) : null}
      </button>
    </li>
  );
}
