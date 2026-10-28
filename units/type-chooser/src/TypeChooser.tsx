// A search-and-pick list for a GilbVeda type: ONE control, every place a record is created.
//
// ── SEARCH-FIRST, by construction ───────────────────────────────────────────────────────
// The corpus is designed to reach hundreds of thousands of public terms, so this control never
// assumes it can render "all of them". It renders ONLY what the `search` prop hands back for the
// current query, in a bounded, scrolling list. Where types come from is the host's `search`, never
// this file and never a create surface.
//
// ── It states its own reach, and the reach is MEASURED, not asserted ────────────────────
// The reach note is always visible, not just on a miss, and it comes back FROM THE SEARCH with the
// results it describes ({@link TypeSearchResult.reach}) rather than being a constant this file
// prints. A hard-coded sentence keeps claiming the ontology was searched while it is down, which
// is the same class of lie as an empty list that looks exactly like "there are only three types".
// `degraded` keeps the two empty states apart: "the ontology says no such term" and "the ontology
// could not be asked" never render as the same sentence.
//
// Mints nothing. The person can only PICK a TypeOption the search returned; there is no "create
// this type" affordance and no free-typed CURIE path. Typing a name that matches nothing yields an
// honest empty state, never a new term.

import { useContext, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { TermDefinitionContext, TypeTermPopover, type TermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { CreatePlane, TypeOption, TypeSearchFn } from "./types";
import { LIVE_TERM_LIMIT, optionMatchesPlane } from "./typeSearch";
const PLANES: { id: CreatePlane; label: string }[] = [
  { id: "things", label: "Things" },
  { id: "function", label: "Functions" },
  { id: "value", label: "Values" },
  { id: "all", label: "All" },
];

const PLACEHOLDER: Record<CreatePlane, string> = {
  things: "Search things — a boat, a note, a chair, a person…",
  function: "Search functions…",
  value: "Search values…",
  all: "Search all types, functions and values…",
};

/** How long typing settles before the search runs — one query per pause, not per keystroke. */
const SEARCH_DEBOUNCE_MS = 140;

/** The search itself threw. Distinct from the binding's own `degraded` (which still answered). */
const SEARCH_FAILED_REACH =
  "The type search failed, so nothing could be looked up. This is not a statement that the type does not exist.";

export interface TypeChooserProps {
  /** The currently-chosen type id, when the host holds a selection (the dialog). Omit in
   *  act-on-pick hosts (the menu), where nothing stays selected. */
  value?: string | null;
  /**
   * The currently-chosen option itself, PINNED to the top of the list when the live search
   * has not returned it.
   *
   * Without this the dialog could not show what it was about to create: the blank query
   * answers with the host's few shipped types (a short list, not a long one), so a live
   * GilbVeda type carried in from another surface appeared NOWHERE — the person picked `Rule`, opened
   * the form, and saw four unselected rows none of which was theirs. `value` alone cannot fix
   * that: highlighting a row that is not rendered highlights nothing.
   */
  pinned?: TypeOption | null;
  /** Called with the picked option. The host decides what picking MEANS. */
  onPick: (option: TypeOption) => void;
  /** The search binding: a query in, the options and the reach they cover out. Required. */
  search: TypeSearchFn;
  /**
   * What typing will reach, said before the first answer has come back (and so while the box is
   * still blank). The chooser shows it as the reach note until a search answers; after that the
   * answer's own `reach` replaces it.
   */
  blankReach: string;
  /**
   * Draws the icon of an option, in the row and in the detail view; `className` is the size and
   * colour classes the chooser wants. Absent: nothing is drawn where the icon was.
   */
  renderTypeIcon?: (option: TypeOption, className: string) => ReactNode;
  /** Label above the search box. */
  label?: string;
  /** Focus the search box on mount (the menu wants this; the dialog focuses its name field). */
  autoFocus?: boolean;
  disabled?: boolean;
  /** Distinguishes this instance's ids when two are ever on screen at once. */
  idPrefix?: string;
  /** Max list height in px before it scrolls. Ignored when {@link fill} is set. */
  maxListHeight?: number;
  /**
   * Take ALL the room the host gives, instead of a fixed number of pixels.
   *
   * A search-first picker clipped to ~2 result rows
   * inside a tall, mostly-empty menu defeats its own purpose. The cause is structural — a
   * FIXED-height child (this list) inside a FLEXIBLE parent (the menu) — so lifting the
   * menu's own ceiling alone would have changed nothing.
   *
   * When set, the root becomes a flex column that shrinks to its host and the RESULT LIST is
   * the flex-grow child, so it absorbs every pixel the host has left after the search box and
   * the scope note. The host must be a flex column with a bounded height and this must be its
   * growing child. `min-h-0` throughout is what actually permits shrinking — without it a
   * flex item refuses to go below its content height and the clipping returns.
   */
  fill?: boolean;
  /**
   * Which plane tabs to offer. Default is Things / Functions / Values / All — the node-create
   * range. A host that only wants Types (in-app vault mint) passes `["things"]` and the tabs
   * hide, so the person is not invited to pick a Function as a vault purpose-type.
   */
  planes?: readonly CreatePlane[];
  /** Empty-list copy when the query is blank. Default keeps the node-create wording. */
  blankEmptyLabel?: string;
  /** Record-create "name only" hint. Off for surfaces that are not minting a record. */
  showSpecHint?: boolean;
  /**
   * Search-box placeholder. Default is the plane wording ("Search things — a boat…").
   * A vault-purpose host overrides this so the box reads as a Type search, not a
   * thing-to-put-in-the-vault search.
   */
  searchPlaceholder?: string;
  /**
   * Replaces the search-box class string. Default keeps the quiet 1px `--line`
   * used in a menu. A host can pass a 2px idle rectangle so the field is
   * visible at rest (otherwise it looks edgeless).
   */
  searchClassName?: string;
  /**
   * Host-supplied options that are not GilbVeda search results (e.g. "File" in the
   * connected-create dialog, which opens the upload). Shown on a blank query, and on a query that
   * matches their label. ⛔ Never used to fake a search answer: they are the host's own acts.
   */
  extraOptions?: readonly TypeOption[];
}

export function TypeChooser({
  value,
  onPick,
  search,
  blankReach,
  renderTypeIcon,
  label = "Type",
  autoFocus = false,
  disabled = false,
  idPrefix,
  pinned = null,
  maxListHeight = 176,
  fill = false,
  planes,
  blankEmptyLabel,
  showSpecHint = true,
  searchPlaceholder,
  searchClassName,
  extraOptions,
}: TypeChooserProps) {
  const read = useContext(TermDefinitionContext);
  if (!read) throw new Error("type-chooser: wrap the app in <TermDefinitionContext.Provider value={readTermDefinition}>");
  const reactId = useId();
  const base = idPrefix ?? `type-chooser-${reactId}`;
  const offeredPlanes = planes && planes.length > 0 ? planes : PLANES.map((p) => p.id);
  const showPlaneTabs = offeredPlanes.length > 1;
  const [query, setQuery] = useState("");
  const [plane, setPlane] = useState<CreatePlane>(offeredPlanes[0] ?? "things");
  const [options, setOptions] = useState<readonly TypeOption[]>([]);
  // What the LAST answer actually covered, straight from the search. Rendered verbatim, so
  // the reach on screen always describes the list on screen — a static sentence would go on
  // claiming GilbVeda was searched during an outage.
  const [reach, setReach] = useState<string>(blankReach);
  // The catalogue could not be asked. Held apart from `options.length === 0` because those
  // two states MEAN different things and only one of them is an absence.
  const [degraded, setDegraded] = useState(false);
  const [pending, setPending] = useState(true);
  /** The row the person just picked — default selected type still shows the list. */
  const [inspected, setInspected] = useState<TypeOption | null>(null);
  // THREE states, never two. "could not reach the term" and "the term has no
  // definition" are different claims and the UI must not merge them — see the type-term-popover unit.
  const [definition, setDefinition] = useState<TermDefinition | null>(null);
  const [definitionPending, setDefinitionPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // ONE search per settled query. The `live` flag drops a stale in-flight answer so a slow
  // reply for "ta" can never overwrite the list for "task" — a real hazard now that this seam
  // IS bound to a network search.
  useEffect(() => {
    let live = true;
    setPending(true);
    const t = setTimeout(() => {
      void search(query)
        .then((res) => {
          if (!live) return;
          setOptions(res.options);
          setReach(res.reach);
          setDegraded(res.degraded);
          setPending(false);
        })
        .catch(() => {
          if (!live) return;
          // A failed search shows NOTHING and says so — it never falls back to a list the
          // search did not return, and it never lets the empty state read as "no such type".
          setOptions([]);
          setReach(SEARCH_FAILED_REACH);
          setDegraded(true);
          setPending(false);
        });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [query, search]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    setInspected(null);
  }, [query]);

  const q = query.trim();
  const inPlane = options.filter((o) => optionMatchesPlane(o.kind, plane));
  // The chosen option always renders, even when this query did not return it.
  const extras = (extraOptions ?? []).filter(
    (o) =>
      optionMatchesPlane(o.kind, plane) &&
      !inPlane.some((x) => x.id === o.id) &&
      (q === "" || o.label.toLowerCase().includes(q.toLowerCase())),
  );
  const listed = [...inPlane, ...extras];
  const shown =
    pinned && optionMatchesPlane(pinned.kind, plane) && !listed.some((o) => o.id === pinned.id)
      ? [pinned, ...listed]
      : listed;
  const truncatedReach = /More than \d+ GilbVeda terms match/.test(reach);
  const showReach = !inspected && (degraded || !truncatedReach || shown.length >= LIVE_TERM_LIMIT);

  const pick = (o: TypeOption) => {
    onPick(o);
    setInspected(o);
    if (o.definition) {
      setDefinition({ state: "defined", does: o.definition });
      setDefinitionPending(false);
      return;
    }
    setDefinition(null);
    setDefinitionPending(true);
    void read(o.typeName).then((d) => {
      setDefinition(d);
      setDefinitionPending(false);
    });
  };

  return (
    <div
      className={"flex flex-col gap-1" + (fill ? " flex-1 min-h-0" : "")}
      data-testid="type-chooser"
    >
      {/* The caption is `--ink-soft`, not `--ink-faint`: it labels a required control, and a
          faint label over a strong field reads as decoration for something optional. */}
      <label
        htmlFor={`${base}-search`}
        className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-soft)]"
      >
        {label}
      </label>
      {showPlaneTabs && (
      <div
        className="flex flex-wrap gap-1"
        role="tablist"
        aria-label="What to create"
        data-testid="type-chooser-plane"
      >
        {PLANES.filter((p) => offeredPlanes.includes(p.id)).map((p) => (
          <button
            key={p.id}
            type="button"
            role="tab"
            aria-selected={plane === p.id}
            data-testid={`type-chooser-plane-${p.id}`}
            disabled={disabled}
            onClick={() => setPlane(p.id)}
            className={
              "min-h-[32px] px-2.5 rounded-full border text-[12px] font-semibold " +
              (plane === p.id
                ? "border-[var(--accent)] bg-[var(--sel)] text-[var(--ink)]"
                : "border-[var(--line)] bg-[var(--surface)] text-[var(--ink-soft)] hover:bg-[var(--sel)]")
            }
          >
            {p.label}
          </button>
        ))}
      </div>
      )}
      <input
        id={`${base}-search`}
        ref={inputRef}
        type="search"
        role="searchbox"
        value={query}
        disabled={disabled}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={searchPlaceholder ?? PLACEHOLDER[plane]}
        autoComplete="off"
        aria-controls={`${base}-list`}
        data-testid="type-chooser-search"
        className={
          searchClassName ??
          // THE EMPHASIS IS AT REST, AND THAT IS THE WHOLE POINT: the field should pop while it is
          // NOT selected, so it is easy to see and inviting to use.
          //
          // The wrong way round is to idle on `--ink-ghost` — a muted grey — and only turn `--accent`
          // on FOCUS. A field is focused precisely when the person has ALREADY found it; spending
          // the loud colour there pays attention to someone who no longer needs it, and leaves the
          // field quiet during the one moment that decides whether they see it at all. An
          // invitation that only appears after you accept it is not an invitation.
          //
          // So: `--accent` at rest, which is what draws the eye and says "fill me in". Focus
          // then does NOT need to shout — it only needs to be DISTINGUISHABLE, which is what
          // the `--focus` ring is for (that token exists for exactly this). Removing the
          // focus indicator entirely would trade one defect for an accessibility one.
          // All tokens; no literal colour.
          "w-full h-11 min-h-[44px] shrink-0 px-3 rounded-[var(--r-md)] border-2 border-[var(--accent)] bg-[var(--surface)] text-[13px] text-[var(--ink)] placeholder:text-[var(--ink-ghost)] focus:outline-none focus:shadow-[0_0_0_3px_var(--focus)]"
        }
        // The host may be a menu that closes on stray keys — keep them local.
        onKeyDown={(e) => e.stopPropagation()}
        onClick={(e) => e.stopPropagation()}
      />
      <div
        id={`${base}-list`}
        role="listbox"
        aria-label={
          plane === "things"
            ? "Things"
            : plane === "function"
              ? "Functions"
              : plane === "value"
                ? "Values"
                : "Types, functions and values"
        }
        data-testid="type-chooser-list"
        className={
          "rounded-[var(--r-sm)] border border-[var(--line-2)] bg-[var(--surface)] overflow-y-auto p-0.5" +
          // `fill`: grow into the host's leftover room. `min-h-0` is load-bearing — without it
          // this flex item will not shrink below its content height and clips again.
          (fill ? " flex-1 min-h-0" : "")
        }
        style={fill ? undefined : { maxHeight: maxListHeight }}
      >
        {inspected ? (
          <div className="p-2 flex flex-col gap-2" data-testid="type-chooser-detail">
            <div className="flex items-start gap-2">
              {renderTypeIcon?.(inspected, "w-4 h-4 shrink-0 mt-0.5 text-[var(--accent)]")}
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-[var(--ink)]">{inspected.label}</p>
                {inspected.typeName.toLowerCase() !== inspected.label.toLowerCase().replace(/\s+/g, "") && (
                  <p className="font-mono text-[10px] text-[var(--ink-faint)]">t:{inspected.typeName}</p>
                )}
              </div>
              <button
                type="button"
                data-testid="type-chooser-detail-back"
                disabled={disabled}
                onClick={() => setInspected(null)}
                aria-label="Back to search results"
                className="shrink-0 w-8 h-8 rounded-[var(--r-sm)] text-[18px] leading-none text-[var(--ink-soft)] hover:bg-[var(--sel)] hover:text-[var(--ink)]"
              >
                ×
              </button>
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-wide text-[var(--ink-faint)]">
                Definition
              </p>
              {definitionPending ? (
                <p className="mt-1 text-[13px] text-[var(--ink-faint)]">Loading definition…</p>
              ) : definition?.state === "defined" ? (
                <p
                  className="mt-1 text-[13px] text-[var(--ink-soft)] leading-snug whitespace-pre-wrap"
                  data-testid="type-chooser-definition"
                >
                  {definition.does}
                </p>
              ) : definition?.state === "unreachable" ? (
                // We could NOT read the term. Say that, and never claim it is undefined
                // — the term may be fully defined at its own host.
                <p
                  className="mt-1 text-[13px] text-[var(--ink-faint)]"
                  data-testid="type-chooser-definition-unreachable"
                  title={definition.reason}
                >
                  Definition could not be loaded — this says nothing about the term.
                </p>
              ) : (
                <p
                  className="mt-1 text-[13px] text-[var(--ink-faint)]"
                  data-testid="type-chooser-definition-absent"
                >
                  No definition on this term.
                </p>
              )}
            </div>
          </div>
        ) : pending ? (
          <p className="px-2 py-2 text-[12px] text-[var(--ink-faint)]">Searching…</p>
        ) : shown.length === 0 ? (
          <p className="px-2 py-2 text-[12px] text-[var(--ink-faint)]" data-testid="type-chooser-empty">
            {/* An empty list from a catalogue that ANSWERED is an absence and may be stated as
                one. An empty list from a catalogue that could not be REACHED is a transport
                state, and saying "no type matches" there teaches the person a term that does
                exist does not. */}
            {degraded
              ? "GilbVeda could not be searched just now, so nothing can be shown."
              : q
                ? plane === "things"
                  ? showPlaneTabs
                    ? `No thing matches “${q}”. Try Functions, Values, or All.`
                    : `No type matches “${q}”.`
                  : plane === "all"
                    ? `No type, function or value matches “${q}”.`
                    : `No ${plane} matches “${q}”.`
                : blankEmptyLabel
                  ? blankEmptyLabel
                  : plane === "things"
                    ? "No thing is available."
                    : "Type to search."}
          </p>
        ) : (
          shown.map((o, i) => {
            const selected = !!value && o.id === value;
            // GilbVeda terms are Type · Function · Value, and a person may pick "a type, or a
            // function". They are DIFFERENT kinds of thing, so the list says where one ends
            // and the other begins rather than leaving the person to infer it from the names.
            const startsFunctions =
              plane === "all" && o.kind === "function" && shown[i - 1]?.kind !== "function";
            const startsValues =
              plane === "all" && o.kind === "value" && shown[i - 1]?.kind !== "value";
            return (
              <div key={o.id}>
                {startsFunctions && (
                  <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-ghost)]">
                    Functions
                  </p>
                )}
                {startsValues && (
                  <p className="px-2 pt-2 pb-1 text-[10px] font-bold uppercase tracking-wide text-[var(--ink-ghost)]">
                    Values
                  </p>
                )}
              <div className="flex items-center">
              <button
                type="button"
                role="option"
                aria-selected={selected}
                disabled={disabled}
                data-testid={`type-chooser-option-${o.id}`}
                onClick={() => pick(o)}
                className={
                  // At least 44px: a search result is no less a finger target than a menu entry.
                  "min-w-0 flex-1 flex items-center gap-2 min-h-[44px] px-2 rounded-[var(--r-sm)] text-left text-[13px] " +
                  (selected
                    ? "bg-[var(--sel)] text-[var(--ink)] font-semibold"
                    : "text-[var(--ink-soft)] hover:bg-[var(--sel)] hover:text-[var(--ink)]")
                }
              >
                {renderTypeIcon?.(
                  o,
                  "w-4 h-4 shrink-0 " + (selected ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"),
                )}
                <span className="min-w-0 flex-1 truncate">{o.label}</span>
                {/* THE TERM THAT WILL ACTUALLY BE WRITTEN, shown when it is not simply the
                    label. A host's own labels do not always match their GilbVeda anchor —
                    a row reading "Contact" may write `t:Person`, and "Note" `t:NoteDocument` —
                    so a person choosing by label alone could not tell what their record would
                    BE. A rename is not a licence to hide the term. */}
                {o.typeName.toLowerCase() !== o.label.toLowerCase().replace(/\s+/g, "") && (
                  <span className="shrink-0 font-mono text-[10px] text-[var(--ink-faint)]">
                    t:{o.typeName}
                  </span>
                )}
                {/* A type with no shipped field spec creates with NAME + TYPE and nothing
                    else. Saying so before the pick is the difference between a plain form and
                    a form that looks broken. */}
                {showSpecHint && !o.spec && (
                  <span className="shrink-0 text-[10px] text-[var(--ink-ghost)]">name only</span>
                )}
              </button>
              {/* The type-link trigger sits beside the option button (a button may not nest in a button).
                  It opens the GilbVeda definition popover and never picks the row. Every row has one,
                  Person and Task included: the t: name stays visible inside the row text. */}
              <TypeTermPopover
                typeName={o.typeName}
                label={o.label}
                triggerTestId={`type-chooser-term-${o.id}`}
                popoverTestId="type-chooser-term-popover"
                ariaLabel={`About t:${o.typeName}`}
                className="shrink-0 min-h-[44px] px-2 text-[12px] text-[var(--accent)]"
              >
                ↗
              </TypeTermPopover>
              </div>
              </div>
            );
          })
        )}
      </div>
      {showReach && (
        <span
          className={
            "shrink-0 text-[10.5px] " +
            (degraded ? "text-[var(--ink-faint)]" : "text-[var(--ink-ghost)]")
          }
          data-testid="type-chooser-scope"
        >
          {reach}
        </span>
      )}
    </div>
  );
}
