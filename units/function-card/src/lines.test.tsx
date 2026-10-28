// The lines the Function card draws for each of its two types, and in which order. The orders are the ones GilbApp's tests of the
// card asserted (FUNCTION_ORDER and CONSTRAINT_ORDER in RecordDetail.planCard.vaultit.test.tsx), as the `data-group` of each group.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { FunctionCard } from "./index";
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

async function shown(app: App, type: string, served: Record<string, unknown>, mode: "legacy" | "view" | "edit") {
  const row = app.seed("rec1", type, served);
  const view = mountCard(app, row, { mode, as: FunctionCard });
  await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
  await settle();
  return view;
}

describe("the Function card in Edit, with every group shown (the seam GilbApp's field suites used)", () => {
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
});

describe("the Function card in view mode: a group with nothing in it is not drawn", () => {
  test("an empty Function shows the Type line, Description and Status only", async () => {
    await shown(makeApp(), "t:Function", { unitTag: "Content.Measure" }, "view");
    expect(planKinds()).toEqual(["plan-type-level", "plan-description", "plan-status"]);
  });
});

describe("with no card mode above it (always editing)", () => {
  test.each([
    ["t:Function", FUNCTION_ORDER],
    ["t:FunctionConstraint", CONSTRAINT_ORDER],
  ] as const)("%s draws its lines in order, the Type · Level · Version line first", async (type, order) => {
    await shown(makeApp(), type, { unitTag: "A.B" }, "legacy");
    expect(planKinds()).toEqual(order);
    expect(planKinds()[0]).toBe("plan-type-level");
  });

  test("the group titles of a Function", async () => {
    await shown(makeApp(), "t:Function", { unitTag: "A.B" }, "legacy");
    const titles = [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')]
      .filter((g) => (g.getAttribute("data-group") ?? "").startsWith("plan-") && g.getAttribute("data-group") !== "plan-type-level")
      .map((g) => g.querySelector("h3")?.textContent);
    expect(titles).toEqual(["Description", "Stakeholder", "Authority", "Part of", "Sub-functions", "Meter", "Status", "Function of Value", "Solutions", "Type"]);
  });
});

describe("the card has no guard of its own: the record's type decides the lines", () => {
  test("the same mounted card, given a Function Constraint after a Function, draws the lines of the constraint", async () => {
    const app = makeApp();
    const props = { vaultId: SCREEN, canEdit: true, onOpen: () => {}, onNotice: () => {} };
    const fn = app.seed("rec1", "t:Function", { unitTag: "A.B" });
    const view = render(
      <app.Frame mode="legacy">
        <FunctionCard record={fn} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(FUNCTION_ORDER);
    const constraint = app.seed("rec1", "t:FunctionConstraint", { unitTag: "A.B" });
    view.rerender(
      <app.Frame mode="legacy">
        <FunctionCard record={constraint} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(CONSTRAINT_ORDER);
    expect(document.querySelector("[data-plan-label='Authority']")?.getAttribute("data-plan-required")).toBe("true");
    const back = app.seed("rec1", "t:Function", { unitTag: "A.B" });
    view.rerender(
      <app.Frame mode="legacy">
        <FunctionCard record={back} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(FUNCTION_ORDER);
  });

  test("a record of another type is not refused: the engine draws that type's lines", async () => {
    await shown(makeApp(), "t:Solution", { unitTag: "Hinge.Tighten" }, "legacy");
    expect(planKinds()).toEqual(SOLUTION_ORDER);
  });
});
