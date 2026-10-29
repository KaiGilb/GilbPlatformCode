// "+ Add your own" in place on the one card. When there is an online card, it becomes the master, and the user can add their own
// fields to it. The package draws the button, the in-place form, its keys and its focus; the field editors and the write are the app's.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { ADD_OWN_WORDS, AddYourOwn, AddYourOwnButton } from "./index";

afterEach(cleanup);

function Harness({ onSave, onCancel, message }: { onSave: () => Promise<boolean> | boolean; onCancel?: () => void; message?: string }) {
  const [v, setV] = useState("");
  return (
    <AddYourOwn noun="email" onOpen={() => setV("")} onSave={onSave} onCancel={onCancel} message={message}>
      <input aria-label="Email value" value={v} onChange={(e) => setV(e.target.value)} />
    </AddYourOwn>
  );
}

const button = () => screen.getByTestId("add-own");
const press = (el: HTMLElement) => el.click();
const key = (el: HTMLElement, k: string) => el.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true }));

describe("AddYourOwn", () => {
  // The user adds their own field in place, under the group.
  it("is a button reading '+ Add your own' with the field in its accessible name; the form is not drawn until it is pressed", () => {
    render(<Harness onSave={() => true} />);
    expect(button().tagName).toBe("BUTTON");
    expect(button().textContent).toBe(ADD_OWN_WORDS.button);
    expect(button().getAttribute("aria-label")).toBe("Add your own email");
    expect(screen.queryByTestId("add-own-form")).toBeNull();
  });

  it("pressing it opens the form in place with the app's field focused, Save, Cancel and the private hint", async () => {
    render(<Harness onSave={() => true} />);
    press(button());
    const form = await screen.findByTestId("add-own-form");
    expect(screen.queryByTestId("add-own")).toBeNull();
    expect(form.getAttribute("aria-label")).toBe("Your own email");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("Email value")));
    expect(screen.getByTestId("add-own-save").textContent).toBe(ADD_OWN_WORDS.save);
    expect(screen.getByTestId("add-own-cancel").textContent).toBe(ADD_OWN_WORDS.cancel);
    expect(screen.getByTestId("add-own-hint").textContent).toBe(ADD_OWN_WORDS.hint);
  });

  it("Enter in the field saves; a stored save closes the form and the focus returns to the button", async () => {
    const onSave = vi.fn(async () => true);
    render(<Harness onSave={onSave} />);
    press(button());
    const input = (await screen.findByLabelText("Email value")) as HTMLInputElement;
    // implicit submission: Enter in a text field of a form with a submit button
    input.form!.requestSubmit();
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(button()));
  });

  it("Esc cancels: nothing is saved, the app's cancel runs, the focus returns to the button", async () => {
    const onSave = vi.fn(() => true);
    const onCancel = vi.fn();
    render(<Harness onSave={onSave} onCancel={onCancel} />);
    press(button());
    const input = await screen.findByLabelText("Email value");
    key(input, "Escape");
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
    expect(onSave).not.toHaveBeenCalled();
    expect(onCancel).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(document.activeElement).toBe(button()));
  });

  it("Cancel saves nothing and returns the focus to the button", async () => {
    const onSave = vi.fn(() => true);
    render(<Harness onSave={onSave} />);
    press(button());
    press(await screen.findByTestId("add-own-cancel"));
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
    expect(onSave).not.toHaveBeenCalled();
    await waitFor(() => expect(document.activeElement).toBe(button()));
  });

  it("a save that is not stored keeps the form open with the app's message; Save is disabled while it runs", async () => {
    let finish: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (finish = r)));
    const { rerender } = render(<Harness onSave={onSave} />);
    press(button());
    press(await screen.findByTestId("add-own-save"));
    await waitFor(() => expect((screen.getByTestId("add-own-save") as HTMLButtonElement).disabled).toBe(true));
    expect(screen.getByTestId("add-own-save").textContent).toBe(ADD_OWN_WORDS.saving);
    finish(false);
    rerender(<Harness onSave={onSave} message="The email could not be saved." />);
    await waitFor(() => expect((screen.getByTestId("add-own-save") as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByTestId("add-own-form")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toBe("The email could not be saved.");
  });

  it("AddYourOwnButton alone (an app editor that opens elsewhere, a picker): the same words, and it takes a ref to return the focus to", () => {
    const onPress = vi.fn();
    let el: HTMLButtonElement | null = null;
    render(<AddYourOwnButton noun="skill" onPress={onPress} buttonRef={(b) => { el = b; }} />);
    expect(button().textContent).toBe(ADD_OWN_WORDS.button);
    expect(button().getAttribute("aria-label")).toBe("Add your own skill");
    press(button());
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(el).toBe(button());
  });

  it("is drawn with tokens only: the button meets the 44 px touch target and its text is the accent ink, never the faint ink", () => {
    render(<Harness onSave={() => true} />);
    expect(button().style.minHeight).toBe("44px");
    expect(button().style.color).toContain("--accent-ink");
  });
});

// The double-save guard does not rest on React state alone.
describe("AddYourOwn double-save guard", () => {
  it("two submits in the SAME task call the app's save once", async () => {
    let done: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    render(<Harness onSave={onSave} />);
    press(button());
    const input = (await screen.findByLabelText("Email value")) as HTMLInputElement;
    input.form!.requestSubmit();
    input.form!.requestSubmit();
    expect(onSave).toHaveBeenCalledTimes(1);
    done(true);
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
  });

  it("the field is aria-invalid while the message stands, and not after it is gone", async () => {
    const { rerender } = render(<Harness onSave={() => false} message="That is not an email address. Use name@domain.com." />);
    press(button());
    const input = await screen.findByLabelText("Email value");
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBe("true"));
    rerender(<Harness onSave={() => false} />);
    await waitFor(() => expect(input.getAttribute("aria-invalid")).toBeNull());
    expect(input.getAttribute("aria-describedby")).toBeNull();
  });
});
