// The Value card (and the Development Resource, which is the same card): an edit in a Value line goes to the right child-list hook of
// the write layer (levels, qualifiers, meters, Scale), the Endpoint is a patch of the Value, and the older stored lists are moved.
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { makeApp, mountCard, SCREEN, VAULT } from "../test/app";
import { entityUriOf } from "../test/server";
import { seedValueParts, type ValuePartsSeed } from "../test/seed";
import { settle } from "../test/helpers";

const VALUE_URI = entityUriOf("val1");

/** A Value card on a vault that accepts any version (the Value's own writes are checked in the Scale tests). */
function setup(served: Record<string, unknown> = {}, seed: ValuePartsSeed | null = null, type = "t:Value", over: Parameters<typeof makeApp>[0] = {}) {
  const app = makeApp({ ...over });
  const row = app.seed("val1", type, { unitTag: "Speed", ...served });
  if (seed) {
    const rows = seedValueParts(app.browser.qc, SCREEN, row, seed);
    for (const r of rows) app.server.set({ id: r.id, typeUri: r.typeUri, served: { ...(r.served!.facts as Record<string, unknown>) }, n: 1 });
  }
  const notices: (string | null)[] = [];
  mountCard(app, row, { mode: "legacy", onNotice: (n) => notices.push(n) });
  return { app, row, notices, user: userEvent.setup() };
}
const SEED: ValuePartsSeed = {
  levels: [{ levelKind: "Goal", levelValue: 5, levelVariables: { Release: "2" } }],
  qualifiers: [{ "a:name": "Release", "a:definition": "A release of the product" }],
  meters: [{ "a:meterQualifier": "During Development", lines: [{ "a:meterAgentKind": "human", "a:meterMethod": "review" }] }],
  scale: { "a:unit": "min" },
};
const WITH_SCALE = { hasScale: { "@id": entityUriOf("scale1") } };
const patched = (app: ReturnType<typeof makeApp>) => app.server.log.map((w) => ({ id: w.id, body: w.body }));

async function typeInto(user: ReturnType<typeof userEvent.setup>, label: string, text: string) {
  const box = screen.getByLabelText(label);
  await user.click(box);
  await user.clear(box);
  await user.type(box, text);
  await user.tab();
}

describe("the Scale", () => {
  test("the first edit makes the Scale record, then points the Value at it in one patch with the Value's version", async () => {
    const { app, user } = setup({}, null, "t:Value", { ifMatch: true });
    await typeInto(user, "Scale unit", "seconds");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.creates).toHaveLength(1);
    expect(app.server.creates[0]).toMatchObject({ vault: VAULT, typeUri: "t:Scale", facts: { unit: "seconds", partOf: { "@id": VALUE_URI } } });
    expect(app.server.log[0]).toEqual({ id: "val1", body: { hasScale: { "@id": entityUriOf("made1") } }, ifMatch: '"v1"' });
    // The Value is patched through the card's own write, so the card stores the saved row.
    expect(app.host.patchRecord).toHaveBeenCalledTimes(1);
    expect(app.host.storePlanRow.mock.calls.some((c) => c[1].id === "val1")).toBe(true);
  });

  test("a Value that has a Scale record patches that record, not the Value", async () => {
    const { app, user } = setup(WITH_SCALE, SEED);
    expect((screen.getByLabelText("Scale unit") as HTMLInputElement).value).toBe("min");
    await typeInto(user, "Scale unit", "hours");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.id).toBe("scale1");
    expect(app.server.log[0]!.body).toMatchObject({ unit: "hours" });
    expect(app.server.creates).toEqual([]);
  });

  test("a refused Scale link ends the Scale record it just made and says why", async () => {
    const { app, user, notices } = setup({}, null, "t:Value", { ifMatch: true });
    app.server.stale.add("val1");
    await typeInto(user, "Scale unit", "seconds");
    await waitFor(() => expect(app.server.creates).toHaveLength(1));
    await waitFor(() => expect(app.server.deletes).toEqual(["made1"]));
    expect(notices.some((n) => n && /changed elsewhere/.test(n))).toBe(true);
  });
});

