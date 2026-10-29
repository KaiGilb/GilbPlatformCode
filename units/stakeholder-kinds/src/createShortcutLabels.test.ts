// Ported from `gilb-stakeholders` `test/createShortcut-s8labels.test.ts` at 0a261488: all 8 tests. The New-record picker's shortcuts are read
// from the master (`a:createShortcut` on the role), never listed here. Every expected value is a literal; the discriminating cases change
// the served documents and require the answer to move with them.
import { describe, it, expect } from "vitest";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { kindDescendants, resolveStakeholderKinds } from "./kinds";
import { fixtureMaster, RIG, t, a, CONTEXT } from "../test/support";

const ref = (iri: string) => ({ "@id": iri });
const resolve = (m: ReturnType<typeof fixtureMaster>) => resolveStakeholderKinds(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));

/** A master that has minted the term (read live 2026-10-16T02:20Z) and declared it on the role. */
function withShortcuts(order: string[]) {
  const m = fixtureMaster();
  m.put("a/createShortcut", { "@context": CONTEXT, "@id": a("createShortcut"), "a:predicateAttribute": "a:createShortcut" });
  const role = m.docs.get(`${RIG}/base/t/Stakeholder`) as Record<string, unknown>;
  m.put("t/Stakeholder", { ...role, "a:createShortcut": order.map((n) => ref(t(n))) });
  return m;
}

describe("resolveStakeholderKinds — createShortcuts", () => {
  it("returns the shortcuts in the master's order, each with the label its own term carries", async () => {
    const kinds = await resolve(withShortcuts(["Organization", "Person", "SoftwareSystem"]));
    expect(kinds.createShortcuts.map((s) => s.term)).toEqual([t("Organization"), t("Person"), t("SoftwareSystem")]);
    expect(kinds.createShortcuts.map((s) => s.name)).toEqual(["Organization", "Person", "SoftwareSystem"]);
    expect(kinds.createShortcuts.map((s) => s.label)).toEqual(["Organization", "Person", "Software System"]);
    expect(kinds.shortcuts).toBe("declared");
  });

  it("moves with the master: another order served is another order returned", async () => {
    const kinds = await resolve(withShortcuts(["SoftwareSystem", "Person"]));
    expect(kinds.createShortcuts.map((s) => s.name)).toEqual(["SoftwareSystem", "Person"]);
  });

  it("a master that has not minted the term gives NO shortcuts, said, and the kinds still read", async () => {
    const kinds = await resolve(fixtureMaster());
    expect(kinds.createShortcuts).toEqual([]);
    expect(kinds.shortcuts).toBe("unreadable");
    expect(kinds.types.length).toBe(10);
  });

  it("a minted term the role does not carry gives none, said as such (not unreadable)", async () => {
    const m = fixtureMaster();
    m.put("a/createShortcut", { "@context": CONTEXT, "@id": a("createShortcut"), "a:predicateAttribute": "a:createShortcut" });
    const kinds = await resolve(m);
    expect(kinds.createShortcuts).toEqual([]);
    expect(kinds.shortcuts).toBe("none-declared");
  });

  it("a shortcut that is not a player of the role is dropped (nothing is offered that cannot be created)", async () => {
    const kinds = await resolve(withShortcuts(["Animal", "Person"]));
    expect(kinds.createShortcuts.map((s) => s.name)).toEqual(["Person"]);
  });

  it("a shortcut whose own term does not answer keeps its place with no label (never a guess, never a throw)", async () => {
    const m = withShortcuts(["Person", "Organization"]);
    m.status.set(`${RIG}/base/t/Organization`, 500);
    const kinds = await resolve(m);
    expect(kinds.createShortcuts.map((s) => [s.name, s.label])).toEqual([["Person", "Person"], ["Organization", null]]);
  });
});

describe("kindDescendants — the is-a children below a type, read from the set", () => {
  it("lists the direct children first and their own children after, each once", async () => {
    const m = withShortcuts(["SoftwareSystem"]);
    m.children("SoftwareSystem", [
      { name: "AiAgent", label: "AI Agent" },
      { name: "ConnectableService", label: "Connectable Service" },
      { name: "DataStore", label: "Data Store" },
    ]);
    m.children("ConnectableService", [{ name: "XSocial", label: "X" }]);
    m.children("XSocial", []);
    const kinds = await resolve(m);
    expect(kindDescendants(kinds, t("SoftwareSystem")).map((d) => [d.name, d.depth])).toEqual([
      ["AiAgent", 1],
      ["ConnectableService", 1],
      ["XSocial", 2],
      ["DataStore", 1],
    ]);
  });

  it("a type with no children has none", async () => {
    const kinds = await resolve(withShortcuts(["Person"]));
    expect(kindDescendants(kinds, t("Organization"))).toEqual([]);
  });
});
