// The lines the Value card draws, and in which order. The lists are the ones GilbApp's test of the card asserted
// (RecordDetail.planValueCard.vaultit.test.tsx), as the `data-group` of each group.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { ValueCard } from "./index";
import { App, makeApp, mountCard } from "../test/app";
import { planKinds, settle } from "../test/helpers";

const VALUE_VIEW_ORDER = [
  "plan-type-level",
  "plan-picture",
  "plan-scale",
  "plan-endpoint",
  "plan-scale-variables",
  "plan-value-levels",
  "plan-value-meters",
  "plan-stakeholder",
  "plan-function-of-value",
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

async function shown(app: App, type: string, served: Record<string, unknown>, mode: "legacy" | "view" | "edit") {
  const row = app.seed("rec1", type, served);
  const view = mountCard(app, row, { mode, as: ValueCard });
  await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
  await settle();
  return view;
}

describe("the Value card in Edit, with every group shown (the seam GilbApp's field suites used)", () => {
  beforeAll(() => __startCardsInEditMode(true));
  afterAll(() => __startCardsInEditMode(false));

  test("a Value draws the picture first and then the Scale, Endpoint, Qualifiers, Levels and Meter lines", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "Performance" }, "edit");
    expect(planKinds()).toEqual(VALUE_EDIT_ORDER);
    expect(screen.queryByText("Ambition Level")).toBeTruthy();
    expect(screen.queryByText("Value of Function")).toBeTruthy();
  });

  test("a Value offers a Goal level", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "Performance" }, "edit");
    await waitFor(() => expect(screen.getByLabelText("Scale unit")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Add Goal level" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Budget level" })).toBeNull();
    const kindsShown = screen.getAllByLabelText(/^Level \d+ kind$/).map((e) => (e as HTMLInputElement).value);
    expect(kindsShown.sort()).toEqual(["Goal", "Status", "Tolerable"]);
  });
});

describe("the Value card in view mode: a group with nothing in it is not drawn", () => {
  test("an empty Value shows its picture and value lines, with Stakeholder and Value of Function, and no Ambition Level", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "Performance" }, "view");
    expect(planKinds()).toEqual(VALUE_VIEW_ORDER);
    expect(screen.queryByText("Ambition Level")).toBeNull();
    expect(screen.queryByText("Illustration")).toBeTruthy();
    const line = document.querySelector("[data-kind='plan-type-level']")!;
    const pic = document.querySelector("[data-group='plan-picture']")!;
    expect(line.compareDocumentPosition(pic) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(line.textContent).toContain("Type:");
    expect(line.textContent).toContain("Level:");
    expect(line.textContent).toContain("Product");
  });
});

describe("with no card mode above it (always editing)", () => {
  test("a Value draws its lines in order, the Type · Level · Version line first", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "A.B" }, "legacy");
    expect(planKinds()).toEqual(VALUE_EDIT_ORDER);
    expect(planKinds()[0]).toBe("plan-type-level");
  });

  test("the Description is called Ambition Level on a Value", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "A.B" }, "legacy");
    expect(within(document.querySelector('[data-group="plan-description"]') as HTMLElement).getByRole("heading").textContent).toBe("Ambition Level");
  });

  test("the group titles of a Value", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "A.B" }, "legacy");
    const titles = [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')]
      .filter((g) => (g.getAttribute("data-group") ?? "").startsWith("plan-") && g.getAttribute("data-group") !== "plan-type-level")
      .map((g) => g.querySelector("h3")?.textContent);
    expect(titles).toEqual(["Illustration", "Scale", "Endpoint", "Qualifiers", "Levels", "Meter", "Stakeholder", "Value of Function", "Ambition Level", "Authority", "Type"]);
  });

  test("the level is preselected as Product, and nothing is written for it", async () => {
    const app = makeApp();
    await shown(app, "t:Value", { unitTag: "A.B" }, "legacy");
    expect((screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement).value).toBe("Product");
    expect(app.server.log).toEqual([]);
  });

  test("a Value has no Type switch", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "A.B" }, "legacy");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});

describe("the card has no guard of its own: the record's type decides the lines", () => {
  test("a record of another type is not refused: the engine draws that type's lines", async () => {
    await shown(makeApp(), "t:Resource", { unitTag: "Cost.RiverProject" }, "legacy");
    expect(planKinds()).toEqual(RESOURCE_EDIT_ORDER);
  });
});
