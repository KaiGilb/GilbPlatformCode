// The phone editor. The first two cases are the source's own (`ContactRows.addFocus.c214e9.test.tsx`; its click is a
// `fireEvent` here instead of `user-event`). The rest are new: the source drives this component only through the section.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PhoneValue } from "./PhoneValue";

afterEach(() => cleanup());

function setup(over: Partial<React.ComponentProps<typeof PhoneValue>> = {}) {
  const onCommit = vi.fn();
  const onDialSet = vi.fn();
  const utils = render(<PhoneValue value="" ariaLabel="Edit Phone" onCommit={onCommit} onDialSet={onDialSet} {...over} />);
  return { onCommit, onDialSet, ...utils };
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Edit Phone" }));
const code = () => screen.getByTestId("phone-country-code") as HTMLInputElement;
const national = () => screen.getByTestId("phone-national") as HTMLInputElement;
const leave = () => fireEvent.blur(screen.getByTestId("phone-parts"), { relatedTarget: document.body });

describe("a phone row just added opens ready for typing (the source's cases)", () => {
  it("startEditing: the country-code box has the cursor, after the +", async () => {
    render(<PhoneValue value="" ariaLabel="Edit Phone" onCommit={() => {}} startEditing />);
    const c = await screen.findByTestId("phone-country-code");
    expect(document.activeElement).toBe(c);
    expect((c as HTMLInputElement).selectionStart).toBe((c as HTMLInputElement).value.length);
  });
  it("control: an existing phone still shows its value until tapped", () => {
    render(<PhoneValue value="+47 91191229" ariaLabel="Edit Phone" onCommit={() => {}} />);
    expect(screen.queryByTestId("phone-country-code")).toBeNull();
    open();
    expect(screen.getByTestId("phone-country-code")).toBeTruthy();
  });
});

describe("what is shown before editing", () => {
  it("the number as text, trimmed, in a button named by ariaLabel", () => {
    setup({ value: "  +47 900 00 000  " });
    expect(screen.getByRole("button", { name: "Edit Phone" }).textContent).toBe("+47 900 00 000");
  });
  it("an empty phone shows 'Add phone'", () => {
    setup({ value: "   " });
    expect(screen.getByRole("button", { name: "Edit Phone" }).textContent).toBe("Add phone");
  });
});

describe("opening", () => {
  it("a stored phone is split at its space into the two boxes", () => {
    setup({ value: "+47 900 00 000" });
    open();
    expect(code().value).toBe("+47");
    expect(national().value).toBe("900 00 000");
  });
  it("a 'tel:' prefix is not shown in the boxes", () => {
    setup({ value: "tel:+46 701234567" });
    open();
    expect(code().value).toBe("+46");
    expect(national().value).toBe("701234567");
  });
  it("a stored number with no space keeps its code out of the code box (the code is not guessed)", () => {
    setup({ value: "+4790000000" });
    open();
    expect(code().value).toBe("+");
    expect(national().value).toBe("+4790000000");
  });
  it("an EMPTY phone starts with the suggested home code; a stored phone never does", () => {
    const a = setup({ value: "", suggestedDial: "47" });
    open();
    expect(code().value).toBe("+47");
    a.unmount();
    setup({ value: "900 00 000", suggestedDial: "47" });
    open();
    expect(code().value).toBe("+");
  });
  it("no suggestion: the code box shows only '+'", () => {
    setup({ value: "" });
    open();
    expect(code().value).toBe("+");
  });
  it("the code box takes digits only, and shows them behind a +", () => {
    setup({ value: "" });
    open();
    fireEvent.change(code(), { target: { value: "+4a7 " } });
    expect(code().value).toBe("+47");
  });
});

describe("the boxes are named", () => {
  it("'Country code' and 'Phone number' are the accessible names of the two boxes", () => {
    setup({ value: "+47 900" });
    open();
    expect(screen.getByRole("textbox", { name: "Country code" })).toBe(code());
    expect(screen.getByRole("textbox", { name: "Phone number" })).toBe(national());
    expect(code().inputMode).toBe("tel");
    expect(national().inputMode).toBe("tel");
  });
});

describe("leaving", () => {
  it("leaving with nothing changed saves nothing and closes", () => {
    const { onCommit, onDialSet } = setup({ value: "+47 900 00 000" });
    open();
    leave();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDialSet).not.toHaveBeenCalled();
    expect(screen.queryByTestId("phone-parts")).toBeNull();
  });
  it("moving focus from one box to the other does not leave", () => {
    const { onCommit } = setup({ value: "+47 900" });
    open();
    fireEvent.change(national(), { target: { value: "911" } });
    fireEvent.blur(code(), { relatedTarget: national() });
    expect(onCommit).not.toHaveBeenCalled();
    expect(screen.getByTestId("phone-parts")).toBeTruthy();
  });
  it("a changed number is saved on leaving, joined as '+<code> <number>'", () => {
    const { onCommit } = setup({ value: "+47 900 00 000" });
    open();
    fireEvent.change(national(), { target: { value: "911 11 111" } });
    leave();
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("+47 911 11 111");
    expect(screen.queryByTestId("phone-parts")).toBeNull();
  });
  it("Enter in the number box saves at once", () => {
    const { onCommit } = setup({ value: "+47 900" });
    open();
    fireEvent.change(national(), { target: { value: "911" } });
    fireEvent.keyDown(national(), { key: "Enter" });
    expect(onCommit).toHaveBeenCalledWith("+47 911");
  });
  it("another key does not save", () => {
    const { onCommit } = setup({ value: "+47 900" });
    open();
    fireEvent.change(national(), { target: { value: "911" } });
    fireEvent.keyDown(national(), { key: "a" });
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("emptying the number clears the phone: '' is saved", () => {
    const { onCommit } = setup({ value: "+47 900" });
    open();
    fireEvent.change(national(), { target: { value: "   " } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("");
  });
  it("typing back to what is stored saves nothing", () => {
    const { onCommit } = setup({ value: "+47 900" });
    open();
    fireEvent.change(national(), { target: { value: "911" } });
    fireEvent.change(national(), { target: { value: "900" } });
    leave();
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("a new number with a home code suggested is saved with that code", () => {
    const { onCommit } = setup({ value: "", suggestedDial: "47" });
    open();
    fireEvent.change(national(), { target: { value: "900 00 000" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("+47 900 00 000");
  });
  it("a new number with no code is saved as typed", () => {
    const { onCommit } = setup({ value: "" });
    open();
    fireEvent.change(national(), { target: { value: "900 00 000" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("900 00 000");
  });
  it("a code typed with nothing after it saves nothing (the phone stays empty)", () => {
    const { onCommit, onDialSet } = setup({ value: "" });
    open();
    fireEvent.change(code(), { target: { value: "46" } });
    leave();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDialSet).not.toHaveBeenCalled();
  });
});

describe("a number that already carries its own code (the app's joinPhone, not phone-text's)", () => {
  it("is kept as typed: the code box is not put in front of it", () => {
    const { onCommit } = setup({ value: "", suggestedDial: "47" });
    open();
    fireEvent.change(national(), { target: { value: "+1 555 0100" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("+1 555 0100");
  });
  it("the code box is read-only while the number starts with +, and says why", () => {
    setup({ value: "" });
    open();
    expect(code().readOnly).toBe(false);
    expect(code().title).toBe("");
    fireEvent.change(national(), { target: { value: "  +1 555" } });
    expect(code().readOnly).toBe(true);
    expect(code().title).toBe("The number already carries its country code");
    fireEvent.change(national(), { target: { value: "555" } });
    expect(code().readOnly).toBe(false);
  });
});

describe("a code beside a number that already carries one", () => {
  it("a stored number with no space and a code typed beside it joins to the same text: nothing is saved", () => {
    const { onCommit, onDialSet } = setup({ value: "+4790000000" });
    open();
    fireEvent.change(code(), { target: { value: "47" } });
    leave();
    expect(onCommit).not.toHaveBeenCalled();
    expect(onDialSet).not.toHaveBeenCalled();
  });
});

describe("onDialSet: the person changed the code (never for a prefill)", () => {
  it("accepting the suggested code is not a change", () => {
    const { onCommit, onDialSet } = setup({ value: "", suggestedDial: "47" });
    open();
    fireEvent.change(national(), { target: { value: "900" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("+47 900");
    expect(onDialSet).not.toHaveBeenCalled();
  });
  it("changing the suggested code reports the digits, once", () => {
    const { onCommit, onDialSet } = setup({ value: "", suggestedDial: "47" });
    open();
    fireEvent.change(code(), { target: { value: "+46" } });
    fireEvent.change(national(), { target: { value: "701234567" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("+46 701234567");
    expect(onDialSet).toHaveBeenCalledTimes(1);
    expect(onDialSet).toHaveBeenCalledWith("46");
  });
  it("changing the code of a stored phone reports it", () => {
    const { onDialSet } = setup({ value: "+47 900" });
    open();
    fireEvent.change(code(), { target: { value: "45" } });
    leave();
    expect(onDialSet).toHaveBeenCalledWith("45");
  });
  it("the same code is not reported twice from one row", () => {
    const { onCommit, onDialSet } = setup({ value: "+47 900" });
    open();
    fireEvent.change(code(), { target: { value: "45" } });
    leave();
    expect(onDialSet).toHaveBeenCalledTimes(1);
    // the parent has not stored it yet (the prop is the same): the person edits again and ends on the same code
    open();
    fireEvent.change(national(), { target: { value: "911" } });
    fireEvent.change(code(), { target: { value: "45" } });
    leave();
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onDialSet).toHaveBeenCalledTimes(1);
    // a different code is reported again
    open();
    fireEvent.change(code(), { target: { value: "46" } });
    leave();
    expect(onDialSet).toHaveBeenCalledTimes(2);
    expect(onDialSet).toHaveBeenLastCalledWith("46");
  });
  it("clearing the code is never reported, even after a code was reported earlier", () => {
    const { onDialSet } = setup({ value: "+47 900" });
    open();
    fireEvent.change(code(), { target: { value: "45" } });
    leave();
    expect(onDialSet).toHaveBeenCalledTimes(1);
    open();
    fireEvent.change(code(), { target: { value: "" } });
    leave();
    expect(onDialSet).toHaveBeenCalledTimes(1);
  });
  it("a changed code is reported even when the number was emptied in the same edit (as the source does)", () => {
    const { onCommit, onDialSet } = setup({ value: "+47 900" });
    open();
    fireEvent.change(code(), { target: { value: "45" } });
    fireEvent.change(national(), { target: { value: "" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("");
    expect(onDialSet).toHaveBeenCalledWith("45");
  });
  it("a code changed to nothing (cleared) is not reported", () => {
    const { onCommit, onDialSet } = setup({ value: "+47 900" });
    open();
    fireEvent.change(code(), { target: { value: "" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("900");
    expect(onDialSet).not.toHaveBeenCalled();
  });
  it("the member is optional: a change with no onDialSet saves without error", () => {
    const onCommit = vi.fn();
    render(<PhoneValue value="+47 900" ariaLabel="Edit Phone" onCommit={onCommit} />);
    open();
    fireEvent.change(code(), { target: { value: "45" } });
    leave();
    expect(onCommit).toHaveBeenCalledWith("+45 900");
  });
});
