// Ported from the app's PlanButtonRow test (1 case): the picker's button row reads [ Clear ] [ Done ].
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlanQualifierValue } from "./index";

afterEach(cleanup);

// Mac order. The positive action is the rightmost button; Clear / Cancel sit to its left.
describe("Plan button rows", () => {
  it("the qualifier picker reads [ Clear ] [ Done ], right-aligned, and Done still commits", () => {
    const onCommit = vi.fn();
    const close = vi.fn();
    const { container } = render(
      <PlanQualifierValue label="Platform" name="Platform" options={[{ name: "iPhone", definition: "" }]} value="" onCommit={onCommit} close={close} />,
    );
    const row = container.querySelector("[data-plan-button-row]") as HTMLElement;
    expect(row.className).toMatch(/justify-end/);
    expect([...row.querySelectorAll("button")].map((b) => b.textContent)).toEqual(["Clear", "Done"]);
    fireEvent.click(screen.getByLabelText("Platform iPhone"));
    fireEvent.click(screen.getByText("Done"));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalled();
  });
});
