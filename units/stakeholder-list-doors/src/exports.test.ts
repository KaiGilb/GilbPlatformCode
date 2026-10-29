// New. Pins the export list of the package, so an export added or dropped by a later change is a decision and not an accident.
import { describe, expect, it } from "vitest";
import * as unit from "./index";

describe("stakeholder-list-doors exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "CredentialRefusedError",
      "StakeholderListDoorsHostContext",
      "__resetPersonCardSession",
      "anchorShareOf",
      "bindAnchorShare",
      "canonicaliserFor",
      "connectionsKey",
      "forgetAnchor",
      "forgetLinkedRecords",
      "heldVaultsOwnFirst",
      "identityFetch",
      "linkedRecordsOf",
      "listedRecordsPage",
      "masterTypeAddress",
      "nameAnswerOf",
      "onlineCardDeps",
      "personCardPlatform",
      "readHolderConnections",
      "resolveRecordPersonCard",
      "sessionConnections",
      "sharedAnchor",
      "stakeholderListDeps",
      "useStakeholderListReader",
    ]);
  });
  it("all are functions, the error class, and the host context", () => {
    for (const [k, v] of Object.entries(unit)) {
      if (k === "StakeholderListDoorsHostContext") expect(v).toMatchObject({ $$typeof: expect.anything() });
      else expect(typeof v).toBe("function");
    }
  });
  it("the host context has no default: a missing provider is seen as null", () => {
    expect((unit.StakeholderListDoorsHostContext as unknown as { _currentValue: unknown })._currentValue).toBeNull();
  });
});
