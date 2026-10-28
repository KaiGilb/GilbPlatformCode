// The README's wiring (test/example.tsx) renders the card for a record of each type the card covers, using the test fakes for the records.
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ValueScreen, startUp } from "../test/example";
import { SCREEN, rowOf } from "../test/app";
import { planKinds, settle } from "../test/helpers";

const props = { vaultId: SCREEN, canEdit: true, onOpen: vi.fn(), onNotice: vi.fn() };

describe("the README example", () => {
  test("start-up sets the term origin", () => {
    expect(() => startUp()).not.toThrow();
  });

  test("renders an empty Value in view: the picture, the five Value lines, Stakeholder and Value of Function", async () => {
    const record = rowOf("val1", "t:Value", { unitTag: "Speed" });
    render(<ValueScreen record={record} {...props} />);
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    await settle();
    expect(planKinds()).toEqual([
      "plan-type-level",
      "plan-picture",
      "plan-scale",
      "plan-endpoint",
      "plan-scale-variables",
      "plan-value-levels",
      "plan-value-meters",
      "plan-stakeholder",
      "plan-function-of-value",
    ]);
  });

  test("has none of the writers, so the card is read-only whatever canEdit says", async () => {
    const record = rowOf("val1", "t:Value", { unitTag: "Speed" });
    render(<ValueScreen record={record} {...props} />);
    await settle();
    expect(screen.queryByLabelText("Scale unit")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add Goal level" })).toBeNull();
  });
});
