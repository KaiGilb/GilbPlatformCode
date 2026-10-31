// The box where a role's work place is searched in the catalogue and chosen. Taken from GilbApp `src/components/mynet/WorkLocationField.tsx`
// (commit in the README), which was copied from MyNet's. The changes are named in the README under "Changes from GilbApp" and each is marked
// `CHANGED` below. CSS classes are GilbApp's `var(--…)` tokens, as in the source.

// City, town, or municipality from the shared catalogue.
// The stored value is the place's IRI. The name is only what the row shows.

import { useEffect, useRef, useState } from "react";
import { GeoUnavailableError, getPlace, searchPlacesInCountryDetailed, type GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { PlaceHitMeta, usePlaceHitDetails } from "@kaigilb/gilbplatformcode-place-hit-details";

const DEBOUNCE_MS = 140;
const NO_HITS: readonly GeoPlace[] = [];

/** What is known of the stored place's NAME when the role carries no label (CHANGED: GilbApp kept only the name, and "" for every other case). */
type Named =
  | { kind: "none" } // no place stored, or the role carries its own label
  | { kind: "reading" }
  | { kind: "named"; name: string }
  | { kind: "missing" } // the catalogue answered: no such place (404)
  | { kind: "unreadable"; outside: boolean }; // the read failed, or the address is not the catalogue's (nothing was asked)

/** The word for a stored place whose name is not (yet) known. Never the address, never an empty box. */
export const UNNAMED_PLACE = "A place";
export const MISSING_PLACE_SAYS = "That place is no longer in the catalogue.";
export const UNREAD_PLACE_SAYS = "The name of this place could not be read right now. It is still saved.";
export const OUTSIDE_PLACE_SAYS = "This place is not in the place catalogue this app uses, so its name cannot be read. It is still saved.";

export function WorkLocationField({
  placeId,
  label,
  onChange,
}: {
  placeId: string;
  label: string;
  onChange: (place: { placeId: string; placeLabel: string }) => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hits, setHits] = useState<GeoPlace[]>([]);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  // CHANGED (F11): the search says when it could not check every match.
  const [capped, setCapped] = useState(false);
  const [named, setNamed] = useState<Named>({ kind: "none" });
  const acRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!placeId || label) {
      setNamed({ kind: "none" });
      return;
    }
    let cancel = false;
    setNamed({ kind: "reading" });
    void getPlace(placeId)
      .then((place) => {
        if (cancel) return;
        // CHANGED (F9): a 404 (`null`) and a row with no label are told apart from a failed read; GilbApp set "" for all three.
        if (place?.label) setNamed({ kind: "named", name: place.label });
        else setNamed(place === null ? { kind: "missing" } : { kind: "unreadable", outside: false });
      })
      .catch((e: unknown) => {
        if (!cancel) setNamed({ kind: "unreadable", outside: e instanceof GeoUnavailableError && e.reason === "not-geo" });
      });
    return () => {
      cancel = true;
    };
  }, [placeId, label]);

  useEffect(() => {
    acRef.current?.abort();
    const needle = q.trim();
    if (needle.length < 2) {
      setHits([]);
      setBusy(false);
      setFailed(false);
      setCapped(false);
      return;
    }
    const ac = new AbortController();
    acRef.current = ac;
    setBusy(true);
    setFailed(false);
    setCapped(false);
    const timer = setTimeout(() => {
      // CHANGED (F11): GilbApp's `searchPlaces`; the detailed form is the same hits and also says whether the answer is the whole answer.
      void searchPlacesInCountryDetailed(needle, "city", null, 8, ac.signal)
        .then((found) => {
          if (ac.signal.aborted) return;
          setHits(found.hits);
          setCapped(found.capped);
          setBusy(false);
        })
        .catch((err: unknown) => {
          if (ac.signal.aborted) return;
          if (err instanceof DOMException && err.name === "AbortError") return;
          setHits([]);
          setBusy(false);
          setFailed(true);
        });
    }, DEBOUNCE_MS);
    return () => {
      clearTimeout(timer);
      ac.abort();
    };
  }, [q]);

  // s8 card look (Kai 2026-10-16): each row says what it IS and where it is, learned as it is read (bounded, cached).
  const details = usePlaceHitDetails(open ? hits : NO_HITS);
  const hydratedName = named.kind === "named" ? named.name : "";
  // CHANGED (F9): a stored place whose name is not known shows the word for it, not an empty box.
  const unnamedWord = placeId && !label && !hydratedName ? UNNAMED_PLACE : "";
  const shown = open ? q : label || hydratedName || unnamedWord;

  return (
    <div className="flex flex-col gap-0.5 text-xs text-[var(--ink-soft)]">
      <span>Location</span>
      <input
        className="min-h-11 rounded-md border border-[var(--line)] bg-[var(--surface)] px-3 text-base text-[var(--ink)]"
        value={shown}
        aria-label="Role location"
        placeholder="City"
        onFocus={() => {
          setOpen(true);
          // CHANGED (surprise 8): the name a held role shows is the hydrated one (its label is always ""), so a click keeps it. GilbApp set
          // `label` here, which blanked the box over a stored place.
          setQ(label || hydratedName);
        }}
        onChange={(e) => {
          setOpen(true);
          setQ(e.target.value);
          if (e.target.value.trim() === "") onChange({ placeId: "", placeLabel: "" });
        }}
        onBlur={() => {
          setTimeout(() => setOpen(false), 150);
        }}
      />
      {open && busy ? <p className="text-xs text-[var(--ink-faint)]">Searching places…</p> : null}
      {open && failed ? (
        <p className="text-xs text-[var(--bad)]" role="alert">
          The place catalogue could not be reached. That is not a statement that the place does not exist.
        </p>
      ) : null}
      {open && !busy && !failed && q.trim().length >= 2 && hits.length === 0 ? (
        // CHANGED (F11): a partial answer is not "no match".
        capped ? (
          <p className="text-xs text-[var(--ink-faint)]">
            Could not check every match for “{q.trim()}”. Type more of the name. This is not a statement that the place does not exist.
          </p>
        ) : (
          <p className="text-xs text-[var(--ink-faint)]">No city, town, or municipality matches.</p>
        )
      ) : null}
      {open && hits.length > 0 ? (
        <>
          {/* The options are DIRECT children of the listbox, as in the address pickers (a listbox owns options and nothing else). */}
          <div className="overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface)]" role="listbox" aria-label="Role location matches">
            {hits.map((hit) => (
              <button
                key={hit.id}
                type="button"
                role="option"
                aria-selected={false}
                className="flex min-h-11 w-full flex-col justify-center px-3 py-1.5 text-left"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange({ placeId: hit.id, placeLabel: hit.label });
                  setQ(hit.label);
                  setOpen(false);
                  setHits([]);
                }}
              >
                <span className="text-base text-[var(--ink)]">{hit.label}</span>
                {/* What it IS and WHERE (Kai 2026-10-16: "what Oslo, the city in Norway or some town in USA"). */}
                <span className="text-xs text-[var(--ink-faint)]" data-testid="place-hit-meta">
                  <PlaceHitMeta detail={details.get(hit.id)} />
                </span>
              </button>
            ))}
          </div>
          {capped ? (
            <p className="text-xs text-[var(--ink-faint)]" data-testid="work-location-capped-note">
              Showing the first matches. There are more than this search could check. Type more to narrow.
            </p>
          ) : null}
        </>
      ) : null}
      {/* CHANGED (F9, name rule): GilbApp wrote the place's whole catalogue address here as text for assistive tech (`sr-only`). What is said instead is
          why the box shows no name, when it does not. */}
      {!open && placeId && !label && named.kind === "missing" ? (
        <p className="text-xs text-[var(--ink-faint)]" role="status" data-testid="work-location-missing">
          {MISSING_PLACE_SAYS}
        </p>
      ) : null}
      {!open && placeId && !label && named.kind === "unreadable" ? (
        <p className="text-xs text-[var(--ink-faint)]" role="status" data-testid="work-location-unread">
          {named.outside ? OUTSIDE_PLACE_SAYS : UNREAD_PLACE_SAYS}
        </p>
      ) : null}
    </div>
  );
}
