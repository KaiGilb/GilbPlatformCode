// Gap tests for AddYourOwn: every control is usable by keyboard, and an error is associated with its field.
// Measured first in a real browser: a save that fails after pressing Save leaves the focus on <body>, and Esc then no
// longer closes the form (its key handler is on the form).
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { AddYourOwn } from "./index";

afterEach(cleanup);

function Harness({ onSave, message }: { onSave: () => Promise<boolean> | boolean; message?: string }) {
  const [v, setV] = useState("");
  return (
    <AddYourOwn noun="email" onOpen={() => setV("")} onSave={onSave} message={message}>
      <input aria-label="Email value" value={v} onChange={(e) => setV(e.target.value)} />
    </AddYourOwn>
  );
}
const open = async () => {
  screen.getByTestId("add-own").click();
  return (await screen.findByLabelText("Email value")) as HTMLInputElement;
};

describe("AddYourOwn gaps", () => {
  it("a save pressed on Save that is NOT stored puts the focus back in the field (keyboard users keep their place; Esc still works)", async () => {
    let done: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    render(<Harness onSave={onSave} message="The email could not be saved: Failed to fetch" />);
    await open();
    const save = screen.getByTestId("add-own-save") as HTMLButtonElement;
    save.focus();
    save.click();
    await waitFor(() => expect(save.disabled).toBe(true));
    done(false);
    await waitFor(() => expect(save.disabled).toBe(false));
    // the browser moved the focus off the disabled Save to <body>; the form must bring it back into itself, to the field
    expect(document.activeElement).toBe(screen.getByLabelText("Email value"));
  });

  it("the app's message (validation or save error) is associated with the field (aria-describedby names it)", async () => {
    render(<Harness onSave={() => false} message="That is not an email address. Use name@domain.com." />);
    const input = await open();
    const msg = screen.getByTestId("add-own-message");
    expect(msg.id).not.toBe("");
    const described = `${input.getAttribute("aria-describedby") ?? ""} ${input.closest("form")?.getAttribute("aria-describedby") ?? ""}`;
    // ⚠ the form's own aria-describedby names only the hint; the error must reach the field itself
    expect((input.getAttribute("aria-describedby") ?? "").split(/\s+/)).toContain(msg.id);
    expect(described).toContain(msg.id);
  });

  it("a second and third submit while the first save runs (double click, Enter + click) call the app's save ONCE", async () => {
    let done: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    render(<Harness onSave={onSave} />);
    const input = await open();
    // each press is its own task, as a person's double click or Enter + click is (measured in a real browser: one write)
    input.form!.requestSubmit();
    await act(async () => {});
    input.form!.requestSubmit();
    await act(async () => {});
    (screen.getByTestId("add-own-save") as HTMLButtonElement).click();
    await act(async () => {});
    expect(onSave).toHaveBeenCalledTimes(1);
    done(true);
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
  });
});
