import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { openPortalRoots } from "@kaigilb/gilbplatformcode-open-popups";
import { FieldRow } from "./index";

afterEach(() => {
  cleanup();
  openPortalRoots.length = 0;
  document.body.innerHTML = "";
});

const inCard = (ui: ReactNode, o: { canEdit?: boolean; startEditing?: boolean } = {}) => (
  <CardModeProvider canEdit={o.canEdit ?? true} startEditing={o.startEditing ?? false}>
    {ui}
  </CardModeProvider>
);
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");
const open = (label = "Web") => fireEvent.click(screen.getByRole("button", { name: `Edit ${label}` }));
const box = (label = "Web") => screen.getByRole("textbox", { name: `Edit ${label}` }) as HTMLInputElement;
const dialog = () => {
  const d = document.createElement("div");
  d.setAttribute("role", "dialog");
  const b = document.createElement("button");
  d.appendChild(b);
  document.body.appendChild(d);
  return b;
};

describe("in the card's presentation", () => {
  it("a row with no value is not drawn: no field-row, no 'Add …'", () => {
    render(inCard(<FieldRow label="Web" value="" onCommitValue={() => {}} />));
    expect(screen.queryByTestId("field-row")).toBeNull();
    expect(screen.queryByText(/Add web/i)).toBeNull();
  });

  it("a value of spaces alone counts as no value", () => {
    render(inCard(<FieldRow label="Web" value="   " onCommitValue={() => {}} />));
    expect(screen.queryByTestId("field-row")).toBeNull();
  });

  it("a row with a value is its label above the value as text, with the label on data-field-label", () => {
    render(inCard(<FieldRow label="Web" value="example.test" onCommitValue={() => {}} />));
    expect(screen.getByTestId("field-row").getAttribute("data-field-label")).toBe("Web");
    expect(screen.getByText("Web").tagName).toBe("P");
    expect(screen.getByRole("button", { name: "Edit Web" }).textContent).toBe("example.test");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a click on the value turns the card's edit mode on and edits that value in place", () => {
    render(inCard(<FieldRow label="Web" value="example.test" onCommitValue={() => {}} />));
    expect(modeOf()).toBe("presentation");
    open();
    expect(modeOf()).toBe("edit");
    expect(box().value).toBe("example.test");
  });

  it("with enterCard false, the card stays in presentation while the row edits", () => {
    render(inCard(<FieldRow label="Web" value="example.test" enterCard={false} onCommitValue={() => {}} />));
    open();
    expect(modeOf()).toBe("presentation");
    expect(box().value).toBe("example.test");
  });

  it("a row being edited stays drawn even when its value is emptied", () => {
    render(inCard(<FieldRow label="Web" value="a" onCommitValue={() => {}} />));
    open();
    fireEvent.change(box(), { target: { value: "" } });
    expect(box().value).toBe("");
  });

  it("on a card that may not be written, the caller's readOnly makes the value a disabled button and a click opens nothing", () => {
    render(inCard(<FieldRow label="Web" value="example.test" readOnly onCommitValue={() => {}} />, { canEdit: false }));
    const b = screen.getByRole("button", { name: "Edit Web" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(modeOf()).toBe("presentation");
  });

  it("the row does not read the card's canEdit: without readOnly, a click still opens the row's editor and the card stays in presentation", () => {
    render(inCard(<FieldRow label="Web" value="example.test" onCommitValue={() => {}} />, { canEdit: false }));
    open();
    expect(box().value).toBe("example.test");
    expect(modeOf()).toBe("presentation");
  });
});

describe("in the card's edit mode, and outside any card", () => {
  it("an empty row is drawn, with its 'Add …' invitation in lower case, marked data-card-add", () => {
    render(inCard(<FieldRow label="Web Address" value="" onCommitValue={() => {}} />, { startEditing: true }));
    const b = screen.getByRole("button", { name: "Edit Web Address" });
    expect(b.textContent).toBe("Add web address");
    expect(b.getAttribute("data-card-add")).toBe("");
  });

  it("a row with a value does not carry data-card-add", () => {
    render(inCard(<FieldRow label="Web" value="x" onCommitValue={() => {}} />, { startEditing: true }));
    expect(screen.getByRole("button", { name: "Edit Web" }).hasAttribute("data-card-add")).toBe(false);
  });

  it("an empty read-only row shows a dash, is disabled, and is not an add point", () => {
    render(<FieldRow label="Web" value="" readOnly onCommitValue={() => {}} />);
    const b = screen.getByRole("button", { name: "Edit Web" }) as HTMLButtonElement;
    expect(b.textContent).toBe("—");
    expect(b.disabled).toBe(true);
    expect(b.hasAttribute("data-card-add")).toBe(false);
  });

  it("outside a card (no mode) an empty row is drawn, as it always was", () => {
    render(<FieldRow label="Web Address" value="" onCommitValue={() => {}} />);
    expect(screen.getByText("Add web address")).toBeTruthy();
  });

  it("hideLabel leaves the sub-label out, and the button keeps its accessible name", () => {
    render(<FieldRow label="Web" value="x" hideLabel onCommitValue={() => {}} />);
    expect(screen.queryByText("Web")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Web" })).toBeTruthy();
  });

  it("read-only: the value is shown and cannot be opened", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="example.test" readOnly onCommitValue={commit} />);
    const b = screen.getByRole("button", { name: "Edit Web" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(commit).not.toHaveBeenCalled();
  });

  it("prominent and multiline change the look of the value, not what it does", () => {
    const { rerender } = render(<FieldRow label="Web" value="x" prominent onCommitValue={() => {}} />);
    expect(screen.getByRole("button", { name: "Edit Web" }).className).toContain("text-[20px]");
    rerender(<FieldRow label="Web" value="x" multiline onCommitValue={() => {}} />);
    expect(screen.getByRole("button", { name: "Edit Web" }).className).toContain("whitespace-pre-line");
    expect(screen.getByRole("button", { name: "Edit Web" }).className).toContain("text-[15px]");
  });
});

describe("editing a text value", () => {
  it("opens focused, with the whole value selected", () => {
    render(<FieldRow label="Web" value="example.test" onCommitValue={() => {}} />);
    open();
    expect(document.activeElement).toBe(box());
    expect(box().selectionStart).toBe(0);
    expect(box().selectionEnd).toBe("example.test".length);
    expect(box().getAttribute("type")).toBe("text");
  });

  it("scrolls the field to the centre where the browser can, and does not fail where it cannot", () => {
    render(<FieldRow label="Web" value="a" onCommitValue={() => {}} />);
    open();
    expect(box()).toBeTruthy();
    cleanup();
    const scroll = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: scroll, configurable: true });
    try {
      render(<FieldRow label="Web" value="a" onCommitValue={() => {}} />);
      open();
      expect(scroll).toHaveBeenCalledWith({ block: "center", behavior: "smooth" });
    } finally {
      delete (HTMLElement.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  it("Enter commits the trimmed edit once, and the editor closes", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="UTC" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: " Europe/Oslo " } });
    expect(fireEvent.keyDown(box(), { key: "Enter" })).toBe(false);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("Europe/Oslo");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Web" })).toBeTruthy();
  });

  it("an unchanged value commits nothing, on Enter or on blur; so does a change that only adds spaces", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="UTC" onCommitValue={commit} />);
    open();
    fireEvent.keyDown(box(), { key: "Enter" });
    open();
    fireEvent.blur(box());
    open();
    fireEvent.change(box(), { target: { value: "  UTC  " } });
    fireEvent.blur(box());
    expect(commit).not.toHaveBeenCalled();
  });

  it("a stored value with spaces round the edge is compared trimmed", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="  UTC " onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "UTC" } });
    fireEvent.blur(box());
    expect(commit).not.toHaveBeenCalled();
  });

  it("clearing a value commits the empty string", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="UTC" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "" } });
    fireEvent.blur(box());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("");
  });

  it("leaving the box (blur to nothing) commits once", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="a" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box());
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("b");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a blur to an ordinary element outside commits too", () => {
    const commit = vi.fn();
    render(
      <div>
        <FieldRow label="Web" value="a" onCommitValue={commit} />
        <button type="button">elsewhere</button>
      </div>,
    );
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box(), { relatedTarget: screen.getByRole("button", { name: "elsewhere" }) });
    expect(commit).toHaveBeenCalledWith("b");
  });

  it("Escape reverts and commits nothing; the next opening shows the stored value again", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="a" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "x" } });
    expect(fireEvent.keyDown(box(), { key: "Escape" })).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
    open();
    expect(box().value).toBe("a");
    fireEvent.blur(box());
    expect(commit).not.toHaveBeenCalled();
  });

  it("other keys are left alone", () => {
    render(<FieldRow label="Web" value="a" onCommitValue={() => {}} />);
    open();
    expect(fireEvent.keyDown(box(), { key: "a" })).toBe(true);
    expect(fireEvent.keyDown(box(), { key: "Tab" })).toBe(true);
    expect(box()).toBeTruthy();
  });

  it("onEditingChange hears true when the editor opens and false when it closes, by Enter, blur or Escape", () => {
    const heard: boolean[] = [];
    render(<FieldRow label="Web" value="a" onEditingChange={(b) => heard.push(b)} onCommitValue={() => {}} />);
    open();
    expect(heard).toEqual([true]);
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(heard).toEqual([true, false]);
    open();
    fireEvent.blur(box());
    open();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(heard).toEqual([true, false, true, false, true, false]);
  });

  it("onEditingChange is the latest one passed, and a row without one reports nothing", () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = render(<FieldRow label="Web" value="a" onEditingChange={first} onCommitValue={() => {}} />);
    rerender(<FieldRow label="Web" value="a" onEditingChange={second} onCommitValue={() => {}} />);
    open();
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(true);
  });

  it("initialEditing opens the editor on mount, focused, and does not report that opening", () => {
    const heard = vi.fn();
    render(<FieldRow label="Web" value="a" initialEditing onEditingChange={heard} onCommitValue={() => {}} />);
    expect(document.activeElement).toBe(box());
    expect(heard).not.toHaveBeenCalled();
  });

  it("opening shows the value as it is now, not as it first was; a value that changes under an open editor does not replace the typed draft", () => {
    const { rerender } = render(<FieldRow label="Web" value="a" onCommitValue={() => {}} />);
    rerender(<FieldRow label="Web" value="b" onCommitValue={() => {}} />);
    open();
    expect(box().value).toBe("b");
    fireEvent.change(box(), { target: { value: "typed" } });
    rerender(<FieldRow label="Web" value="c" onCommitValue={() => {}} />);
    expect(box().value).toBe("typed");
  });
});

