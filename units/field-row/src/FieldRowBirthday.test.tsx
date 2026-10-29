// The field row with the `birthday` picker: the value reads as a day; a read-only row shows it and opens nothing; an editable row opens
// the shared picker. Ported from the app's FieldRow birthday test with the same inputs and expectations.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FieldRow } from "./index";

afterEach(cleanup);

describe("FieldRow · birthday", () => {
  it("reads '14 March 1980' and, read only, opens nothing", () => {
    render(<FieldRow label="Birthday" value="1980-03-14" picker="birthday" readOnly onCommitValue={vi.fn()} />);
    const value = screen.getByRole("button", { name: "Edit Birthday" });
    expect(value.textContent).toBe("14 March 1980");
    fireEvent.click(value);
    expect(screen.queryByTestId("birthday-picker")).toBeNull();
  });

  it("editable: opens the picker on the stored day; Clear empties the field; an odd value reads as stored", () => {
    const onCommitValue = vi.fn();
    render(<FieldRow label="Birthday" value="--03-14" picker="birthday" onCommitValue={onCommitValue} />);
    expect(screen.getByRole("button", { name: "Edit Birthday" }).textContent).toBe("14 March");
    fireEvent.click(screen.getByRole("button", { name: "Edit Birthday" }));
    expect((screen.getByTestId("birthday-day") as HTMLSelectElement).value).toBe("14");
    expect((screen.getByTestId("birthday-month") as HTMLSelectElement).value).toBe("3");
    fireEvent.click(screen.getByTestId("birthday-clear"));
    expect(onCommitValue).toHaveBeenCalledWith("");
    cleanup();
    render(<FieldRow label="Birthday" value="31/02" picker="birthday" onCommitValue={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit Birthday" }).textContent).toBe("31/02");
  });

  it("a non-birthday row with a date-shaped value is not worded as a date", () => {
    render(<FieldRow label="Nickname" value="--03-14" onCommitValue={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Edit Nickname" }).textContent).toBe("--03-14");
  });
});
