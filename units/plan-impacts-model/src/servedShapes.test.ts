// Ported: the impact case of the app's planServedShapes test, and the ImpactOn round-trip case of its planQaTester test.
// Fixture strings are generic (a person name and host names replaced).
import { describe, expect, it } from "vitest";
import { IMPACT_RESOURCE_ROLE, IMPACT_VALUE_ROLE, factsFromExtras, impactExtraFacts } from "./index";

// The vault frames a one-member list as the bare object, with the inner keys losing `a:`.
function stripA(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripA);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k.startsWith("a:") ? k.slice(2) : k] = stripA(val);
  return out;
}

const SH = "https://vault.example.test/vault/e/stakeholder-1";

describe("served plan records (impacts)", () => {
  it("reads an impact's bare value, draw, unit, basis and statedBy", () => {
    const ada = "https://vault.example.test/base/e/ada";
    const stored = factsFromExtras(
      {
        valueEstimate: "fast",
        resourceDraw: -20,
        unit: "seconds",
        impactBasis: "measured",
        statedBy: { "@id": ada },
      },
      IMPACT_RESOURCE_ROLE,
    );
    expect(stored.valueEstimate).toBe("fast");
    expect(stored.resourceDraw).toBe("-20");
    expect(stored.unit).toBe("seconds");
    expect(stored.basis).toBe("measured");
    expect(stored.source).toEqual({ statedBy: ada });
  });
});

describe("served-shape round trips", () => {
  it("t:ImpactOn extra facts round-trip through the served shape (value and resource)", () => {
    const value = { role: IMPACT_VALUE_ROLE, valueEstimate: "3 → 0.2", resourceDraw: "", unit: "seconds", basis: "estimate" as const };
    const back = factsFromExtras(stripA(impactExtraFacts(value as never, { statedBy: SH })) as Record<string, unknown>, IMPACT_VALUE_ROLE as never);
    expect(back).toMatchObject({ valueEstimate: "3 → 0.2", unit: "seconds", basis: "estimate", source: { statedBy: SH } });
    const res = { role: IMPACT_RESOURCE_ROLE, valueEstimate: "", resourceDraw: "+200", unit: "€ per month", basis: "measured" as const };
    const back2 = factsFromExtras(stripA(impactExtraFacts(res as never, { text: "Ann" })) as Record<string, unknown>, IMPACT_RESOURCE_ROLE as never);
    expect(back2).toMatchObject({ resourceDraw: "+200", unit: "€ per month", basis: "measured", source: { text: "Ann" } });
  });
});
