// Stakeholder quick-list options and the held-vault default.
//
// The master is the package's OWN fixture master at the pinned SHA, copied into `test/` and not mirrored. Same preparation as the card vocabulary's tests.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import type { StakeholderFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readStakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import type { ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { fixtureMaster, RIG, ID } from "../test/support";
import { withReferenceTerms } from "../test/fixtureReference";
import { recordableKinds } from "./recordPerson";
import {
  defaultHeldVaultId,
  heldVaults,
  stakeholderTypeOptions,
  stakeholderTypeSearch,
} from "./stakeholderCreate";

/** The fixture's listing without its one illustrative node that is no term on the master
 *  (`t/Unrelated` / `a:unrelated`, typing gate r2 F2). */
function withoutUnplaced(m: ReturnType<typeof fixtureMaster>): ReturnType<typeof fixtureMaster> {
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"].filter((n) => n["@id"] !== `${ID}/base/t/Unrelated`));
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  m.listing(pages as never);
  return m;
}

async function fieldSetsOf(mutate?: (m: ReturnType<typeof fixtureMaster>) => void): Promise<StakeholderFieldSets> {
  const m = withoutUnplaced(withReferenceTerms(fixtureMaster()));
  mutate?.(m);
  const card = await readStakeholderCardVocabulary(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
  if (!card.fieldSets) throw new Error(card.fieldSetsRefusal ?? "fixture field sets refused");
  return card.fieldSets;
}

const HOST = "https://kaizen.example.test";

function vault(over: {
  vaultId: string;
  name: string;
  isLandingVault: boolean;
  modes: ReachableVault["modes"];
  parent: ReachableVault["parent"];
}): ReachableVault {
  return {
    entity: `${over.vaultId}/e`,
    parentAmbiguous: false,
    represents: null,
    ...over,
  };
}

describe("stakeholderTypeOptions, search, held vaults", () => {
  let fieldSets: StakeholderFieldSets;

  beforeAll(async () => {
    // The card vocabulary reads the ontology origin that is set.
    resetTermOrigin();
    setTermOrigin(ID);
    fieldSets = await fieldSetsOf();
  });

  it("options are recordableKinds, in that order, with master labels and veda: ids", () => {
    const opts = stakeholderTypeOptions(fieldSets);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts).toEqual(
      recordableKinds(fieldSets).map((k) => ({
        id: `veda:${k.name}`,
        label: k.label ?? k.name,
        typeName: k.name,
        spec: null,
        kind: "type" as const,
      })),
    );
    const banned = new Set(["NoteDocument", "Task", "VirtualFolder", "File"]);
    expect(opts.some((o) => banned.has(o.typeName))).toBe(false);
  });

  it("a child kind added on the fixture master appears, with no app change", async () => {
    const sets = await fieldSetsOf((m) => {
      // Person is a recordable member (the name field is declared on it). Zorblax sits under
      // it, so the package's ancestor walk gives it Person's fields. Passenger stays.
      m.children("Person", [
        { name: "Passenger", label: "Passenger" },
        { name: "Zorblax", label: "Zorblax" },
      ]);
      m.children("Zorblax", []);
    });
    expect(stakeholderTypeOptions(sets).map((o) => o.id)).toContain("veda:Zorblax");
  });

  it("a blank query returns every kind, not degraded, and the reach names the noun", async () => {
    const opts = stakeholderTypeOptions(fieldSets);
    const res = await stakeholderTypeSearch(opts, "Stakeholder")("");
    expect(res.options).toEqual(opts);
    expect(res.degraded).toBe(false);
    expect(res.reach).toContain("Stakeholder");
  });

  it("a typed query keeps only matches, and never calls fetch", async () => {
    const opts = stakeholderTypeOptions(fieldSets);
    const q = opts[0]!.label.slice(0, 3);
    expect(q.length).toBeGreaterThan(0);
    const spy = vi.spyOn(globalThis, "fetch");
    try {
      const res = await stakeholderTypeSearch(opts, null)(q);
      expect(res.options.some((o) => o.id === opts[0]!.id)).toBe(true);
      expect(
        res.options.every(
          (o) =>
            o.label.toLowerCase().includes(q.toLowerCase()) ||
            o.typeName.toLowerCase().includes(q.toLowerCase()),
        ),
      ).toBe(true);
      expect(res.degraded).toBe(false);
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });

  it("held vaults are the landing vault and what is nested under it; the default follows Record someone", () => {
    const L = vault({
      vaultId: `${HOST}/base/pl`,
      name: "Landing",
      isLandingVault: true,
      modes: ["read", "write"],
      parent: null,
    });
    const N = vault({
      vaultId: `${HOST}/base/pn`,
      name: "Nested",
      isLandingVault: false,
      modes: ["read", "write"],
      parent: { entity: L.entity!, vaultId: L.vaultId },
    });
    const W = vault({
      vaultId: `${HOST}/base/pw`,
      name: "Writable",
      isLandingVault: false,
      modes: ["read", "write"],
      parent: null,
    });
    const R = vault({
      vaultId: `${HOST}/base/pr`,
      name: "ReadOnly",
      isLandingVault: false,
      modes: ["read"],
      parent: { entity: L.entity!, vaultId: L.vaultId },
    });
    const held = heldVaults([L, N, W, R]);
    expect(held.map((v) => v.vaultId)).toEqual([L.vaultId, N.vaultId]);
    expect(defaultHeldVaultId(held, N.vaultId)).toBe(N.vaultId);
    expect(defaultHeldVaultId(held, W.vaultId)).toBe(L.vaultId);
    const onlyW = heldVaults([W]);
    expect(onlyW).toEqual([]);
    expect(defaultHeldVaultId(onlyW, W.vaultId)).toBeNull();
  });

  it("the fixture master's recordable kind labels, in order", () => {
    expect(stakeholderTypeOptions(fieldSets).map((o) => o.label)).toEqual([
      "AI Agent",
      "Data Store",
      "Organization",
      "Party Group",
      "Passenger",
      "Person",
      "Software System",
      "Software System Group",
    ]);
  });
});
