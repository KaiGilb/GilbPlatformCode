import { describe, expect, it } from "vitest";
import { currentKey, dismissOffer, dismissedKey, forgetVault, hasChosenVault, offerDismissed, rememberVault, rememberedVault, sharedOffer, type KeyValueStore } from "./index";

const memory = (): KeyValueStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k), set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
};
const broken: KeyValueStore = {
  get: () => { throw new Error("blocked"); },
  set: () => { throw new Error("blocked"); },
  remove: () => { throw new Error("blocked"); },
};
const KEY = "teapots:https://id.example.test/p/ann";
const OWN = "https://ann.example.test/vault";
const SHARED = "https://bob.example.test/vault";
const rows = [{ vaultId: OWN }, { vaultId: SHARED }, { vaultId: "https://cy.example.test/vault" }];

describe("rememberVault and rememberedVault", () => {
  it("keeps the id under <appKey>:current and gives it back while the vault is listed", () => {
    const s = memory();
    rememberVault(s, KEY, SHARED);
    expect(s.data.get(currentKey(KEY))).toBe(SHARED);
    expect(currentKey(KEY)).toBe(`${KEY}:current`);
    expect(rememberedVault(s, KEY, rows)).toBe(SHARED);
  });
  it("gives null once the vault is no longer in the rows", () => {
    const s = memory();
    rememberVault(s, KEY, SHARED);
    expect(rememberedVault(s, KEY, [{ vaultId: OWN }])).toBeNull();
    expect(rememberedVault(s, KEY, [])).toBeNull();
  });
  it("gives null when nothing was kept or the kept value is empty", () => {
    const s = memory();
    expect(rememberedVault(s, KEY, rows)).toBeNull();
    s.data.set(currentKey(KEY), "");
    expect(rememberedVault(s, KEY, rows)).toBeNull();
  });
  it("matches without trailing slashes and answers the id as the rows spell it", () => {
    const s = memory();
    rememberVault(s, KEY, `${SHARED}/`);
    expect(rememberedVault(s, KEY, rows)).toBe(SHARED);
  });
  it("two people on one browser stay apart when appKey holds the person: choice, chosen-before and dismissal", () => {
    const s = memory();
    const ann = "teapots:https://id.example.test/p/ann";
    const bob = "teapots:https://id.example.test/p/bob";
    rememberVault(s, ann, SHARED);
    dismissOffer(s, ann, "https://cy.example.test/vault");
    expect(rememberedVault(s, ann, rows)).toBe(SHARED);
    expect(rememberedVault(s, bob, rows)).toBeNull();
    expect(hasChosenVault(s, bob)).toBe(false);
    expect(offerDismissed(s, bob, "https://cy.example.test/vault")).toBe(false);
    rememberVault(s, bob, OWN);
    expect(rememberedVault(s, bob, rows)).toBe(OWN);
    expect(rememberedVault(s, ann, rows)).toBe(SHARED);
    forgetVault(s, bob);
    expect(rememberedVault(s, ann, rows)).toBe(SHARED);
  });
  it("keeps one choice per appKey", () => {
    const s = memory();
    rememberVault(s, "a:ann", SHARED);
    expect(rememberedVault(s, "a:bob", rows)).toBeNull();
  });
  it("a store that throws never throws out of these functions", () => {
    expect(() => rememberVault(broken, KEY, SHARED)).not.toThrow();
    expect(rememberedVault(broken, KEY, rows)).toBeNull();
    expect(hasChosenVault(broken, KEY)).toBe(false);
    expect(() => forgetVault(broken, KEY)).not.toThrow();
  });
  it("forgetVault removes it", () => {
    const s = memory();
    rememberVault(s, KEY, SHARED);
    forgetVault(s, KEY);
    expect(rememberedVault(s, KEY, rows)).toBeNull();
    expect(s.data.size).toBe(0);
  });
});

describe("hasChosenVault", () => {
  it("is true after rememberVault, even for the own vault, and false before", () => {
    const s = memory();
    expect(hasChosenVault(s, KEY)).toBe(false);
    rememberVault(s, KEY, OWN);
    expect(hasChosenVault(s, KEY)).toBe(true);
  });
});

