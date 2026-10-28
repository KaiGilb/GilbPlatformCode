// A host with none of its writers, or a person who may not write, gets a card with no edit controls.
import { describe, expect, test } from "vitest";
import { screen } from "@testing-library/react";
import { makeApp, mountCard } from "../test/app";
import { planKinds, settle } from "../test/helpers";

const controls = () => ({
  newStatus: screen.queryAllByRole("button", { name: "+ New status" }).length,
  typeRadios: screen.queryAllByRole("radio").length,
  // A value that is there stays as a disabled button with its text; an enabled one, or a box, is a way to edit.
  meterEdit:
    screen.queryAllByRole("button", { name: /^Edit (HumanAgent|AiAgent|Instrument)$/ }).filter((b) => !(b as HTMLButtonElement).disabled).length +
    screen.queryAllByRole("textbox", { name: /^Edit (HumanAgent|AiAgent|Instrument)$/ }).length,
  level: screen.queryAllByRole("combobox", { name: "Level" }).length,
  noneFits: screen.queryAllByRole("button", { name: "None fits" }).length,
  chooseType: screen.queryAllByRole("button", { name: /^(Choose a type|Edit Type)$/ }).length,
});

const served = { unitTag: "Content.Measure", hasMeter: [{ "a:meterAgentKind": "human", "a:method": "review" }], levelStatements: [{ "a:status": "Planned", "a:statusWhen": "2026-10-01" }] };

describe("a card that cannot write", () => {
  test("with writers and a person who may write, the edit controls are there", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy" });
    await settle();
    const c = controls();
    expect(c.newStatus).toBe(1);
    expect(c.typeRadios).toBeGreaterThan(0);
    expect(c.meterEdit).toBeGreaterThan(0);
    expect(c.level).toBe(1);
    expect(c.noneFits).toBe(1);
    expect(c.chooseType).toBe(1);
  });

  test("a host without its writers (patchRecord, the retype, the Authority writes) draws the card with no edit controls", async () => {
    const app = makeApp({ readOnly: true });
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy" });
    await settle();
    expect(controls()).toEqual({ newStatus: 0, typeRadios: 0, meterEdit: 0, level: 0, noneFits: 0, chooseType: 0 });
    expect(screen.getByTestId("plan-function-form").textContent).toContain("review");
    expect(screen.getByTestId("plan-function-form").textContent).toContain("Planned");
  });

  test.each([
    ["patchRecord", "patchRecord"],
    ["the retype", "useRetypeRecord"],
    ["migratedAuthorityRelation", "migratedAuthorityRelation"],
    ["writeAuthorityRelation", "writeAuthorityRelation"],
  ] as const)("a host that leaves out only %s is read-only too", async (_name, member) => {
    const app = makeApp();
    delete (app.host as Record<string, unknown>)[member];
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy" });
    await settle();
    expect(controls()).toEqual({ newStatus: 0, typeRadios: 0, meterEdit: 0, level: 0, noneFits: 0, chooseType: 0 });
  });

  test("a person who may not write (canEdit false) sees the same as a host with no writers", async () => {
    const a = makeApp({ readOnly: true });
    mountCard(a, a.seed("fn1", "t:Function", served), { mode: "legacy" });
    await settle();
    const bare = { kinds: planKinds(), controls: controls(), text: screen.getByTestId("plan-function-form").textContent };
    document.body.innerHTML = "";
    const b = makeApp();
    mountCard(b, b.seed("fn1", "t:Function", served), { mode: "legacy", canEdit: false });
    await settle();
    expect({ kinds: planKinds(), controls: controls(), text: screen.getByTestId("plan-function-form").textContent }).toEqual(bare);
  });

  test("the Value lines are read-only too: no Add level, no paste", async () => {
    const app = makeApp({ readOnly: true });
    mountCard(app, app.seed("val1", "t:Value", { unitTag: "Speed" }), { mode: "legacy" });
    await settle();
    expect(screen.queryByRole("button", { name: "Add Goal level" })).toBeNull();
    expect(screen.queryByLabelText("Paste lines")).toBeNull();
    expect(screen.queryByLabelText("Scale unit")).toBeNull();
  });
});
