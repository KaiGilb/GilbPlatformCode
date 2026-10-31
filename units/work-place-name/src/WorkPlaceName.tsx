// A role's work place, read-only: its name, and under it what the place IS and where (s8 card look: "what Oslo, the city in Norway or some
// town in USA"). Taken from GilbApp `PlaceName` and `NO_PLACE` in `src/components/mynet/EmploymentCard.tsx` lines 98-132 (commit in the README),
// which hydrated the name the way MyNet's `WorkLocationField` does. The changes are named in the README under "Changes from GilbApp" and each is
// marked `CHANGED` below.
import { useEffect, useState } from "react";
import { GeoUnavailableError, getPlace, type GeoPlace } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { placeHitLine, usePlaceHitDetails } from "@kaigilb/gilbplatformcode-place-hit-details";

/** The word for a stored place whose name is not (yet) known. Never the address, never nothing. */
export const UNNAMED_PLACE = "A place";
export const MISSING_PLACE_SAYS = "That place is no longer in the catalogue.";
export const UNREAD_PLACE_SAYS = "The name of this place could not be read right now.";
export const OUTSIDE_PLACE_SAYS = "This place is not in the place catalogue this app uses, so its name cannot be read.";

type Read =
  | { kind: "reading" }
  | { kind: "row"; place: GeoPlace }
  | { kind: "missing" }
  | { kind: "unreadable"; outside: boolean };

const NO_PLACE: readonly GeoPlace[] = [];

export function WorkPlaceName({ placeId, label }: { placeId: string; label: string }) {
  const [read, setRead] = useState<Read>({ kind: "reading" });
  useEffect(() => {
    if (!placeId) {
      setRead({ kind: "reading" });
      return;
    }
    let cancel = false;
    setRead({ kind: "reading" });
    void getPlace(placeId)
      .then((p) => {
        if (!cancel) setRead(p === null ? { kind: "missing" } : { kind: "row", place: p });
      })
      // CHANGED (F10): GilbApp swallowed a failed read (`.catch(() => undefined)`) and, with no label, drew nothing at all.
      .catch((e: unknown) => {
        if (!cancel) setRead({ kind: "unreadable", outside: e instanceof GeoUnavailableError && e.reason === "not-geo" });
      });
    return () => {
      cancel = true;
    };
  }, [placeId, label]);

  const place = read.kind === "row" ? read.place : null;
  const details = usePlaceHitDetails(place ? [place] : NO_PLACE);
  const d = place ? details.get(place.id) : undefined;
  const line = d && d.state !== "pending" ? placeHitLine(d) : "";
  const name = label || place?.label || "";

  if (name) {
    return (
      <div data-testid="experience-role-place-wrap">
        <p className="text-sm text-[var(--ink-soft)]" data-testid="experience-role-place">{name}</p>
        {line ? <p className="text-xs text-[var(--ink-faint)]" data-testid="experience-role-place-kind">{line}</p> : null}
      </div>
    );
  }
  // CHANGED (F10): a stored place with no known name is said, and why. GilbApp drew nothing, so the place looked "not set".
  if (!placeId) return null;
  const note =
    read.kind === "missing" ? MISSING_PLACE_SAYS : read.kind === "unreadable" ? (read.outside ? OUTSIDE_PLACE_SAYS : UNREAD_PLACE_SAYS) : "";
  return (
    <div data-testid="experience-role-place-wrap">
      <p className="text-sm text-[var(--ink-soft)]" data-testid="experience-role-place">{UNNAMED_PLACE}</p>
      {note ? (
        <p className="text-xs text-[var(--ink-faint)]" data-testid="experience-role-place-kind" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
