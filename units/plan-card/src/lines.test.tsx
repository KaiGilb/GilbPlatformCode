// The lines each type of Plan card draws, and in which order. The orders are the ones GilbApp's tests of the cards asserted
// (FUNCTION_ORDER and CONSTRAINT_ORDER, the Solution orders, the Value and Development Resource lists), as the `data-group` of each group.
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { PlanFunctionForm } from "./index";
import { App, SCREEN, makeApp, mountCard } from "../test/app";
import { planKinds, settle } from "../test/helpers";

const FUNCTION_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-stakeholder",
  "plan-authority",
  "plan-part-of",
  "plan-sub-functions",
  "plan-meter",
  "plan-status",
  "plan-function-of-value",
  "plan-solutions",
  "plan-type",
];

const CONSTRAINT_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-authority",
  "plan-stakeholder",
  "plan-part-of",
  "plan-sub-functions",
  "plan-meter",
  "plan-status",
  "plan-type",
];

const SOLUTION_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-stakeholder",
  "plan-authority",
  "plan-type",
  "plan-meter",
  "plan-status",
  "plan-impacts",
  "plan-solution-of",
  "plan-part-of-system",
];

const DESIGN_CONSTRAINT_ORDER = [
  "plan-type-level",
  "plan-description",
  "plan-authority",
  "plan-stakeholder",
  "plan-type",
  "plan-meter",
  "plan-status",
  "plan-impacts",
  "plan-solution-of",
  "plan-part-of-system",
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

async function shown(app: App, type: string, served: Record<string, unknown>, mode: "legacy" | "view" | "edit") {
  const row = app.seed("rec1", type, served);
  const view = mountCard(app, row, { mode });
  await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
  await settle();
  return view;
}

describe("the card in Edit, with every group shown (the seam GilbApp's field suites used)", () => {
  beforeAll(() => __startCardsInEditMode(true));
  afterAll(() => __startCardsInEditMode(false));

  test("a Function draws its eleven lines in order, the Type · Level · Version line first", async () => {
    await shown(makeApp(), "t:Function", { unitTag: "Content.Measure", ontologyTerm: "Performance" }, "edit");
    expect(planKinds()).toEqual(FUNCTION_ORDER);
    expect(planKinds()[0]).toBe("plan-type-level");
  });

  test("a Function Constraint has Authority before Stakeholder, and no Function of Value or Solutions", async () => {
    await shown(makeApp(), "t:FunctionConstraint", { unitTag: "Must.Do", authority: "Ann" }, "edit");
    expect(planKinds()).toEqual(CONSTRAINT_ORDER);
    expect(planKinds()).not.toContain("plan-function-of-value");
    expect(planKinds()).not.toContain("plan-solutions");
    expect(document.querySelector("[data-plan-label='Authority']")?.getAttribute("data-plan-required")).toBe("true");
  });

  test("a Solution draws its ten lines, with none of the Function's links", async () => {
    await shown(makeApp(), "t:Solution", { unitTag: "Hinge.Tighten" }, "edit");
    expect(planKinds()).toEqual(SOLUTION_ORDER);
    for (const absent of ["plan-part-of", "plan-sub-functions", "plan-function-of-value", "plan-solutions"]) {
      expect(document.querySelector(`[data-group="${absent}"]`)).toBeNull();
    }
    expect(document.querySelector("[data-plan-label='Authority']")?.hasAttribute("data-plan-required")).toBe(false);
  });

  test("a Solution Constraint (t:DesignConstraint) has Authority before Stakeholder and Authority required", async () => {
    await shown(makeApp(), "t:DesignConstraint", { unitTag: "Must.Hold" }, "edit");
    expect(planKinds()).toEqual(DESIGN_CONSTRAINT_ORDER);
    expect(document.querySelector("[data-plan-label='Authority']")?.getAttribute("data-plan-required")).toBe("true");
    expect((screen.getByRole("radio", { name: "Solution Constraint" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Solution" }) as HTMLInputElement).checked).toBe(false);
  });

  test("a Value draws the picture first and then the Scale, Endpoint, Qualifiers, Levels and Meter lines", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "Performance" }, "edit");
    expect(planKinds()).toEqual(VALUE_EDIT_ORDER);
    expect(screen.queryByText("Ambition Level")).toBeTruthy();
    expect(screen.queryByText("Value of Function")).toBeTruthy();
  });

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

  test("a Value offers a Goal level", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "Performance" }, "edit");
    await waitFor(() => expect(screen.getByLabelText("Scale unit")).toBeTruthy());
    expect(screen.getByRole("button", { name: "Add Goal level" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Add Budget level" })).toBeNull();
    const kindsShown = screen.getAllByLabelText(/^Level \d+ kind$/).map((e) => (e as HTMLInputElement).value);
    expect(kindsShown.sort()).toEqual(["Goal", "Status", "Tolerable"]);
  });
});

describe("the card in view mode: a group with nothing in it is not drawn", () => {
  test("an empty Function shows the Type line, Description and Status only", async () => {
    await shown(makeApp(), "t:Function", { unitTag: "Content.Measure" }, "view");
    expect(planKinds()).toEqual(["plan-type-level", "plan-description", "plan-status"]);
  });

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
  test.each([
    ["t:Function", FUNCTION_ORDER],
    ["t:FunctionConstraint", CONSTRAINT_ORDER],
    ["t:Solution", SOLUTION_ORDER],
    ["t:DesignConstraint", DESIGN_CONSTRAINT_ORDER],
    ["t:Value", VALUE_EDIT_ORDER],
    ["t:Resource", RESOURCE_EDIT_ORDER],
  ] as const)("%s draws its lines in order, the Type · Level · Version line first", async (type, order) => {
    await shown(makeApp(), type, { unitTag: "A.B" }, "legacy");
    expect(planKinds()).toEqual(order);
    expect(planKinds()[0]).toBe("plan-type-level");
  });

  test("a type the card does not know draws the Function's lines", async () => {
    await shown(makeApp(), "t:Note", { unitTag: "A.B" }, "legacy");
    expect(planKinds()).toEqual(FUNCTION_ORDER);
  });

  test("the Description is called Ambition Level on a Value and Description on every other type", async () => {
    await shown(makeApp(), "t:Value", { unitTag: "A.B" }, "legacy");
    expect(within(document.querySelector('[data-group="plan-description"]') as HTMLElement).getByRole("heading").textContent).toBe("Ambition Level");
    document.body.innerHTML = "";
    await shown(makeApp(), "t:Solution", { unitTag: "A.B" }, "legacy");
    expect(within(document.querySelector('[data-group="plan-description"]') as HTMLElement).getByRole("heading").textContent).toBe("Description");
  });

  test("the group titles of a Function", async () => {
    await shown(makeApp(), "t:Function", { unitTag: "A.B" }, "legacy");
    const titles = [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')]
      .filter((g) => (g.getAttribute("data-group") ?? "").startsWith("plan-") && g.getAttribute("data-group") !== "plan-type-level")
      .map((g) => g.querySelector("h3")?.textContent);
    expect(titles).toEqual(["Description", "Stakeholder", "Authority", "Part of", "Sub-functions", "Meter", "Status", "Function of Value", "Solutions", "Type"]);
  });
});

describe("the lines follow the record's type live", () => {
  test("the same mounted card, given a record of another type, draws the lines of that type", async () => {
    const app = makeApp();
    const props = { vaultId: SCREEN, canEdit: true, onOpen: () => {}, onNotice: () => {} };
    const fn = app.seed("rec1", "t:Function", { unitTag: "A.B" });
    const view = render(
      <app.Frame mode="legacy">
        <PlanFunctionForm record={fn} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(FUNCTION_ORDER);
    const constraint = app.seed("rec1", "t:FunctionConstraint", { unitTag: "A.B" });
    view.rerender(
      <app.Frame mode="legacy">
        <PlanFunctionForm record={constraint} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(CONSTRAINT_ORDER);
    expect(document.querySelector("[data-plan-label='Authority']")?.getAttribute("data-plan-required")).toBe("true");
    const value = app.seed("rec1", "t:Value", { unitTag: "A.B" });
    view.rerender(
      <app.Frame mode="legacy">
        <PlanFunctionForm record={value} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(VALUE_EDIT_ORDER);
  });
});

describe("the Solution's level", () => {
  test("is preselected as Solution and is not written until a choice is made", async () => {
    const app = makeApp({ ifMatch: true });
    await shown(app, "t:Solution", { unitTag: "Hinge.Tighten" }, "legacy");
    const level = screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement;
    expect(level.value).toBe("Solution");
    expect(app.server.log).toEqual([]);
    await userEvent.selectOptions(level, "Product");
    await waitFor(() => expect(app.server.log.map((w) => w.body)).toEqual([{ level: "Product", lineSources: [] }]));
  });

  test("is Product on a Value and Business on a Development Resource, with no Level written either", async () => {
    const app = makeApp();
    await shown(app, "t:Value", { unitTag: "A.B" }, "legacy");
    expect((screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement).value).toBe("Product");
    document.body.innerHTML = "";
    await shown(app, "t:Resource", { unitTag: "A.B" }, "legacy");
    expect((screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement).value).toBe("Business");
    expect(app.server.log).toEqual([]);
  });
});