describe("dismissOffer and offerDismissed", () => {
  it("keeps one dismissal per vault, under <appKey>:banner:<vaultId>", () => {
    const s = memory();
    expect(offerDismissed(s, KEY, SHARED)).toBe(false);
    dismissOffer(s, KEY, SHARED);
    expect(s.data.get(dismissedKey(KEY, SHARED))).toBe("1");
    expect(dismissedKey(KEY, SHARED)).toBe(`${KEY}:banner:${SHARED}`);
    expect(offerDismissed(s, KEY, SHARED)).toBe(true);
    expect(offerDismissed(s, KEY, "https://cy.example.test/vault")).toBe(false);
  });
  it("a store that throws is no dismissal and no error", () => {
    expect(() => dismissOffer(broken, KEY, SHARED)).not.toThrow();
    expect(offerDismissed(broken, KEY, SHARED)).toBe(false);
  });
});

describe("sharedOffer", () => {
  it("is the first row that is not the person's own", () => {
    expect(sharedOffer(rows, { ownVaultId: OWN })).toEqual({ vaultId: SHARED });
  });
  it("skips the own vault however the trailing slash is written", () => {
    expect(sharedOffer([{ vaultId: `${OWN}/` }, { vaultId: SHARED }], { ownVaultId: OWN })).toEqual({ vaultId: SHARED });
  });
  it("skips a row marked yours", () => {
    expect(sharedOffer([{ vaultId: "https://mine2.example.test/vault", yours: true }, { vaultId: SHARED }], { ownVaultId: OWN })).toEqual({ vaultId: SHARED });
  });
  it("skips a dismissed vault, by list or by function", () => {
    expect(sharedOffer(rows, { ownVaultId: OWN, dismissed: [SHARED] })?.vaultId).toBe("https://cy.example.test/vault");
    expect(sharedOffer(rows, { ownVaultId: OWN, dismissed: (id) => id === SHARED })?.vaultId).toBe("https://cy.example.test/vault");
    expect(sharedOffer(rows, { ownVaultId: OWN, dismissed: [`${SHARED}/`] })?.vaultId).toBe("https://cy.example.test/vault");
  });
  it("offers nothing once the person has chosen a vault", () => {
    expect(sharedOffer(rows, { ownVaultId: OWN, chosen: true })).toBeNull();
    expect(sharedOffer(rows, { ownVaultId: OWN, chosen: false })).toEqual({ vaultId: SHARED });
  });
  it("is null when every other vault is dismissed or there is only the own vault", () => {
    expect(sharedOffer(rows, { ownVaultId: OWN, dismissed: [SHARED, "https://cy.example.test/vault"] })).toBeNull();
    expect(sharedOffer([{ vaultId: OWN }], { ownVaultId: OWN })).toBeNull();
    expect(sharedOffer([], { ownVaultId: OWN })).toBeNull();
  });
  it("with no own vault known, every row not marked yours can be offered; it keeps the row's own extra fields", () => {
    const r = sharedOffer([{ vaultId: SHARED, label: "Bob" }], { ownVaultId: null });
    expect(r).toEqual({ vaultId: SHARED, label: "Bob" });
  });
  it("works with the store helpers together, as the app uses them", () => {
    const s = memory();
    const offer = () => sharedOffer(rows, { ownVaultId: OWN, chosen: hasChosenVault(s, KEY), dismissed: (id) => offerDismissed(s, KEY, id) });
    expect(offer()?.vaultId).toBe(SHARED);
    dismissOffer(s, KEY, SHARED);
    expect(offer()?.vaultId).toBe("https://cy.example.test/vault");
    rememberVault(s, KEY, OWN);
    expect(offer()).toBeNull();
  });
  it("does not change the rows", () => {
    const copy = JSON.stringify(rows);
    sharedOffer(rows, { ownVaultId: OWN });
    expect(JSON.stringify(rows)).toBe(copy);
  });
});