describe("a level, a qualifier and a meter line are records of their own", () => {
  test("writing a value in a blank level makes one level record, a part of the Value, in the order it stands", async () => {
    const { app, user } = setup({}, null, "t:Value", { ifMatch: true });
    await typeInto(user, "Level 1 value", "5");
    await waitFor(() => expect(app.server.creates).toHaveLength(1));
    expect(app.server.creates[0]).toMatchObject({
      vault: VAULT,
      typeUri: "t:Status",
      facts: { unitTag: "Speed.Status", partOf: { "@id": VALUE_URI }, elementOrder: 1, scaleNumber: "5" },
    });
    // The Value itself is not written: the level is its own record.
    await settle();
    expect(app.server.log).toEqual([]);
    expect(app.host.patchRecord).not.toHaveBeenCalled();
  });

  test("changing a level is one patch of that level's record", async () => {
    const { app, user } = setup({}, SEED);
    expect((screen.getByLabelText("Level 1 value") as HTMLInputElement).value).toBe("5");
    await typeInto(user, "Level 1 value", "7");
    await waitFor(() => expect(patched(app).length).toBeGreaterThan(0));
    await settle();
    expect(patched(app)).toEqual([{ id: "lvl1", body: expect.objectContaining({ scaleNumber: "7" }) }]);
    expect(app.server.creates).toEqual([]);
  });

  test("changing a qualifier's definition is one patch of that qualifier's record", async () => {
    const { app, user } = setup({}, SEED);
    await typeInto(user, "Qualifier 1 definition", "A version of the product");
    await waitFor(() => expect(patched(app).length).toBeGreaterThan(0));
    await settle();
    expect(patched(app)).toEqual([{ id: "qual1", body: expect.objectContaining({ definition: "A version of the product" }) }]);
  });

  test("changing a meter line's method is one patch of that line's record", async () => {
    const { app, user } = setup({}, SEED);
    await typeInto(user, "Meter 1 HumanAgent", "audit");
    await waitFor(() => expect(patched(app).length).toBeGreaterThan(0));
    await settle();
    expect(patched(app)).toEqual([{ id: "mline1_1", body: expect.objectContaining({ meterMethod: "audit" }) }]);
  });

  test("none of these edits patch the Value", async () => {
    const { app, user } = setup(WITH_SCALE, SEED);
    await typeInto(user, "Level 1 value", "9");
    await typeInto(user, "Meter 1 HumanAgent", "audit");
    await waitFor(() => expect(patched(app).length).toBeGreaterThanOrEqual(2));
    await settle();
    expect(patched(app).map((p) => p.id).sort()).toEqual(["lvl1", "mline1_1"]);
    expect(app.host.patchRecord).not.toHaveBeenCalled();
  });
});

describe("renaming and removing a qualifier that levels use", () => {
  test("asks first, and Rename writes the qualifier and the level that uses it", async () => {
    const { app, user } = setup({}, SEED);
    await typeInto(user, "Qualifier 1 name", "Version");
    const ask = await screen.findByTestId("plan-qualifier-rename");
    expect(ask.textContent).toContain("Renames [Release] on 1 level");
    expect(app.server.log).toEqual([]);
    await user.click(within(ask).getByRole("button", { name: "Rename" }));
    await waitFor(() => expect(patched(app).map((p) => p.id).sort()).toEqual(["lvl1", "qual1"]));
    expect(screen.queryByTestId("plan-qualifier-rename")).toBeNull();
    expect(app.server.get("qual1")!.served.name).toBe("Version");
    expect(JSON.stringify(app.server.get("lvl1")!.served.levelQualifierChoice)).toContain("Version");
    expect(JSON.stringify(app.server.get("lvl1")!.served.levelQualifierChoice)).not.toContain("Release");
  });

  test("Cancel writes nothing", async () => {
    const { app, user } = setup({}, SEED);
    await typeInto(user, "Qualifier 1 name", "Version");
    await user.click(within(await screen.findByTestId("plan-qualifier-rename")).getByRole("button", { name: "Cancel" }));
    await settle();
    expect(app.server.log).toEqual([]);
    expect(screen.queryByTestId("plan-qualifier-rename")).toBeNull();
  });

  test("Escape closes the question", async () => {
    const { app, user } = setup({}, SEED);
    await typeInto(user, "Qualifier 1 name", "Version");
    await screen.findByTestId("plan-qualifier-rename");
    await user.keyboard("{Escape}");
    expect(screen.queryByTestId("plan-qualifier-rename")).toBeNull();
    expect(app.server.log).toEqual([]);
  });

  test("removing it asks, and Remove takes the choice out of the levels too", async () => {
    const { app, user } = setup({}, SEED);
    await user.click(screen.getByRole("button", { name: "Remove qualifier Release" }));
    const ask = await screen.findByTestId("plan-qualifier-remove");
    expect(ask.textContent).toContain("Used by 1 level. Remove [Release] from them too?");
    await user.click(within(ask).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(app.server.deletes).toContain("qual1"));
    await waitFor(() => expect(patched(app).some((p) => p.id === "lvl1")).toBe(true));
    expect(JSON.stringify(app.server.get("lvl1")!.served.levelQualifierChoice ?? null)).not.toContain("Release");
  });

  test("a new name that another qualifier already has is refused, and Merge is offered when no level sets both", async () => {
    const { app, user } = setup({}, { ...SEED, qualifiers: [{ "a:name": "Release" }, { "a:name": "Version" }] });
    await typeInto(user, "Qualifier 1 name", "Version");
    const ask = await screen.findByTestId("plan-qualifier-taken");
    expect(ask.textContent).toContain("[Version] already exists. Choose another name, or merge?");
    expect(within(ask).getByRole("button", { name: "Merge" })).toBeTruthy();
    await user.click(within(ask).getByRole("button", { name: "Choose another name" }));
    expect(screen.queryByTestId("plan-qualifier-taken")).toBeNull();
    expect(app.server.log).toEqual([]);
  });
});

