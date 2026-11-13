import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("the package's exports", () => {
  it("are exactly these values", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["canReadVault", "canWriteVault", "choiceLine", "currentKey", "defaultWriteVaultId", "dismissOffer", "dismissedKey", "forgetVault", "hasChosenVault", "offerDismissed", "orderVaultsAsTree", "rememberVault", "rememberedVault", "sharedOffer", "vaultChoices", "vaultLabel", "vaultRootFromList", "vaultsOfType", "writableVaults"].sort(),
    );
  });
});
