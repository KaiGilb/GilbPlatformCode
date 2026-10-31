// The box where one place is searched in the catalogue and chosen, for one rung (city, region or country). Nothing is typeable into it as a value.
// Taken from GilbApp `src/components/mynet/PlacePicker.tsx` (commit in the README). Changes are marked CHANGED.
//
// How it works:
//   - an explicit state machine, so "loading" and "no matches" are never the same render;
//   - one AbortController per keystroke: the previous request is aborted and an AbortError is swallowed;
//   - a debounce before the request, not after;
//   - a pick may return a promise, and the box waits for it before it clears itself, so a pick that fails is said and not lost;
//   - a bound value opens for edit with its text selected and is kept: it is replaced only by a pick and cleared only when the person
//     empties the box.
import { useEffect, useId, useRef, useState } from "react";
import {
  GeoUnavailableError,
  resolveGeoGrains,
  searchPlacesInCountryDetailed,
  type GeoPlace,
  type GeoRung,
} from "@kaigilb/gilbplatformcode-geo-catalogue";
import { PlaceHitMeta, usePlaceHitDetails } from "@kaigilb/gilbplatformcode-place-hit-details";

/** The wait after the last key before the catalogue is asked. */
export const PLACE_SEARCH_DEBOUNCE_MS = 140;
/** Below this, idle. */
export const PLACE_SEARCH_MIN_CHARS = 1;
/** Below this, "keep typing": a one-letter place query returns noise, not candidates. */
export const PLACE_SEARCH_LIST_CHARS = 2;
export const PLACE_SEARCH_RESULT_CAP = 8;

/**
 * The visible word for each rung: the same word the box carries, so a notice that names a rung names a control the person can see.
 * Display strings, not terms.
 */
export const RUNG_LABEL: Readonly<Record<GeoRung, string>> = Object.freeze({
  city: "City",
  region: "Region",
  country: "Country",
});

const NO_PLACES: readonly GeoPlace[] = [];

/** CHANGED (F13): said when some matches were left out because no country could be found for them. */
const UNPLACED_SENTENCE = "Some matches could not be placed in a country, so they are not listed.";
/** CHANGED (F15): said when a search fails or is refused. The detail goes to the console, never to the screen. */
const SEARCH_FAILED_SENTENCE = "The place catalogue could not be searched right now.";
/** CHANGED (F15): said when a pick fails for a reason that is not the catalogue's own. */
const PICK_FAILED_SENTENCE = "That place could not be added right now.";
const NOT_A_NEGATIVE = "This is not a statement that the place does not exist.";

/** A candidate plus the rung it lands in. What tells two same-named rows apart (their kind and their container) is read by `usePlaceHitDetails` as it is learned, so the list never waits for it. */
interface Hit {
  place: GeoPlace;
  /**
   * The rung this row will land in, read from the ontology before the person commits to it. `null` is not coerced to the box's own
   * rung here: a type the ontology could not classify is shown as unclassified, because that is what it is. (A pick of such a row is
   * filed in the box's rung; the row says both.)
   */
  landsIn: GeoRung | null;
}

type LoadState =
  | { kind: "idle" }
  | { kind: "keep-typing"; q: string }
  | { kind: "loading"; q: string }
  // CHANGED (F13): `unplaced` travels with the answer, as `capped` does.
  | { kind: "results"; q: string; hits: Hit[]; capped: boolean; unplaced: number }
  | { kind: "empty"; q: string; capped: boolean; unplaced: number }
  | { kind: "error"; q: string; message: string; notAnAbsence: boolean };

export interface PlacePickerProps {
  /** Which catalogue grain this control searches. */
  rung: GeoRung;
  /** Visible label: "City", "Region", "Country". */
  label: string;
  /** The currently bound row, or null. */
  value: GeoPlace | null;
  /**
   * May return a promise, and this control awaits it before clearing itself. The commit behind a pick can fail (the cascade walks the
   * catalogue); the query stays and the reason is said.
   */
  onPick: (place: GeoPlace) => void | Promise<void>;
  onClear: () => void;
  /** When set, only rows inside this country are offered. */
  restrictToCountryId?: string | null;
  /** Set when a coarser pick already filled this rung: shown as where it came from, not a lock. */
  filledByCascade?: boolean;
  /** Set when the row bound to this rung was the person's own pick, made in a different box. */
  foundInBoxLabel?: string | null;
  /** Set on the box the person searched in, when their pick landed at another rung. */
  pickLandedElsewhere?: { label: string; rungLabel: string } | null;
  disabled?: boolean;
  /**
   * This field's own access pill, rendered on the right of the row. A slot, not a level: this control cannot read, choose or write one.
   */
  rungPill?: React.ReactNode;
}