describe("the Endpoint", () => {
  test("is a patch of the Value, with the Value's version", async () => {
    const { app, user } = setup({}, null, "t:Value", { ifMatch: true });
    await typeInto(user, "Subject words", "the app");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.id).toBe("val1");
    expect(app.server.log[0]!.ifMatch).toBe('"v1"');
    expect(Object.keys(app.server.log[0]!.body)).toEqual(["endpoint"]);
    expect(JSON.stringify(app.server.log[0]!.body)).toContain("the app");
  });

  test("moves out of the older a:valueEndpoint: the older member is dropped in the same patch", async () => {
    const { app, user } = setup({ valueEndpoint: { "a:subject": { "a:words": "old" } } }, null, "t:Value", { ifMatch: true });
    await typeInto(user, "Subject words", "the app");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(Object.keys(app.server.log[0]!.body).sort()).toEqual(["endpoint", "valueEndpoint"]);
    expect(app.server.log[0]!.body.valueEndpoint).toBeNull();
  });
});

describe("the Value's hooks run for every type of card", () => {
  test("a Function card calls the write layer's four hooks, switched off: nothing is read or created for it", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", { unitTag: "A.B" }), { mode: "legacy" });
    await settle();
    // useValueLevels, useValueMeters, useValueQualifiers and useValueScale each take the delete hook of the screen's vault on every render.
    const calls = app.browser.host.useDeleteRecord.mock.calls;
    expect(calls.length).toBeGreaterThanOrEqual(4);
    expect(calls.every((c) => c[0] === SCREEN)).toBe(true);
    expect(app.server.creates).toEqual([]);
    expect(app.server.log).toEqual([]);
    expect(app.server.reads).toEqual([]);
  });

  test("a Function whose parts hold a Meter does not read the Meter's lines; a Value with the same parts does", async () => {
    const parts: ValuePartsSeed = { meters: [{ "a:meterQualifier": "During Development", lines: [{ "a:meterAgentKind": "human", "a:meterMethod": "review" }] }] };
    const asked = (app: ReturnType<typeof makeApp>) =>
      app.browser.host.usePlanFinds.mock.calls.flatMap((c) => (c[2] as readonly { id: string; enabled: boolean }[]).filter((p) => p.enabled).map((p) => p.id));
    const fn = makeApp();
    seedValueParts(fn.browser.qc, SCREEN, fn.seed("fn1", "t:Function", { unitTag: "A.B" }), parts);
    mountCard(fn, fn.seed("fn1", "t:Function", { unitTag: "A.B" }), { mode: "legacy" });
    await settle();
    expect(asked(fn)).not.toContain("meter1");
    document.body.innerHTML = "";
    const value = makeApp();
    seedValueParts(value.browser.qc, SCREEN, value.seed("val1", "t:Value", { unitTag: "Speed" }), parts);
    mountCard(value, value.seed("val1", "t:Value", { unitTag: "Speed" }), { mode: "legacy" });
    await settle();
    expect(asked(value)).toContain("meter1");
  });

  test("a Value card turns them on: its levels, qualifiers, meters and Scale are read from its parts", async () => {
    const { app } = setup(WITH_SCALE, SEED);
    expect((screen.getByLabelText("Level 1 value") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText("Qualifier 1 name") as HTMLInputElement).value).toBe("Release");
    expect((screen.getByLabelText("Meter 1 HumanAgent") as HTMLTextAreaElement).value).toBe("review");
    expect((screen.getByLabelText("Scale unit") as HTMLInputElement).value).toBe("min");
    expect(app.browser.host.useDeleteRecord.mock.calls.length).toBeGreaterThanOrEqual(4);
  });
});

