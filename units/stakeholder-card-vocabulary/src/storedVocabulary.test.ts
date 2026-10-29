// The master's card vocabulary is kept on the device and shown at once on the next load.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { readStoredCardVocabulary, storeCardVocabulary, type StakeholderCardVocabulary } from "./stakeholderCardVocabulary";
import { ID } from "../test/support";
import { memoryStorage } from "../test/memoryStorage";

const reading = (withSets: boolean) =>
  ({ kindNames: ["Person"], kindsComplete: true, fieldSets: withSets ? { byKind: {} } : null, fieldSetsRefusal: withSets ? null : "refused" }) as unknown as StakeholderCardVocabulary;

describe("card vocabulary, last known on this device", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", memoryStorage());
    resetTermOrigin();
    setTermOrigin(ID);
  });
  it("a reading with field sets is stored and read back", () => {
    storeCardVocabulary(reading(true), true);
    expect(readStoredCardVocabulary(true)?.kindNames).toEqual(["Person"]);
  });
  it("a refused reading is never stored", () => {
    storeCardVocabulary(reading(false), true);
    expect(readStoredCardVocabulary(true)).toBeUndefined();
  });
  it("a damaged stored copy is ignored", () => {
    storeCardVocabulary(reading(true), true);
    localStorage.setItem(`gilbapp.cardVocabulary.v1.${ID}`, "{not json");
    expect(readStoredCardVocabulary(true)).toBeUndefined();
  });
});