export function PlacePicker({
  rung,
  label,
  value,
  onPick,
  onClear,
  restrictToCountryId = null,
  filledByCascade = false,
  foundInBoxLabel = null,
  pickLandedElsewhere = null,
  disabled = false,
  rungPill = null,
}: PlacePickerProps) {
  const [q, setQ] = useState("");
  /**
   * The bound value is opened for edit, not wiped. Tapping the value does not clear it: it edits in place with the text pre-selected,
   * so the first keystroke replaces it and Escape reverts. A tap is not a decision to delete.
   */
  const [editingBound, setEditingBound] = useState(false);
  const [state, setState] = useState<LoadState>({ kind: "idle" });
  /** True while a pick is being committed: the row is chosen but the cascade has not landed. */
  const [committing, setCommitting] = useState(false);
  const listedPlaces = state.kind === "results" ? state.hits.map((h) => h.place) : NO_PLACES;
  const details = usePlaceHitDetails(listedPlaces);
  const inputId = useId();
  const listId = `${inputId}-results`;
  const acRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  /** The search branch's own box: the input and its option list. */
  const editRootRef = useRef<HTMLDivElement | null>(null);
  /** Set by an option's press, before the deferred blur check reads it. */
  const pickingRef = useRef(false);

  // Pre-select the kept value: the whole text is selected, so the first keystroke replaces it natively (no handler that could fire
  // in the wrong order or miss a paste, an IME commit or a drag-drop).
  useEffect(() => {
    if (!editingBound) return;
    const el = inputRef.current;
    if (!el) return;
    el.focus();
    el.select();
  }, [editingBound]);

  useEffect(() => {
    acRef.current?.abort();
    const needle = q.trim();
    if (needle.length < PLACE_SEARCH_MIN_CHARS) {
      setState({ kind: "idle" });
      return;
    }
    if (needle.length < PLACE_SEARCH_LIST_CHARS) {
      setState({ kind: "keep-typing", q: needle });
      return;
    }
    const ac = new AbortController();
    acRef.current = ac;
    setState({ kind: "loading", q: needle });
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const found = await searchPlacesInCountryDetailed(needle, rung, restrictToCountryId, PLACE_SEARCH_RESULT_CAP, ac.signal);
          if (ac.signal.aborted) return;
          const grains = await resolveGeoGrains(ac.signal);
          if (ac.signal.aborted) return;
          const hits: Hit[] = found.hits.map((place) => ({ place, landsIn: grains.rungOf.get(place.type) ?? null }));
          if (ac.signal.aborted) return;
          setState(
            hits.length === 0
              ? // `capped` and `unplaced` travel with the empty state, so a partial answer is never drawn as "no match".
                { kind: "empty", q: needle, capped: found.capped, unplaced: found.unplaced }
              : { kind: "results", q: needle, hits, capped: found.capped, unplaced: found.unplaced },
          );
        } catch (e) {
          if ((e as { name?: string })?.name === "AbortError") return;
          // CHANGED (F15): a fixed sentence; GilbApp drew the catalogue's message or `String(e)`. The detail is for the console.
          console.error("place search failed", e);
          setState({ kind: "error", q: needle, message: SEARCH_FAILED_SENTENCE, notAnAbsence: true });
        }
      })();
    }, PLACE_SEARCH_DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q, rung, restrictToCountryId]);

  if (value && !editingBound) {
    return (
      <div className="relative flex items-start gap-2 bg-[var(--surface)] py-2.5">
        <div className="min-w-0 flex-1">
          <p className="font-[var(--serif)] text-[13px] italic text-[var(--ink-soft)]">{label}</p>
          <button
            type="button"
            className="mt-0.5 block w-full break-words text-left text-[15px] text-[var(--ink)]"
            data-testid={`place-${rung}-value`}
            // The catalogue entity this value is: kept on the value so a flag (a country) or any later mark can be drawn from the
            // picked row's own reference, never from its label. A data attribute, never text.
            data-place-id={value.id}
            // The accessible name carries both facts: which field, and what it holds now.
            aria-label={`Change ${label} — currently ${value.label}`}
            // Opens for edit and keeps the value. The stored place survives the tap and survives a change of mind.
            onClick={() => {
              setQ(value.label);
              setState({ kind: "idle" });
              setEditingBound(true);
            }}
            disabled={disabled}
          >
            {value.label}
          </button>
          <div className="flex items-center gap-2">
            {/* The three ways a chip can be filled are three different facts: a pick made here, a pick made in another box, a cascade. */}
            {foundInBoxLabel ? (
              <span className="shrink-0 text-[11px] text-[var(--ink-faint)]" data-testid={`place-${rung}-provenance`}>
                found in your {foundInBoxLabel} search
              </span>
            ) : filledByCascade ? (
              <span className="shrink-0 text-[11px] text-[var(--ink-faint)]" data-testid={`place-${rung}-provenance`}>
                filled from your pick
              </span>
            ) : null}
          </div>
        </div>
        {/* This field's own rung pill, on the right. The column is drawn even when the slot is empty so the width does not jump between rows. */}
        <div className="flex shrink-0 flex-col items-end gap-1">{rungPill}</div>
      </div>
    );
  }

  function leaveBoundEditLater() {
    if (!editingBound) return;
    const close = () => {
      setEditingBound(false);
      setQ("");
      setState({ kind: "idle" });
    };
    // An emptied box is the person clearing the field on purpose, and that is honoured at once; an unchanged box is a change of mind.
    if (q.trim() === "") {
      onClear();
      close();
      return;
    }
    window.setTimeout(() => {
      if (pickingRef.current) return;
      const root = editRootRef.current;
      if (root && root.contains(document.activeElement)) return;
      close();
    }, 0);
  }

  return (
    <div className="relative flex items-start gap-2 bg-[var(--surface)] py-2.5">
      <div className="min-w-0 flex-1" ref={editRootRef}>
        <label htmlFor={inputId} className="font-[var(--serif)] block text-[13px] italic text-[var(--ink-soft)]">
          {label}
        </label>
        <input
          id={inputId}
          ref={inputRef}
          type="search"
          role="combobox"
          aria-expanded={state.kind === "results"}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          className="mt-0.5 w-full rounded-md border border-[var(--line)] bg-[var(--surface)] px-2 py-1.5 text-[16px] text-[var(--ink)]"
          placeholder={
            restrictToCountryId && rung !== "country"
              ? `Search ${label.toLowerCase()} in the chosen country…`
              : `Search the place catalogue for a ${label.toLowerCase()}…`
          }
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onBlur={() => leaveBoundEditLater()}
          onKeyDown={(e) => {
            if (e.key === "Escape" && editingBound) {
              setEditingBound(false);
              setQ("");
              setState({ kind: "idle" });
            }
          }}
        />
        {/* The control the person actually used says what happened: their pick went to another field. */}
        {pickLandedElsewhere ? (
          <p className="px-1 py-1 text-xs text-[var(--ink)]" role="status" data-testid={`place-${rung}-landed-elsewhere`}>
            “{pickLandedElsewhere.label}” is held as a {pickLandedElsewhere.rungLabel.toLowerCase()} in the shared catalogue, so your pick went to
            the {pickLandedElsewhere.rungLabel} field above. Search here again if you also keep a {label.toLowerCase()}.
          </p>
        ) : null}
        {/* The listbox role lives on the inner list only: a listbox may own only options, not the loading/empty/error lines. */}
        <div id={listId} onBlur={() => leaveBoundEditLater()}>
          {state.kind === "idle" ? (
            <p className="px-1 py-1 text-xs text-[var(--ink-faint)]">
              Type to search — places come from the shared catalogue, so there is nothing to list until you do.
            </p>
          ) : state.kind === "keep-typing" ? (
            <p className="px-1 py-1 text-xs text-[var(--ink-faint)]">Keep typing…</p>
          ) : state.kind === "loading" ? (
            <p className="px-1 py-1 text-xs text-[var(--ink-faint)]" aria-live="polite">
              Searching the place catalogue…
            </p>
          ) : state.kind === "error" ? (
            <p className="px-1 py-1 text-xs text-[var(--bad)]" role="alert">
              {state.message}
              {state.notAnAbsence ? ` ${NOT_A_NEGATIVE}` : ""}
            </p>
          ) : state.kind === "empty" ? (
            // CHANGED (F13): "no match" is said only when the whole catalogue answer was read and every match was placed.
            state.capped || state.unplaced > 0 ? (
              <p className="px-1 py-1 text-xs text-[var(--ink-faint)]" data-testid={`place-${rung}-partial-note`}>
                {state.capped ? (
                  <>
                    Could not check every match for “{state.q}”
                    {restrictToCountryId ? " inside the country you chose" : ""}. Type more of the name.{" "}
                  </>
                ) : null}
                {state.unplaced > 0 ? <>{UNPLACED_SENTENCE} </> : null}
                {NOT_A_NEGATIVE}
              </p>
            ) : (
              <p className="px-1 py-1 text-xs text-[var(--ink-faint)]">
                No {label.toLowerCase()} matches “{state.q}”
                {restrictToCountryId ? " in the country you chose" : ""}. Try another spelling.
              </p>
            )
          ) : (
            <>
              {/* A listbox owns options and nothing else: the options are direct children, with no list semantics fighting the widget semantics. */}
              <div role="listbox" aria-label={`${label} matches`} className="flex flex-col gap-0.5 py-1">
                {state.hits.map((h) => (
                  <button
                    key={h.place.id}
                    type="button"
                    role="option"
                    aria-selected={false}
                    className="w-full rounded-lg px-3 py-2 text-left hover:bg-[var(--sel)] active:bg-[var(--surface-sunken)]"
                    disabled={committing}
                    // A pointer press must not move the focus off the box, or the blur would close the list before the click lands.
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      pickingRef.current = true;
                      void (async () => {
                        setCommitting(true);
                        try {
                          await onPick(h.place);
                          setQ("");
                          setState({ kind: "idle" });
                          setEditingBound(false);
                        } catch (e) {
                          if ((e as { name?: string })?.name === "AbortError") return;
                          // CHANGED (F15): the catalogue's own sentence names no address and is shown; any other failure is a fixed
                          // sentence, and its detail goes to the console (GilbApp drew `String(e)`).
                          const geo = e instanceof GeoUnavailableError;
                          if (!geo) console.error("place pick failed", e);
                          setState({
                            kind: "error",
                            q: state.kind === "results" ? state.q : q,
                            message: geo ? e.message : PICK_FAILED_SENTENCE,
                            notAnAbsence: geo,
                          });
                        } finally {
                          pickingRef.current = false;
                          setCommitting(false);
                        }
                      })();
                    }}
                  >
                    <span className="block text-sm text-[var(--ink)]">{h.place.label}</span>
                    {/* The row says what it is and where, and where it will go, before the person commits. An unclassifiable type is
                        shown as unclassified, never quietly relabelled to this box's own rung. */}
                    <span className="block text-xs text-[var(--ink-faint)]" data-testid="place-option-lands">
                      <PlaceHitMeta detail={details.get(h.place.id)} fallback={h.landsIn ? RUNG_LABEL[h.landsIn].toLowerCase() : null} />
                      {h.landsIn ? "" : ` · grain not classified — will be filed as ${label}`}
                    </span>
                    {h.landsIn && h.landsIn !== rung ? (
                      <span className="block text-[11px] text-[var(--ink-faint)]">
                        goes in your {RUNG_LABEL[h.landsIn]} field, not {label}
                      </span>
                    ) : null}
                  </button>
                ))}
              </div>
              {state.capped ? (
                <p className="px-1 pb-1 text-xs text-[var(--ink-faint)]" data-testid={`place-${rung}-capped-note`}>
                  Showing the first matches
                  {restrictToCountryId ? " inside the country you chose" : ""}. There are more than this search could check. Type more to narrow.
                </p>
              ) : null}
              {/* CHANGED (F13): matches left out for want of a country are said. */}
              {state.unplaced > 0 ? (
                <p className="px-1 pb-1 text-xs text-[var(--ink-faint)]" data-testid={`place-${rung}-unplaced-note`}>
                  {UNPLACED_SENTENCE}
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>
      {/* The rung pill holds its place while the field is being searched too: a pill that disappeared on tap would tell the person their sharing setting had gone away. */}
      <div className="flex shrink-0 flex-col items-end gap-1">{rungPill}</div>
    </div>
  );
}
