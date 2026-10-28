// What the card asks of its host, and in which form: the finds it asks for, the hooks it calls on every render, and the Type
// popover's "Open in Ontology".
import { describe, expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SCREEN, VAULT, makeApp, mountCard } from "../test/app";
import { entityUriOf } from "../test/server";
import { settle } from "../test/helpers";

const finds = (app: ReturnType<typeof makeApp>) =>
  app.host.usePlanFind.mock.calls.map((c) => ({ vault: c[0], attr: c[1], parent: c[2]?.id ?? null, cap: c[3] }));
const has = (app: ReturnType<typeof makeApp>, f: { attr: string; parent: string | null; cap?: number | undefined }) =>
  finds(app).some((c) => c.attr === f.attr && c.parent === f.parent && c.cap === f.cap && c.vault === VAULT);

describe("the finds the card asks the host for", () => {
  test("a Function asks for its sub-functions, its functions of a value and its parts (300)", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", { unitTag: "A.B" }), { mode: "legacy" });
    await settle();
    expect(has(app, { attr: "a:fvParent", parent: "fn1", cap: undefined })).toBe(true);
    expect(has(app, { attr: "a:measures", parent: "fn1", cap: undefined })).toBe(true);
    expect(has(app, { attr: "a:partOf", parent: "fn1", cap: 300 })).toBe(true);
  });

  test("a Solution has no sub-functions or functions of a value to find: it asks with no record", async () => {
    const app = makeApp();
    mountCard(app, app.seed("s1", "t:Solution", { unitTag: "A.B" }), { mode: "legacy" });
    await settle();
    expect(has(app, { attr: "a:fvParent", parent: null, cap: undefined })).toBe(true);
    expect(has(app, { attr: "a:measures", parent: null, cap: undefined })).toBe(true);
    expect(has(app, { attr: "a:fvParent", parent: "s1", cap: undefined })).toBe(false);
    expect(has(app, { attr: "a:partOf", parent: "s1", cap: 300 })).toBe(true);
  });

  test("a Value pages its parts to 2000, and asks for its functions of a value, not its sub-functions", async () => {
    const app = makeApp();
    mountCard(app, app.seed("val1", "t:Value", { unitTag: "Speed" }), { mode: "legacy" });
    await settle();
    expect(has(app, { attr: "a:partOf", parent: "val1", cap: 2000 })).toBe(true);
    expect(has(app, { attr: "a:measures", parent: "val1", cap: undefined })).toBe(true);
    expect(has(app, { attr: "a:fvParent", parent: null, cap: undefined })).toBe(true);
  });

  test("a Development Resource also pages to 2000", async () => {
    const app = makeApp();
    mountCard(app, app.seed("res1", "t:Resource", { unitTag: "Cost" }), { mode: "legacy" });
    await settle();
    expect(has(app, { attr: "a:partOf", parent: "res1", cap: 2000 })).toBe(true);
  });

  test("they are asked of the vault the record's address names, not the screen's", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", { unitTag: "A.B" }), { mode: "legacy" });
    await settle();
    expect(VAULT).not.toBe(SCREEN);
    expect(finds(app).every((c) => c.vault === VAULT)).toBe(true);
  });
});

describe("the hooks of the host are called on every render", () => {
  test("the card's own hooks are called by a card of every type, as the source called them", async () => {
    for (const type of ["t:Function", "t:FunctionConstraint", "t:Solution", "t:DesignConstraint", "t:Value", "t:Resource"]) {
      const app = makeApp();
      const view = mountCard(app, app.seed("rec1", type, { unitTag: "A.B" }), { mode: "legacy" });
      await settle();
      const names = ["useSelfSource", "useRelations", "usePlanFind", "usePersonAuthorities", "useRetypeRecord"] as const;
      for (const n of names) expect(app.host[n].mock.calls.length, `${type} ${n}`).toBeGreaterThan(0);
      expect(app.host.useRetypeRecord.mock.calls.every((c) => c[0] === SCREEN)).toBe(true);
      expect(app.host.useRelations.mock.calls.every((c) => c[0] === "rec1" && c[1] === entityUriOf("rec1"))).toBe(true);
      expect(app.host.usePersonAuthorities.mock.calls.every((c) => c[0].id === "rec1" && c[1] === SCREEN)).toBe(true);
      view.unmount();
    }
  });
});

describe("Open in Ontology", () => {
  const term = { ontologyTerm: "https://ontology.example.test/base/t/Door" };

  test("the Type popover offers it when the host can open an ontology page, and opens the type's page", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", { unitTag: "A.B", ...term }), { mode: "legacy" });
    await settle();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("plan-type-about"));
    const open = await screen.findByRole("button", { name: /Open in Ontology/ });
    await user.click(open);
    expect(app.host.openOntologyConcept).toHaveBeenCalledWith("Door");
  });

  test("without it the popover has no such button", async () => {
    const app = makeApp();
    delete (app.host as Record<string, unknown>).openOntologyConcept;
    mountCard(app, app.seed("fn1", "t:Function", { unitTag: "A.B", ...term }), { mode: "legacy" });
    await settle();
    await userEvent.setup().click(screen.getByTestId("plan-type-about"));
    await waitFor(() => expect(screen.queryByTestId("plan-type-about")).toBeTruthy());
    expect(screen.queryByRole("button", { name: /Open in Ontology/ })).toBeNull();
  });
});
