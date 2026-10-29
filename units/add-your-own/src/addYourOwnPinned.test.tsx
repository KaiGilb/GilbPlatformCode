// Every export is pinned here: the words, the button alone, the form's keys, its disabled states and its failure paths.
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import * as unit from "./index";
import { ADD_OWN_WORDS, AddYourOwn, AddYourOwnButton, type AddYourOwnButtonProps, type AddYourOwnProps } from "./index";

afterEach(cleanup);

const button = () => screen.getByTestId("add-own");
const key = (el: HTMLElement, k: string) => {
  const ev = new KeyboardEvent("keydown", { key: k, bubbles: true, cancelable: true });
  el.dispatchEvent(ev);
  return ev;
};

function Harness(props: Partial<AddYourOwnProps>) {
  const [v, setV] = useState("");
  return (
    <AddYourOwn noun="phone" onSave={() => true} {...props}>
      <input aria-label="Phone value" value={v} onChange={(e) => setV(e.target.value)} />
    </AddYourOwn>
  );
}

describe("the unit's exports", () => {
  it("offers exactly these names", () => {
    expect(Object.keys(unit).sort()).toEqual(["ADD_OWN_WORDS", "AddYourOwn", "AddYourOwnButton"]);
  });
  it("types the two components' props", () => {
    const b: AddYourOwnButtonProps = { noun: "x", onPress: () => {} };
    const f: AddYourOwnProps = { noun: "x", onSave: () => true, children: null };
    expect(b.noun).toBe(f.noun);
  });
});

describe("ADD_OWN_WORDS", () => {
  it("holds exactly these words", () => {
    expect(ADD_OWN_WORDS.button).toBe("+ Add your own");
    expect(ADD_OWN_WORDS.buttonName("email")).toBe("Add your own email");
    expect(ADD_OWN_WORDS.formName("email")).toBe("Your own email");
    expect(ADD_OWN_WORDS.save).toBe("Save");
    expect(ADD_OWN_WORDS.saving).toBe("Saving…");
    expect(ADD_OWN_WORDS.cancel).toBe("Cancel");
    expect(ADD_OWN_WORDS.hint).toBe("Saved on your card, private. Their online card is not changed.");
    expect(Object.keys(ADD_OWN_WORDS).sort()).toEqual(["button", "buttonName", "cancel", "formName", "hint", "save", "saving"]);
  });
});

describe("AddYourOwnButton", () => {
  it("is a button of type button that is disabled when told so, and then does not call onPress", () => {
    const onPress = vi.fn();
    render(<AddYourOwnButton noun="phone" onPress={onPress} disabled />);
    expect(button().getAttribute("type")).toBe("button");
    expect((button() as HTMLButtonElement).disabled).toBe(true);
    button().click();
    expect(onPress).not.toHaveBeenCalled();
  });
  it("is enabled by default", () => {
    render(<AddYourOwnButton noun="phone" onPress={() => {}} />);
    expect((button() as HTMLButtonElement).disabled).toBe(false);
  });
});

