// Read-only lines of an address of theirs: the same lines and flag as CompactAddress's read-only branch, without importing it.
// Beyond the source (Kai, 2026-11-01).
import type { OneCardRow } from "@kaigilb/gilbplatformcode-one-card-merge";
import { FlagImage } from "@kaigilb/gilbplatformcode-flag-image";
import { theirAddressLines, theirUnreadNotes } from "./theirAddressLines";

const named = (x: string | null | undefined): boolean => (x ?? "").trim() !== "";

/** The filled lines, the flag on the country line, and an honest note when a place was not read. Nothing when there is neither. */
export function TheirAddressLines({ address }: { address: NonNullable<OneCardRow["address"]> }) {
  const lines = theirAddressLines(address.parts, address.countryId);
  const notes = theirUnreadNotes(address.unread, address.gone, named(address.parts.city) || named(address.parts.region) || named(address.parts.country));
  if (lines.length === 0 && notes.length === 0) return null;
  return (
    <div data-testid="their-address" className="flex flex-col items-start gap-0.5">
      {lines.map((l) => (
        <span
          key={l.key}
          className={["text-[15px] leading-snug text-[var(--ink)]", l.countryId ? "inline-flex items-center gap-1.5" : ""].filter(Boolean).join(" ")}
          data-testid={"their-address-" + l.key}
          data-country-id={l.countryId}
        >
          {l.countryId ? <FlagImage country={l.countryId} /> : null}
          {l.text}
        </span>
      ))}
      {notes.map((note) => (
        <span key={note} data-testid="their-address-note" className="text-[13px] text-[var(--ink-soft)]">
          {note}
        </span>
      ))}
    </div>
  );
}
