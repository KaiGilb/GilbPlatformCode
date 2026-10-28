// Ported from the app's served-shape tests: what the card writes for a part reads back the same through the shape the
// vault serves (a one-member list is the bare object and the inner keys lose `a:`), and a part's bare partOf,
// elementOrder, body and lineSources are read. Same inputs and expectations; hosts are example.test.
import { describe, expect, it } from "vitest";
import { linkAddress } from "@kaigilb/gilbplatformcode-plan-links-model";
import { descriptionTree, partBody, partLineSources, partOrder, type PartRow } from "./planParts";

const DEV = "https://vault.example.test/vault/e/dev-1";
const SH = "https://vault.example.test/vault/e/stakeholder-1";
const WALK_SOURCES = { sourceOf: "a:body", statedBy: { "@id": DEV } };

// The vault's framing: a one-member list is the bare object, inner keys lose `a:`; a list of two or more is an array
// (accepted either way by the readers).
function stripA(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(stripA);
  if (!v || typeof v !== "object") return v;
  const out: Record<string, unknown> = {};
  for (const [k, val] of Object.entries(v as Record<string, unknown>)) out[k.startsWith("a:") ? k.slice(2) : k] = stripA(val);
  return out;
}
function served(written: unknown): unknown {
  const s = stripA(written);
  return Array.isArray(s) && s.length === 1 ? s[0] : s;
}
function servedRow(id: string, typeUri: string, writtenFacts: Record<string, unknown>) {
  const facts: Record<string, string> = {};
  const servedFacts: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(writtenFacts)) {
    const slug = k.startsWith("a:") ? k.slice(2) : k;
    servedFacts[slug] = served(v);
    facts[slug] = typeof v === "string" ? v : typeof v === "number" ? String(v) : "";
  }
  return { id, entityUri: `https://vault.example.test/base/e/${id}`, typeUri, facts, served: { facts: servedFacts } };
}

describe("served-shape round trips (each record type the card writes)", () => {
  it("t:SpecificationElement and t:Assumption parts: what createPart writes reads back the same", () => {
    // The facts the card sends when it creates a part, for a top part, a sub-part and an assumption.
    const walk = { id: "walk", entityUri: "https://vault.example.test/base/e/walk" };
    const step = servedRow("step", "t:SpecificationElement", {
      "a:unitTag": "Walk.Step",
      "a:body": "The walker puts one foot in front of the other.",
      "a:partOf": { "@id": walk.entityUri },
      "a:elementOrder": 1,
      "a:lineSources": [{ "a:sourceOf": "a:body", "a:statedBy": { "@id": SH } }],
    });
    const lift = servedRow("lift", "t:SpecificationElement", {
      "a:unitTag": "Walk.Step.Lift",
      "a:body": "The foot leaves the ground.",
      "a:partOf": { "@id": step.entityUri },
      "a:elementOrder": 1,
      "a:lineSources": [{ "a:sourceOf": "a:body", "a:source": "Dr Ann" }],
    });
    const floor = servedRow("floor", "t:Assumption", {
      "a:unitTag": "Walk.Assumption",
      "a:partOf": { "@id": walk.entityUri },
      "a:elementOrder": 2,
    });
    const tree = descriptionTree(walk, [lift, floor, step]);
    expect(tree.map((n) => n.tag)).toEqual(["Walk.Step", "Walk.Assumption"]);
    expect(tree[0]!.children.map((n) => n.tag)).toEqual(["Walk.Step.Lift"]);
    expect(partBody(step)).toBe("The walker puts one foot in front of the other.");
    expect(partOrder(step)).toBe(1);
    expect(partLineSources(step)["a:body"]).toEqual({ statedBy: SH });
    expect(partLineSources(lift)["a:body"]).toEqual({ text: "Dr Ann" });
  });
});

describe("served plan records", () => {
  it("reads a part's bare partOf, elementOrder, body and lineSources", () => {
    const sol = { id: "sol", entityUri: "https://vault.example.test/base/e/sol" };
    const part: PartRow = {
      id: "p1",
      entityUri: "https://vault.example.test/base/e/p1",
      typeUri: "t:SpecificationElement",
      facts: {},
      served: {
        facts: {
          body: "on legs",
          elementOrder: 2,
          partOf: { "@id": sol.entityUri },
          lineSources: WALK_SOURCES,
        },
      },
    };
    expect(partBody(part)).toBe("on legs");
    expect(partOrder(part)).toBe(2);
    expect(partLineSources(part)["a:body"]).toEqual({ statedBy: DEV });
    expect(descriptionTree(sol, [part])).toHaveLength(1);
    expect(
      linkAddress(
        { facts: {}, served: { facts: { fvParent: { "@id": "https://vault.example.test/base/e/parent-fn" } } } },
        "fvParent",
      ),
    ).toBe("https://vault.example.test/base/e/parent-fn");
    expect(
      linkAddress(
        { facts: {}, served: { facts: { "a:measures": [{ "@id": "https://vault.example.test/base/e/value-1" }] } } },
        "measures",
      ),
    ).toBe("https://vault.example.test/base/e/value-1");
  });
});