describe("AddYourOwn", () => {
  it("calls onOpen when the button is pressed, and not before", async () => {
    const onOpen = vi.fn();
    render(<Harness onOpen={onOpen} />);
    expect(onOpen).not.toHaveBeenCalled();
    button().click();
    await screen.findByTestId("add-own-form");
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
  it("does not open when disabled", () => {
    render(<Harness disabled />);
    button().click();
    expect(screen.queryByTestId("add-own-form")).toBeNull();
  });
  it("describes the form by its hint, and turns the browser's own validation off", async () => {
    render(<Harness />);
    button().click();
    const form = await screen.findByTestId("add-own-form");
    expect(form.hasAttribute("novalidate")).toBe(true);
    expect(form.getAttribute("aria-describedby")).toBe(screen.getByTestId("add-own-hint").id);
    expect(screen.getByTestId("add-own-save").getAttribute("type")).toBe("submit");
    expect(screen.getByTestId("add-own-cancel").getAttribute("type")).toBe("button");
  });
  it("Save submits the form and a stored save closes it", async () => {
    const onSave = vi.fn(() => true);
    render(<Harness onSave={onSave} />);
    button().click();
    (await screen.findByTestId("add-own-save")).click();
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
    expect(onSave).toHaveBeenCalledTimes(1);
  });
  it("Escape cancels, and stops the key from reaching an outer handler; any other key does nothing", async () => {
    const onCancel = vi.fn();
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <Harness onCancel={onCancel} />
      </div>,
    );
    button().click();
    const input = await screen.findByLabelText("Phone value");
    const other = key(input, "a");
    expect(other.defaultPrevented).toBe(false);
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("add-own-form")).toBeTruthy();
    outer.mockClear();
    const esc = key(input, "Escape");
    expect(esc.defaultPrevented).toBe(true);
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(outer).not.toHaveBeenCalled();
  });
  it("Cancel calls onCancel once", async () => {
    const onCancel = vi.fn();
    render(<Harness onCancel={onCancel} />);
    button().click();
    (await screen.findByTestId("add-own-cancel")).click();
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
  it("while a save runs, Cancel is disabled and Escape does nothing", async () => {
    let done: (v: boolean) => void = () => {};
    const onSave = vi.fn(() => new Promise<boolean>((r) => (done = r)));
    const onCancel = vi.fn();
    render(<Harness onSave={onSave} onCancel={onCancel} />);
    button().click();
    const input = (await screen.findByLabelText("Phone value")) as HTMLInputElement;
    input.form!.requestSubmit();
    await waitFor(() => expect((screen.getByTestId("add-own-cancel") as HTMLButtonElement).disabled).toBe(true));
    key(input, "Escape");
    await act(async () => {});
    expect(onCancel).not.toHaveBeenCalled();
    expect(screen.getByTestId("add-own-form")).toBeTruthy();
    done(true);
    await waitFor(() => expect(screen.queryByTestId("add-own-form")).toBeNull());
  });
  it("a save that answers false, or that throws, keeps the form open and Save is enabled again", async () => {
    for (const onSave of [() => false, async () => false, () => { throw new Error("no"); }, async () => { throw new Error("no"); }]) {
      const { unmount } = render(<Harness onSave={onSave} />);
      button().click();
      (await screen.findByTestId("add-own-save")).click();
      await waitFor(() => expect((screen.getByTestId("add-own-save") as HTMLButtonElement).disabled).toBe(false));
      expect(screen.getByTestId("add-own-form")).toBeTruthy();
      expect(screen.getByTestId("add-own-save").textContent).toBe(ADD_OWN_WORDS.save);
      unmount();
    }
  });
  it("shows the app's message as an alert tied to the field, and removes the tie when the message goes", async () => {
    const { rerender } = render(<Harness message="Bad number" />);
    button().click();
    const input = await screen.findByLabelText("Phone value");
    const msg = screen.getByRole("alert");
    expect(msg.textContent).toBe("Bad number");
    await waitFor(() => expect(input.getAttribute("aria-describedby")).toBe(msg.id));
    rerender(<Harness />);
    await waitFor(() => expect(input.getAttribute("aria-describedby")).toBeNull());
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("keeps the field's own aria-describedby when it ties and unties the message", async () => {
    function Own({ message }: { message?: string }) {
      return (
        <AddYourOwn noun="phone" onSave={() => true} message={message}>
          <input aria-label="Phone value" aria-describedby="mine" />
        </AddYourOwn>
      );
    }
    const { rerender } = render(<Own message="Bad" />);
    button().click();
    const input = await screen.findByLabelText("Phone value");
    await waitFor(() => expect(input.getAttribute("aria-describedby")?.split(" ")).toContain("mine"));
    expect(input.getAttribute("aria-describedby")?.split(" ")).toHaveLength(2);
    rerender(<Own />);
    await waitFor(() => expect(input.getAttribute("aria-describedby")).toBe("mine"));
    expect(input.getAttribute("aria-invalid")).toBeNull();
  });
  it("does not touch a field's own aria-invalid when no message was ever shown", async () => {
    render(
      <AddYourOwn noun="phone" onSave={() => true}>
        <input aria-label="Phone value" aria-invalid="true" />
      </AddYourOwn>,
    );
    button().click();
    const input = await screen.findByLabelText("Phone value");
    await act(async () => {});
    expect(input.getAttribute("aria-invalid")).toBe("true");
  });
  it("puts the focus in the first enabled field when it opens", async () => {
    render(
      <AddYourOwn noun="phone" onSave={() => true}>
        <input aria-label="Off" disabled />
        <input aria-label="On" />
      </AddYourOwn>,
    );
    button().click();
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText("On")));
  });
});
