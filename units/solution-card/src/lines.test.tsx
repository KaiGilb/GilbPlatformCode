// The lines the Solution card draws for each of its two types, and in which order. The orders are the ones GilbApp's tests of the
// card asserted (SOLUTION_ORDER and DESIGN_CONSTRAINT_ORDER in RecordDetail.planSolution.vaultit.test.tsx), as the `data-group` of each group.
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { SolutionCard } from "./index";
import { App, SCREEN, makeApp, mountCard } from "../test/app";
import { planKinds, settle } from "../test/helpers";

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

async function shown(app: App, type: string, served: Record<string, unknown>, mode: "legacy" | "view" | "edit") {
  const row = app.seed("rec1", type, served);
  const view = mountCard(app, row, { mode, as: SolutionCard });
  await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
  await settle();
  return view;
}

describe("the Solution card in Edit, with every group shown (the seam GilbApp's field suites used)", () => {
  beforeAll(() => __startCardsInEditMode(true));
  afterAll(() => __startCardsInEditMode(false));

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
});

describe("with no card mode above it (always editing)", () => {
  test.each([
    ["t:Solution", SOLUTION_ORDER],
    ["t:DesignConstraint", DESIGN_CONSTRAINT_ORDER],
  ] as const)("%s draws its lines in order, the Type · Level · Version line first", async (type, order) => {
    await shown(makeApp(), type, { unitTag: "A.B" }, "legacy");
    expect(planKinds()).toEqual(order);
    expect(planKinds()[0]).toBe("plan-type-level");
  });

  test("the group titles of a Solution", async () => {
    await shown(makeApp(), "t:Solution", { unitTag: "A.B" }, "legacy");
    const titles = [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')]
      .filter((g) => (g.getAttribute("data-group") ?? "").startsWith("plan-") && g.getAttribute("data-group") !== "plan-type-level")
      .map((g) => g.querySelector("h3")?.textContent);
    expect(titles).toEqual(["Description", "Stakeholder", "Authority", "Type", "Meter", "Status", "Impacts", "Solution of Function", "Part of System"]);
  });
});

describe("the Solution's level", () => {
  test("is preselected as Solution and is not written until a choice is made", async () => {
    const app = makeApp({ ifMatch: true });
    await shown(app, "t:Solution", { unitTag: "Hinge.Tighten" }, "legacy");
    const level = screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement;
    expect(level.value).toBe("Solution");
    expect(app.server.log).toEqual([]);
  });
});

describe("the card has no guard of its own: the record's type decides the lines", () => {
  test("the same mounted card, given a Solution Constraint after a Solution, draws the lines of the constraint", async () => {
    const app = makeApp();
    const props = { vaultId: SCREEN, canEdit: true, onOpen: () => {}, onNotice: () => {} };
    const solution = app.seed("rec1", "t:Solution", { unitTag: "A.B" });
    const view = render(
      <app.Frame mode="legacy">
        <SolutionCard record={solution} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(SOLUTION_ORDER);
    expect(document.querySelector("[data-plan-label='Authority']")?.hasAttribute("data-plan-required")).toBe(false);
    const constraint = app.seed("rec1", "t:DesignConstraint", { unitTag: "A.B" });
    view.rerender(
      <app.Frame mode="legacy">
        <SolutionCard record={constraint} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(DESIGN_CONSTRAINT_ORDER);
    expect(document.querySelector("[data-plan-label='Authority']")?.getAttribute("data-plan-required")).toBe("true");
    const back = app.seed("rec1", "t:Solution", { unitTag: "A.B" });
    view.rerender(
      <app.Frame mode="legacy">
        <SolutionCard record={back} {...props} />
      </app.Frame>,
    );
    await settle();
    expect(planKinds()).toEqual(SOLUTION_ORDER);
  });

  test("a record of another type is not refused: the engine draws that type's lines", async () => {
    await shown(makeApp(), "t:Function", { unitTag: "Content.Measure" }, "legacy");
    expect(planKinds()).toEqual(FUNCTION_ORDER);
  });
});
