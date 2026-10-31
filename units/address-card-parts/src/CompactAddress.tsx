// A stored address that is not being edited: only its filled lines, tight.
// Taken from GilbApp `src/components/mynet/PlaceClaimsCard.tsx` (commit in the README). Only the comments changed.
import { FlagImage } from "@kaigilb/gilbplatformcode-flag-image";
import type { CompactLine } from "./addressLines";

/**
 * With `onOpen`, one tap opens every field; without it (a record that may not be written) the lines are shown, nothing more.
 */
export function CompactAddress({
  heading,
  lines,
  onOpen,
}: {
  heading: string;
  lines: CompactLine[];
  onOpen?: () => void;
}) {
  const body = lines.length ? (
    lines.map((l) => (
      <span
        key={l.key}
        className={["text-[15px] leading-snug text-[var(--ink)]", l.countryId ? "inline-flex items-center gap-1.5" : ""].filter(Boolean).join(" ")}
        data-testid={`place-view-${l.key}`}
        data-country-id={l.countryId}
      >
        {/* The picked country's flag, read by the same rule and component as a language's flag; the neutral globe while it is read or when the
            country has none. A line with no picked country (typed text) draws nothing. */}
        {l.countryId ? <FlagImage country={l.countryId} /> : null}
        {l.text}
      </span>
    ))
  ) : onOpen ? (
    <span className="text-sm text-[var(--ink-faint)]">Add address details</span>
  ) : null;
  if (!onOpen) {
    return (
      <div className="flex flex-col items-start gap-0.5" data-testid="place-claim-compact-readonly">
        {body}
      </div>
    );
  }
  return (
    <button
      type="button"
      className="flex min-h-10 w-full flex-col items-start gap-0.5 rounded-[var(--r-sm)] text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--accent)]"
      aria-label={`Edit address ${heading}`.trim()}
      data-testid="place-claim-compact"
      onClick={onOpen}
    >
      {body}
    </button>
  );
}
