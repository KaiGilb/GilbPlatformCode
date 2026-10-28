// @vitest-environment node
// A search for stakeholder records across the held vaults never claims it searched everything when a hit was dropped. Ported from
// planQaTester2.vaultit.test.ts (the two `findStakeholderRecords` cases; the other cases test the Plan card's list writers, the Part of loop
// guard and the Plan search, which are other units).
import { describe, expect, it } from "vitest";
import { findStakeholderRecords } from "./planStakeholdersIo";

describe("picker searches never claim they searched everything when a hit was dropped", () => {
  it("findStakeholderRecords: 25 hits cut to 20 is not complete", async () => {
    const vaults = ["https://v1.platform.example.test/vault", "https://v2.platform.example.test/vault"];
    const ids = (v: string) => Array.from({ length: 13 }, (_, i) => `${v}/e/p${i}`);
    const found = await findStakeholderRecords(vaults, ["Person"], "Ann", {
      search: (async (_q: string, _t: readonly string[], _f: undefined, vaultId: string) => ({ ids: ids(vaultId), next: null })) as never,
      read: async (id: string, at: string | null) => ({ facts: { label: `Ann ${id}` }, entityUri: at ?? id, typeUri: "t:Person" }),
    });
    expect(found.hits.length).toBe(20);
    expect(found.complete).toBe(false);
  });

  it("findStakeholderRecords: a hit whose read fails makes the answer not complete", async () => {
    const found = await findStakeholderRecords(["https://v1.platform.example.test/vault"], ["Person"], "Ann", {
      search: (async () => ({ ids: ["https://v1.platform.example.test/vault/e/ann"], next: null })) as never,
      read: async () => {
        throw new Error("500");
      },
    });
    expect(found).toMatchObject({ hits: [], complete: false });
  });
});