describe("a click into an open dialog or popover is not leaving", () => {
  it("a blur into a [role=dialog] commits nothing and leaves the editor open with the draft", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="a" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box(), { relatedTarget: dialog() });
    expect(commit).not.toHaveBeenCalled();
    expect(box().value).toBe("b");
  });

  it("nothing is committed later by itself: only Enter, or a blur that goes elsewhere, commits the draft", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="a" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box(), { relatedTarget: dialog() });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.keyDown(box(), { key: "Enter" });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("b");
    open();
    fireEvent.change(box(), { target: { value: "c" } });
    fireEvent.blur(box(), { relatedTarget: dialog() });
    fireEvent.blur(box());
    expect(commit).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenLastCalledWith("c");
  });

  it("an element inside an [aria-modal=true] layer, or inside the create dialog's portal root, counts as well", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="a" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    modal.appendChild(document.createElement("span"));
    document.body.appendChild(modal);
    fireEvent.blur(box(), { relatedTarget: modal.firstChild });
    const root = document.createElement("div");
    root.setAttribute("data-testid", "connected-create-root");
    root.appendChild(document.createElement("span"));
    document.body.appendChild(root);
    fireEvent.blur(box(), { relatedTarget: root.firstChild });
    expect(commit).not.toHaveBeenCalled();
  });

  it("a blur to nothing while a create dialog is open (openPortalRoots has a root) commits nothing", () => {
    const commit = vi.fn();
    render(<FieldRow label="Web" value="a" onCommitValue={commit} />);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    openPortalRoots.push(document.createElement("div"));
    fireEvent.blur(box());
    expect(commit).not.toHaveBeenCalled();
    expect(box().value).toBe("b");
    openPortalRoots.length = 0;
    fireEvent.blur(box());
    expect(commit).toHaveBeenCalledWith("b");
  });

  it("while a create dialog is open even a blur to an ordinary element commits nothing", () => {
    const commit = vi.fn();
    render(
      <div>
        <FieldRow label="Web" value="a" onCommitValue={commit} />
        <button type="button">elsewhere</button>
      </div>,
    );
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    openPortalRoots.push(document.createElement("div"));
    fireEvent.blur(box(), { relatedTarget: screen.getByRole("button", { name: "elsewhere" }) });
    expect(commit).not.toHaveBeenCalled();
  });

  it("a click inside the dialog does not leave the card's edit mode either", async () => {
    const commit = vi.fn();
    render(inCard(<FieldRow label="Web" value="a" onCommitValue={commit} />));
    open();
    expect(modeOf()).toBe("edit");
    const inside = dialog();
    await userEvent.click(inside);
    expect(modeOf()).toBe("edit");
  });
});

