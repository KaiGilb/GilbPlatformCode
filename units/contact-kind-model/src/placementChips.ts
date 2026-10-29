/**
 * The placement CHIP: a circle the holder placed a person in, drawn with the shared kind-of-contact chip
 * and MEANING ACCESS (it decides what of the holder's they may see). The placement's words are those of `person-connections`
 * (`placementLabel`). Nothing here writes.
 */
import { placementLabel, type AtomicPlacement } from "@kaigilb/gilbplatformcode-person-connections";
import type { ContactChip } from "./contactKindModel";

export function placementChip(p: AtomicPlacement): ContactChip {
  return {
    key: `${p.context}:${p.depth}`,
    axis: "circleLabel",
    entryId: `${p.context}:${p.depth}`,
    label: placementLabel(p),
    tone: p.context === "personal" ? "personal" : "professional",
  };
}