describe("the older stored lists", () => {
  const OLD = { valueLevels: [{ "a:levelKind": "Goal", "a:levelValue": 5 }] };

  test("show read-only, with one button that moves them into records of their own", async () => {
    const { app } = setup(OLD);
    expect(screen.getByRole("button", { name: "Move 1 level into their own records" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Goal level" })).toBeNull();
    expect(app.server.creates).toEqual([]);
  });

  test("the move makes the level records, then one patch takes the older list out of the Value", async () => {
    const { app, user } = setup(OLD, null, "t:Value", { ifMatch: true });
    await user.click(screen.getByRole("button", { name: "Move 1 level into their own records" }));
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.creates).toHaveLength(1);
    expect(app.server.creates[0]).toMatchObject({ typeUri: "t:Goal", facts: { partOf: { "@id": VALUE_URI } } });
    expect(app.server.log[0]).toEqual({ id: "val1", body: { valueLevels: null }, ifMatch: '"v1"' });
  });

  test("a move that stops puts the Value back as it was: the records made are ended and the older list is untouched", async () => {
    const { app, user, notices } = setup(
      { valueLevels: [{ "a:levelKind": "Goal", "a:levelValue": 5 }, { "a:levelKind": "Tolerable", "a:levelValue": 3 }] },
      null,
      "t:Value",
      { ifMatch: true },
    );
    app.server.failCreate.add(2);
    await user.click(screen.getByRole("button", { name: /^Move 2 levels into their own records$/ }));
    await waitFor(() => expect(notices.some((n) => n && n.startsWith("Not moved"))).toBe(true));
    expect(app.server.log).toEqual([]);
    await waitFor(() => expect(app.server.deletes).toHaveLength(1));
    expect(app.server.get("val1")!.served.valueLevels).toBeTruthy();
  });

  test("a record that cannot be ended is named, with a button to try ending it again", async () => {
    const { app, user } = setup(
      { valueLevels: [{ "a:levelKind": "Goal", "a:levelValue": 5 }, { "a:levelKind": "Tolerable", "a:levelValue": 3 }] },
      null,
      "t:Value",
      { ifMatch: true },
    );
    app.server.failCreate.add(2);
    app.server.failDelete.add("made1");
    await user.click(screen.getByRole("button", { name: /^Move 2 levels into their own records$/ }));
    const stuck = await screen.findByTestId("plan-move-stuck");
    expect(stuck.textContent).toContain("Move stopped. 1 record was made and could not be removed");
    app.server.failDelete.clear();
    await user.click(within(stuck).getByRole("button", { name: "Try removing them again" }));
    await waitFor(() => expect(screen.queryByTestId("plan-move-stuck")).toBeNull());
    expect(app.server.deletes).toEqual(["made1"]);
    expect(app.server.log).toEqual([]);
  });
});

describe("the version on the Type · Level · Version line", () => {
  test("is the newest of the Value, its levels, its qualifiers and its meters", async () => {
    const { app } = setup({}, { levels: [{ levelKind: "Goal", levelValue: 5, __updatedAt: Date.UTC(2026, 5, 1) }] });
    expect(app.host.liveRow).toBeDefined();
    expect(document.querySelector("[data-kind='plan-type-level']")!.textContent).toContain("2026-06-01");
  });
});
