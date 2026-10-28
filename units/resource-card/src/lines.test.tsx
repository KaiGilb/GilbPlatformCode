// The lines the Development Resource card draws, and in which order. The lists are the ones GilbApp's test of the card asserted
// (RecordDetail.planResourceCard.vaultit.test.tsx), as the `data-group` of each group.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { ResourceCard } from "./index";
import { App, makeApp, mountCard } from "../test/app";
import { planKinds, settle } from "../test/helpers";

const RESOURCE_EDIT_ORDER = [
  "plan-type-level",
  "plan-picture",
  "plan-scale",
  "plan-endpoint",
  "plan-scale-variables",
  "plan-value-levels",
  "plan-value-meters",
  "plan-resource-owner",
  "plan-stakeholder",
  "plan-description",
  "plan-authority",
  "plan-type",
];

const RESOURCE_VIEW_ORDER = [
  "plan-type-level",
  "plan-picture",
  "plan-scale",
  "plan-endpoint",
  "plan-scale-variables",
  "plan-value-levels",
  "plan-value-meters",
  "plan-stakeholder",
];

const VALUE_EDIT_ORDER = [
  "plan-type-level",
  "plan-picture",
  "plan-scale",
  "plan-endpoint",
  "plan-scale-variables",
  "plan-value-levels",
  "plan-value-meters",
  "plan-stakeholder",
  "plan-function-of-value",
  "plan-description",
  "plan-authority",
  "plan-type",
];

async function shown(app: App, type: string, served: Record<string, unknown>, mode: "legacy" | "view" | "edit") {
  const row = app.seed("rec1", type, served);
  const view = mountCard(app, row, { mode, as: ResourceCard });
  await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
  await settle();
  return view;
}

describe("the Development Resource card in Edit, with every group shown (the seam GilbApp's field suites used)", () => {
  beforeAll(() => __startCardsInEditMode(true));
  afterAll(() => __startCardsInEditMode(false));

  test("a Development Resource (t:Resource) is the Value card with Resource Owner before Stakeholder, and no Value of Function", async () => {
    await shown(makeApp(), "t:Resource", { unitTag: "Cost.RiverProject" }, "edit");
    expect(planKinds()).toEqual(RESOURCE_EDIT_ORDER);
    const line = document.querySelector("[data-kind='plan-type-level']")!;
    expect(line.textContent).toContain("Development Resource");
    expect((screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement).value).toBe("Business");
    expect(screen.getByText("Resource Owner")).toBeTruthy();
    expect(screen.queryByText("Value of Function")).toBeNull();
  });

  test("a Development Resource offers a Budget level, never a Goal", async () => {
    await shown(makeApp(), "t:Resource", { unitTag: "Cost.RiverProject" }, "edit");
    await waitFor(() => expect(screen.getByLabelText("Scale unit")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Add Budget level" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Goal level" })).toBeNull();
    const kindsShown = screen.getAllByLabelText(/^Level \d+ kind$/).map((e) => (e as HTMLInputElement).value);
    expect(kindsShown.sort()).toEqual(["Budget", "Status", "Tolerable"]);
    expect(document.body.textContent).not.toMatch(/Goal/);
  });
});

describe("the Development Resource card in view mode: a group with nothing in it is not drawn", () => {
  test("an empty Development Resource shows the Value lines with Business and no Value of Function", async () => {
    await shown(makeApp(), "t:Resource", { unitTag: "Cost.RiverProject" }, "view");
    expect(planKinds()).toEqual(RESOURCE_VIEW_ORDER);
    const line = document.querySelector("[data-kind='plan-type-level']")!;
    expect(line.textContent).toContain("Development Resource");
    expect(line.textContent).toContain("Business");
    expect(screen.queryByText("Value of Function")).toBeNull();
  });
});

describe("with no card mode above it (always editing)", () => {
  test("a Development Resource draws its lines in order, the Type · Level · Version line first", async () => {
    await shown(makeApp(), "t:Resource", { unitTag: "A.B" }, "legacy");
    expect(planKinds()).toEqual(RESOURCE_EDIT_ORDER);
    expect(planKinds()[0]).toBe("plan-type-level");
  });

  test("the level is preselected as Business, and nothing is written for it", async () => {
    const app = makeApp();
    await shown(app, "t:Resource", { unitTag: "A.B" }, "legacy");
    expect((screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement).value).toBe("Business");
    expect(app.server.log).toEqual([]);
  });

  test("a Development Resource has no Type switch", async () => {
    await shown(makeApp(), "t:Resource", { unitTag: "A.B" }, "legacy");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("the card has no guard of its own: the record's type decides the lines", () => {
  test("a record of another type is not refused: the engine draws that type's lines", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "Performance" }, "legacy");
    expect(planKinds()).toEqual(VALUE_EDIT_ORDER);
  });
});
