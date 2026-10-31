// 0.2.1: the skip set is exported. Pins its eleven names (the source's entityRefFacts.ts SKIP_SLUGS, 0 diff) and that it is a Set.
import { describe, expect, it } from "vitest";
import { SKIP_SLUGS } from "./index";

describe("SKIP_SLUGS", () => {
  it("is the eleven identity and profile-card names, no more and no fewer", () => {
    expect(SKIP_SLUGS).toBeInstanceOf(Set);
    expect([...SKIP_SLUGS].sort()).toEqual(
      ["accountSubject", "aliasUri", "anchorBoundEmail", "claimSubject", "directReader", "directWriter", "heldParty", "principalUri", "profilePhoto", "registeredVault", "vaultAddress"],
    );
  });
});
