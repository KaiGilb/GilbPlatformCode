/**
 * The circles the holder placed this person in, shown READ-ONLY on the card of a held record linked to them ("the connection is the rung").
 *
 * The chips are the shared chip with MEANING ACCESS (a placement keeps its words and colours; Inner collapses 1st by the
 * package's `displayPlacements`). They sit in their own band beside "Their online card", apart from the record's own kind LABELS (beside
 * the name, "grants nothing"), so the two meanings are never one row.
 *
 * Draws NOTHING when the record is not matched to a placed person, while it is being resolved, and when the connections could not be
 * read (the card works as before; no banner). ⛔ No write: no "+", no (−); placing is done elsewhere.
 */
import { displayPlacements, type PersonCard } from "@kaigilb/gilbplatformcode-person-connections";
import { ContactKindChip } from "./ContactKindChips";
import { placementChip } from "@kaigilb/gilbplatformcode-contact-kind-model";

/** The heading of the band. */
export const PLACEMENT_BAND_TITLE = "In your circles";
/** What a placement chip means here (the tooltip of each chip, and the band's help line). */
export const PLACEMENT_CHIP_HELP = "You placed them in this circle. It decides what of yours they can see. Change it in MyNet.";

export function PersonPlacementChips({ card }: { card: PersonCard | null }) {
  if (!card || card.how !== "placement") return null;
  const shown = displayPlacements(card.placements);
  if (shown.length === 0) return null;
  return (
    <section className="flex min-w-0 flex-col gap-1" aria-label={PLACEMENT_BAND_TITLE} data-testid="person-placement-band" data-meaning="access">
      <div className="flex flex-wrap items-center gap-1.5">
        <h3 className="text-[12.5px] font-semibold" style={{ color: "var(--ink-soft, inherit)" }}>
          {PLACEMENT_BAND_TITLE}
        </h3>
        {shown.map((p) => (
          <ContactKindChip
            key={`${p.context}:${p.depth}`}
            chip={placementChip(p)}
            title={PLACEMENT_CHIP_HELP}
            meaning="access"
            testId="person-placement-chip"
            data={{ "data-context": p.context, "data-depth": p.depth }}
          />
        ))}
      </div>
      <p className="text-[11.5px]" style={{ color: "var(--ink-faint, inherit)" }} data-testid="person-placement-help">
        {PLACEMENT_CHIP_HELP}
      </p>
    </section>
  );
}
