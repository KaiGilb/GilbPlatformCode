// The address a field belongs to (`composite`), as the server serves it, and the dedup that must not merge two addresses.
import { describe, expect, it } from "vitest";
import { parseOnlineCard } from "./publicCard";

const ANN = "https://ann.example.test/vault";
const wire = (extra: Record<string, unknown>) => ({ principal: ANN, field: "a:claimPlace", value: "P-NORWAY", rung: "public", sourceEntity: "S", ...extra });
const parse = (fields: unknown[]) => parseOnlineCard(ANN, { fields }).fields;

describe("composite", () => {
  it("O1 keeps composite when served", () => {
    const [f] = parse([wire({ composite: "E0" })]);
    expect(f!.composite).toBe("E0");
  });

  it("O2 no composite key when absent, empty or not a string", () => {
    for (const c of [undefined, "", "  ", 42, null, {}, ["E0"]]) {
      const [f] = parse([wire({ composite: c })]);
      expect("composite" in f!).toBe(false);
    }
  });

  it("O3 two addresses both naming Norway at the same rung keep two country lines", () => {
    const out = parse([wire({ composite: "E1", sourceEntity: "S1" }), wire({ composite: "E2", sourceEntity: "S2" })]);
    expect(out.map((f) => f.composite)).toEqual(["E1", "E2"]);
  });

  it("O3b an exact duplicate WITHOUT composite is still one line", () => {
    const out = parse([wire({}), wire({ sourceEntity: "S2" })]);
    expect(out).toHaveLength(1);
  });

  it("O3c an exact duplicate WITH the same composite is one line", () => {
    const out = parse([wire({ composite: "E1" }), wire({ composite: "E1", sourceEntity: "S2" })]);
    expect(out).toHaveLength(1);
  });
});
