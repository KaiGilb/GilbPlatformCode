// The README's wiring (test/example.tsx) renders the card for a record of each type the card covers, using the test fakes for the records.
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { FunctionScreen, startUp } from "../test/example";
import { SCREEN, rowOf } from "../test/app";
import { planKinds, settle } from "../test/helpers";

const props = { vaultId: SCREEN, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn() };

describe("the README example", () => {
  test("start-up sets the term origin", () => {
    expect(() => startUp()).not.toThrow();
  });

  test("renders an empty Function in view: the Type line, Description and Status only", async () => {
    const record = rowOf("fn1", "t:Function", { unitTag: "Content.Measure" });
    render(<FunctionScreen record={record} {...props} />);
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    await settle();
    expect(planKinds()).toEqual(["plan-type-level", "plan-description", "plan-status"]);
  });

  test("renders an empty Function Constraint the same way", async () => {
    const record = rowOf("fc1", "t:FunctionConstraint", { unitTag: "Must.Do" });
    render(<FunctionScreen record={record} {...props} />);
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    await settle();
    expect(planKinds()[0]).toBe("plan-type-level");
    expect(planKinds()).toEqual(["plan-type-level", "plan-description", "plan-status"]);
  });

  test("has none of the writers, so the card is read-only whatever canEdit says", async () => {
    const record = rowOf("fn1", "t:Function", { unitTag: "Content.Measure" });
    render(<FunctionScreen record={record} {...props} />);
    await settle();
    expect(screen.queryAllByRole("button", { name: "+ New status" })).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
});