describe("retainFocusWithinSection", () => {
  const section = (commit = vi.fn(), extra: ReactNode = null) =>
    render(
      <div>
        <section data-testid="sec">
          <FieldRow label="Web" value="a" retainFocusWithinSection onCommitValue={commit} />
          <button type="button">inside</button>
          {extra}
        </section>
        <button type="button">outside</button>
      </div>,
    );
  const inside = () => screen.getByRole("button", { name: "inside" });

  it("a blur into the same section saves the changed value and leaves the editor open", () => {
    const commit = vi.fn();
    section(commit);
    open();
    fireEvent.change(box(), { target: { value: " b " } });
    fireEvent.blur(box(), { relatedTarget: inside() });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("b");
    expect(box().value).toBe(" b ");
  });

  it("an unchanged value saves nothing when focus moves within the section", () => {
    const commit = vi.fn();
    section(commit);
    open();
    fireEvent.blur(box(), { relatedTarget: inside() });
    expect(commit).not.toHaveBeenCalled();
    expect(box()).toBeTruthy();
  });

  it("the row compares with the value it was given: leaving afterwards saves the same draft again until the host updates the value", () => {
    const commit = vi.fn();
    section(commit);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box(), { relatedTarget: inside() });
    fireEvent.blur(box(), { relatedTarget: screen.getByRole("button", { name: "outside" }) });
    expect(commit).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a blur out of the section commits and closes as usual", () => {
    const commit = vi.fn();
    section(commit);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box(), { relatedTarget: screen.getByRole("button", { name: "outside" }) });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("without the prop, a blur into the section commits and closes", () => {
    const commit = vi.fn();
    render(
      <section>
        <FieldRow label="Web" value="a" onCommitValue={commit} />
        <button type="button">inside</button>
      </section>,
    );
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    fireEvent.blur(box(), { relatedTarget: screen.getByRole("button", { name: "inside" }) });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Escape pressed anywhere in the section closes the editor without saving", () => {
    const commit = vi.fn();
    section(commit);
    open();
    fireEvent.change(box(), { target: { value: "b" } });
    expect(fireEvent.keyDown(inside(), { key: "Escape" })).toBe(false);
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("Escape elsewhere on the page, in a dialog inside the section, or while a create dialog is open, does not close it", () => {
    const commit = vi.fn();
    section(commit, <div role="dialog" data-testid="dlg"><button type="button">in dialog</button></div>);
    open();
    expect(fireEvent.keyDown(screen.getByRole("button", { name: "outside" }), { key: "Escape" })).toBe(true);
    expect(fireEvent.keyDown(screen.getByRole("button", { name: "in dialog" }), { key: "Escape" })).toBe(true);
    openPortalRoots.push(document.createElement("div"));
    expect(fireEvent.keyDown(inside(), { key: "Escape" })).toBe(true);
    expect(box()).toBeTruthy();
    expect(commit).not.toHaveBeenCalled();
  });

  it("other keys in the section do nothing", () => {
    section();
    open();
    expect(fireEvent.keyDown(inside(), { key: "Enter" })).toBe(true);
    expect(box()).toBeTruthy();
  });

  it("without the prop, Escape in the section outside the box does nothing", () => {
    render(
      <section>
        <FieldRow label="Web" value="a" onCommitValue={() => {}} />
        <button type="button">inside</button>
      </section>,
    );
    open();
    expect(fireEvent.keyDown(screen.getByRole("button", { name: "inside" }), { key: "Escape" })).toBe(true);
    expect(box()).toBeTruthy();
  });

  it("the Escape listener is removed when the editor closes", () => {
    const remove = vi.spyOn(document, "removeEventListener");
    section();
    open();
    fireEvent.keyDown(box(), { key: "Escape" });
    expect(remove.mock.calls.some(([type, , capture]) => type === "keydown" && capture === true)).toBe(true);
    remove.mockRestore();
  });
});

describe("a multi-line value", () => {
  it("is a textarea of 4 rows: Enter inserts a line and commits nothing, blur commits, Escape reverts", () => {
    const commit = vi.fn();
    render(<FieldRow label="Note" value="a" multiline onCommitValue={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Note" }));
    const area = screen.getByRole("textbox", { name: "Edit Note" }) as HTMLTextAreaElement;
    expect(area.tagName).toBe("TEXTAREA");
    expect(area.rows).toBe(4);
    expect(fireEvent.keyDown(area, { key: "Enter" })).toBe(true);
    expect(commit).not.toHaveBeenCalled();
    fireEvent.change(area, { target: { value: "a\nb" } });
    fireEvent.blur(area);
    expect(commit).toHaveBeenCalledWith("a\nb");
    fireEvent.click(screen.getByRole("button", { name: "Edit Note" }));
    const again = screen.getByRole("textbox", { name: "Edit Note" });
    fireEvent.change(again, { target: { value: "zzz" } });
    fireEvent.keyDown(again, { key: "Escape" });
    expect(commit).toHaveBeenCalledTimes(1);
  });

  it("prominent changes the textarea's look", () => {
    render(<FieldRow label="Note" value="a" multiline prominent onCommitValue={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Note" }));
    expect(screen.getByRole("textbox", { name: "Edit Note" }).className).toContain("text-[20px]");
  });
});

describe("a closed value set (options)", () => {
  it("the edit is a choice; a stored value outside the set is kept as the first choice; picking commits at once", () => {
    const commit = vi.fn();
    render(<FieldRow label="Zone" value="Mars/Base" options={["UTC"]} onCommitValue={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Zone" }));
    const sel = screen.getByRole("combobox", { name: "Edit Zone" });
    expect([...sel.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["—", "Mars/Base", "UTC"]);
    fireEvent.change(sel, { target: { value: "UTC" } });
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("UTC");
    expect(screen.queryByRole("combobox")).toBeNull();
  });

  it("a stored value inside the set is not repeated, an empty one adds no extra choice, and the dash clears", () => {
    const commit = vi.fn();
    render(<FieldRow label="Zone" value="UTC" options={["UTC", "CET"]} onCommitValue={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Zone" }));
    const sel = screen.getByRole("combobox", { name: "Edit Zone" });
    expect([...sel.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["—", "UTC", "CET"]);
    fireEvent.change(sel, { target: { value: "" } });
    expect(commit).toHaveBeenCalledWith("");
    cleanup();
    render(<FieldRow label="Zone" value="" options={["UTC"]} onCommitValue={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Zone" }));
    expect([...screen.getByRole("combobox").querySelectorAll("option")].map((o) => o.textContent)).toEqual(["—", "UTC"]);
  });

  it("Escape on a choice reverts; options win over multiline", () => {
    const commit = vi.fn();
    render(<FieldRow label="Zone" value="UTC" options={["UTC", "CET"]} multiline onCommitValue={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Zone" }));
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "Escape" });
    expect(commit).not.toHaveBeenCalled();
    expect(screen.queryByRole("combobox")).toBeNull();
  });
});

// Ported from the card test files of the source (same inputs and expectations; the card bar is the peer's).
describe("a plain field in presentation (ported)", () => {
  const card = (ui: ReactNode, canEdit = true) => (
    <CardModeProvider canEdit={canEdit}>
      <CardModeBar />
      {ui}
    </CardModeProvider>
  );

  it("with no value is NOT drawn: no 'Add …', no placeholder", () => {
    render(card(<FieldRow label="Web Address" value="" onCommitValue={() => {}} />));
    expect(screen.queryByTestId("field-row")).toBeNull();
    expect(screen.queryByText(/Add web address/i)).toBeNull();
  });

  it("with a value reads as its label and the value as text", () => {
    render(card(<FieldRow label="Web Address" value="example.test" onCommitValue={() => {}} />));
    expect(screen.getByText("Web Address")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit Web Address" }).textContent).toBe("example.test");
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a click on the value turns the card's edit mode on and edits THAT value in place; leaving saves once; Done returns to presentation", async () => {
    const commit = vi.fn();
    render(card(<FieldRow label="Web Address" value="example.test" onCommitValue={commit} />));
    await userEvent.click(screen.getByRole("button", { name: "Edit Web Address" }));
    expect(modeOf()).toBe("edit");
    const b = screen.getByRole("textbox", { name: "Edit Web Address" }) as HTMLInputElement;
    expect(document.activeElement).toBe(b);
    fireEvent.change(b, { target: { value: "www.example.test" } });
    await userEvent.click(screen.getByTestId("card-done"));
    expect(commit).toHaveBeenCalledTimes(1);
    expect(commit).toHaveBeenCalledWith("www.example.test");
    expect(modeOf()).toBe("presentation");
  });

  it("on a card that may not be written the value is plain, with nothing to click", () => {
    render(card(<FieldRow label="Web Address" value="example.test" readOnly onCommitValue={() => {}} />, false));
    const b = screen.getByRole("button", { name: "Edit Web Address" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
  });

  it("in edit mode an empty row IS drawn, with its 'Add …' invitation (the way to give the field its first value)", async () => {
    render(card(<FieldRow label="Web Address" value="" onCommitValue={() => {}} />));
    expect(screen.queryByTestId("field-row")).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.getByText("Add web address")).toBeTruthy();
  });

  it("outside a card (no mode) an empty row is drawn, as it always was", () => {
    render(<FieldRow label="Web Address" value="" onCommitValue={() => {}} />);
    expect(screen.getByText("Add web address")).toBeTruthy();
  });
});

describe("FieldRow, the plain-text branch (ported)", () => {
  it("shows the sub-label and the value; Enter commits the trimmed edit", () => {
    const commit = vi.fn();
    render(<FieldRow label="Time zone" value="UTC" onCommitValue={commit} />);
    expect(screen.getByText("Time zone")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit Time zone" }));
    const b = screen.getByRole("textbox", { name: "Edit Time zone" }) as HTMLInputElement;
    expect(b.value).toBe("UTC");
    fireEvent.change(b, { target: { value: " Europe/Oslo " } });
    fireEvent.keyDown(b, { key: "Enter" });
    expect(commit).toHaveBeenCalledWith("Europe/Oslo");
  });

  it("Escape reverts and commits nothing; an unchanged blur commits nothing", () => {
    const commit = vi.fn();
    render(<FieldRow label="Level" value="" onCommitValue={commit} />);
    expect(screen.getByRole("button", { name: "Edit Level" }).textContent).toBe("Add level");
    fireEvent.click(screen.getByRole("button", { name: "Edit Level" }));
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "x" } });
    fireEvent.keyDown(screen.getByRole("textbox"), { key: "Escape" });
    expect(commit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Edit Level" }));
    fireEvent.blur(screen.getByRole("textbox"));
    expect(commit).not.toHaveBeenCalled();
  });

  it("read-only: the value is shown and cannot be opened", () => {
    render(<FieldRow label="Web" value="example.test" readOnly onCommitValue={() => {}} />);
    const b = screen.getByRole("button", { name: "Edit Web" }) as HTMLButtonElement;
    expect(b.disabled).toBe(true);
    fireEvent.click(b);
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("a value set: the edit is a choice; a stored value outside the set is kept as a choice", () => {
    const commit = vi.fn();
    render(<FieldRow label="Zone" value="Mars/Base" options={["UTC"]} onCommitValue={commit} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit Zone" }));
    const sel = screen.getByRole("combobox", { name: "Edit Zone" });
    expect([...sel.querySelectorAll("option")].map((o) => o.textContent)).toEqual(["—", "Mars/Base", "UTC"]);
    fireEvent.change(sel, { target: { value: "UTC" } });
    expect(commit).toHaveBeenCalledWith("UTC");
  });
});
