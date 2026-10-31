// The held stakeholder card inside the stakeholder card provider: it builds the card's host from the provider's platform pieces, mounts it, and draws the card.
import { useMemo } from "react";
import { myNetProfileUrl } from "@kaigilb/gilbplatformcode-own-card-state";
import { useStakeholderCardPlatform } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { StakeholderRecordCard, StakeholderRecordCardHostContext, type StakeholderRecordCardProps } from "@kaigilb/gilbplatformcode-stakeholder-record-card";
import { createStakeholderRecordCardHost } from "./recordCardHost";

/** Said, with no card drawn, when the provider was given no `settings.mynetProfileUrl`: the card's own-card band cannot draw without it. */
export const NO_PROFILE_ADDRESS_SAYS = "The MyNet profile address is not set, so this card is not drawn.";

/** The address the own-card band links to, or null when none was set (`myNetProfileUrl` of `own-card-state` throws then). */
function profileAddress(): string | null {
  try {
    return myNetProfileUrl();
  } catch {
    return null;
  }
}

/**
 * The card of a record the holder keeps, drawn and edited. Needs a `StakeholderCardGilbPlatformProvider` above it (it throws an error that names it
 * otherwise) with `settings.mynetProfileUrl` set; without the setting it draws one sentence and no card (it does not throw).
 */
export function HeldStakeholderCard(props: StakeholderRecordCardProps) {
  const platform = useStakeholderCardPlatform();
  const host = useMemo(() => createStakeholderRecordCardHost(platform), [platform]);
  if (profileAddress() === null) return <p role="status" data-testid="held-card-no-profile-address">{NO_PROFILE_ADDRESS_SAYS}</p>;
  return (
    <StakeholderRecordCardHostContext.Provider value={host}>
      <StakeholderRecordCard {...props} />
    </StakeholderRecordCardHostContext.Provider>
  );
}
