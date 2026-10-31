// Test-only. The three boxes of GilbApp's address card (`PlaceClaimsCard.tsx` lines 515-525 and 872-923), reduced to what the picker's cases
// need: the same props from the same draft, the same pick handlers (`cascadeFrom`, `clearFinerOnCountryChange`, `clearRung`), no save.
import { useState } from "react";
import type { GeoRung } from "@kaigilb/gilbplatformcode-geo-catalogue";
import { cascadeFrom, emptyDraft, type PlaceClaimDraft } from "@kaigilb/gilbplatformcode-place-draft";
import { clearFinerOnCountryChange, clearRung } from "@kaigilb/gilbplatformcode-place-clear";
import { PlacePicker, RUNG_LABEL } from "../src/index";

export function AddressBoxes({ initial = emptyDraft() }: { initial?: PlaceClaimDraft }) {
  const [draft, setDraft] = useState<PlaceClaimDraft>(initial);
  const div = draft.divergence;
  const foundInBoxLabel = (r: GeoRung) => (div && div.rung === r ? RUNG_LABEL[div.boxRung] : null);
  const landedElsewhere = (r: GeoRung) => (div && div.boxRung === r ? { label: div.label, rungLabel: RUNG_LABEL[div.rung] } : null);
  return (
    <div>
      <PlacePicker
        rung="city"
        label="City"
        value={draft.place.city}
        filledByCascade={draft.cascaded.city}
        foundInBoxLabel={foundInBoxLabel("city")}
        pickLandedElsewhere={landedElsewhere("city")}
        restrictToCountryId={draft.place.country?.id ?? null}
        onPick={async (p) => setDraft(await cascadeFrom(draft, p, "city"))}
        onClear={() => setDraft((d) => clearRung(d, "city"))}
      />
      <PlacePicker
        rung="region"
        label="Region/State"
        value={draft.place.region}
        filledByCascade={draft.cascaded.region}
        foundInBoxLabel={foundInBoxLabel("region")}
        pickLandedElsewhere={landedElsewhere("region")}
        restrictToCountryId={draft.place.country?.id ?? null}
        onPick={async (p) => setDraft(await cascadeFrom(draft, p, "region"))}
        onClear={() => setDraft((d) => clearRung(d, "region"))}
      />
      <PlacePicker
        rung="country"
        label="Country"
        value={draft.place.country}
        filledByCascade={draft.cascaded.country}
        foundInBoxLabel={foundInBoxLabel("country")}
        pickLandedElsewhere={landedElsewhere("country")}
        onPick={async (p) => setDraft(await cascadeFrom(clearFinerOnCountryChange(draft), p, "country"))}
        onClear={() => setDraft((d) => clearRung(d, "country"))}
      />
    </div>
  );
}
