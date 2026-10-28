// The shared pieces of the Value lines, one by one: what each commits, when, and how often.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import {
  CommitText,
  InlineInput,
  InlineSelect,
  LegacyMoveButton,
  Piece,
  Src,
  TextPiece,
  UnsetQualifiers,
  ViewSrc,
  eq,
  hint,
  inPlace,
  legacyMoveLabel,
  own,
  type ValueLineProps,
} from "./index";
import { ANN, VAULT, card, labels, record, render } from "../test/mount";

afterEach(cleanup);

describe("InlineInput: Enter or leaving saves a changed value once; Escape saves nothing", () => {
  function open(extra: Partial<Parameters<typeof InlineInput>[0]> = {}) {
    const onCommit = vi.fn();
    const close = vi.fn();
    render(<InlineInput label="Scale unit" value="min" onCommit={onCommit} close={close} {...extra} />);
    return { onCommit, close, input: screen.getByLabelText("Edit Scale unit") as HTMLInputElement };
  }
  it("Enter commits the typed text once and closes; the blur that follows commits nothing more", async () => {
    const { onCommit, close, input } = open();
    expect(document.activeElement).toBe(input);
    await userEvent.clear(input);
    await userEvent.type(input, "seconds{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("seconds");
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("leaving the input commits once", async () => {
    const { onCommit, close, input } = open();
    await userEvent.type(input, "utes");
    fireEvent.blur(input);
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("minutes");
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("Escape saves nothing, closes, and the blur after it saves nothing either", async () => {
    const { onCommit, close, input } = open();
    await userEvent.type(input, "utes");
    await userEvent.keyboard("{Escape}");
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("Escape stops at the input: a layer around it does not see the key", async () => {
    const outer = vi.fn();
    const onCommit = vi.fn();
    render(
      <div onKeyDown={outer}>
        <InlineInput label="x" value="" onCommit={onCommit} close={() => {}} />
      </div>,
    );
    await userEvent.keyboard("{Escape}");
    expect(outer).not.toHaveBeenCalled();
  });
  it("an unchanged value closes with nothing sent, on Enter and on leaving", async () => {
    const a = open();
    await userEvent.keyboard("{Enter}");
    expect(a.onCommit).not.toHaveBeenCalled();
    expect(a.close).toHaveBeenCalledTimes(1);
    cleanup();
    const b = open();
    fireEvent.blur(b.input);
    expect(b.onCommit).not.toHaveBeenCalled();
    expect(b.close).toHaveBeenCalledTimes(1);
  });
  it("a check that finds a problem keeps it open, says why, and sends nothing; a fixed text goes through", async () => {
    const check = (v: string) => (v.includes(" ") ? "No spaces." : null);
    const { onCommit, close, input } = open({ check });
    await userEvent.type(input, " x");
    await userEvent.keyboard("{Enter}");
    expect((screen.getByRole("alert")).textContent).toContain("No spaces.");
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).not.toHaveBeenCalled();
    await userEvent.type(input, "y");
    expect(screen.queryByRole("alert")).toBeNull();
    await userEvent.clear(input);
    await userEvent.type(input, "ok{Enter}");
    expect(onCommit).toHaveBeenCalledWith("ok");
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("the check is not asked when the text is unchanged", async () => {
    const check = vi.fn(() => "never");
    const { onCommit, close } = open({ check });
    await userEvent.keyboard("{Enter}");
    expect(check).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("a text box: Shift+Enter is a line break, Enter commits", async () => {
    const onCommit = vi.fn();
    const close = vi.fn();
    render(<InlineInput label="Scale rate" value="" multiline onCommit={onCommit} close={close} />);
    const box = screen.getByLabelText("Edit Scale rate");
    expect(box.tagName).toBe("TEXTAREA");
    await userEvent.type(box, "per Task{Shift>}{Enter}{/Shift}more");
    expect(onCommit).not.toHaveBeenCalled();
    await userEvent.keyboard("{Enter}");
    expect(onCommit).toHaveBeenCalledWith("per Task\nmore");
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("selectAll selects the whole text on focus; type, list and placeholder go to the input", () => {
    const { input } = open({ selectAll: true, type: "date", list: "kinds", placeholder: "pick" });
    expect(input.type).toBe("date");
    expect(input.getAttribute("list")).toBe("kinds");
    expect(input.placeholder).toBe("pick");
  });
});

describe("InlineSelect: a pick saves when it differs and closes; Escape or leaving closes with nothing sent", () => {
  const options = [
    { value: "lower", label: "Lower is better" },
    { value: "higher", label: "Higher is better" },
  ];
  function open() {
    const onCommit = vi.fn();
    const close = vi.fn();
    render(<InlineSelect label="Scale direction" value="lower" options={options} onCommit={onCommit} close={close} />);
    return { onCommit, close, select: screen.getByLabelText("Edit Scale direction") as HTMLSelectElement };
  }
  it("a different pick commits its value once and closes", () => {
    const { onCommit, close, select } = open();
    expect(document.activeElement).toBe(select);
    fireEvent.change(select, { target: { value: "higher" } });
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("higher");
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("the same value closes and sends nothing", () => {
    const { onCommit, close, select } = open();
    fireEvent.change(select, { target: { value: "lower" } });
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
  });
  it("Escape closes without sending, and the key does not reach a layer around it", async () => {
    const outer = vi.fn();
    const onCommit = vi.fn();
    const close = vi.fn();
    render(
      <div onKeyDown={outer}>
        <InlineSelect label="x" value="lower" options={options} onCommit={onCommit} close={close} />
      </div>,
    );
    await userEvent.keyboard("{Escape}");
    expect(close).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
    expect(outer).not.toHaveBeenCalled();
  });
  it("leaving closes with nothing sent", () => {
    const { onCommit, close, select } = open();
    fireEvent.blur(select);
    expect(close).toHaveBeenCalledTimes(1);
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("opens the browser's picker when it can, and goes on without it when the browser refuses", () => {
    const showPicker = vi.fn(() => {
      throw new Error("needs a click first");
    });
    (HTMLSelectElement.prototype as unknown as { showPicker: () => void }).showPicker = showPicker;
    try {
      open();
      expect(showPicker).toHaveBeenCalledTimes(1);
      expect(document.activeElement).toBe(screen.getByLabelText("Edit Scale direction"));
    } finally {
      delete (HTMLSelectElement.prototype as unknown as { showPicker?: () => void }).showPicker;
    }
  });
});

describe("CommitText: keeps what is typed and saves on leaving or Enter", () => {
  it("an input: Enter saves a changed text once; the blur after Enter saves it again only if it is still different", async () => {
    const onCommit = vi.fn();
    render(<CommitText label="Scale unit" value="min" onCommit={onCommit} />);
    const input = screen.getByLabelText("Scale unit");
    await userEvent.type(input, "utes{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("minutes");
    // The box still holds "minutes" and the parent has not changed `value`: leaving saves it again (the box saves each time it differs).
    fireEvent.blur(input);
    expect(onCommit).toHaveBeenCalledTimes(2);
  });
  it("an unchanged text saves nothing", async () => {
    const onCommit = vi.fn();
    render(<CommitText label="Scale unit" value="min" onCommit={onCommit} />);
    const input = screen.getByLabelText("Scale unit");
    await userEvent.type(input, "{Enter}");
    fireEvent.blur(input);
    expect(onCommit).not.toHaveBeenCalled();
  });
  it("a new value from the parent replaces the typed text", () => {
    const onCommit = vi.fn();
    const { rerender } = render(<CommitText label="Scale unit" value="min" onCommit={onCommit} />);
    fireEvent.change(screen.getByLabelText("Scale unit"), { target: { value: "typed" } });
    rerender(<CommitText label="Scale unit" value="hours" onCommit={onCommit} />);
    expect((screen.getByLabelText("Scale unit") as HTMLInputElement).value).toBe("hours");
  });
  it("a text box: Enter saves, Shift+Enter is a line break, and the box grows to its content", async () => {
    const onCommit = vi.fn();
    Object.defineProperty(HTMLElement.prototype, "scrollHeight", { configurable: true, get: () => 120 });
    try {
      render(<CommitText multiline label="Scale rate" value="" onCommit={onCommit} />);
      const box = screen.getByLabelText("Scale rate") as HTMLTextAreaElement;
      expect(box.tagName).toBe("TEXTAREA");
      expect(box.style.height).toBe("120px");
      await userEvent.type(box, "a{Shift>}{Enter}{/Shift}b");
      expect(onCommit).not.toHaveBeenCalled();
      await userEvent.keyboard("{Enter}");
      expect(onCommit).toHaveBeenCalledWith("a\nb");
    } finally {
      delete (HTMLElement.prototype as unknown as { scrollHeight?: number }).scrollHeight;
    }
  });
  it("type, list and placeholder go to the input", () => {
    render(<CommitText label="d" value="" type="date" list="l" placeholder="p" onCommit={() => {}} />);
    const input = screen.getByLabelText("d") as HTMLInputElement;
    expect([input.type, input.getAttribute("list"), input.placeholder]).toEqual(["date", "l", "p"]);
  });
});

describe("Piece and TextPiece: a value in a read line that turns into its editor in place", () => {
  it("off, a piece is only its face", () => {
    render(<Piece on={false} label="Scale unit" face={<b>min</b>} edit={() => <i>editor</i>} />);
    expect(screen.getByText("min")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("on, a click turns the face into the editor and the editor's close turns it back", async () => {
    render(<Piece on label="Scale unit" face="min" edit={(close) => <button onClick={close}>done</button>} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    expect(screen.queryByRole("button", { name: "Edit Scale unit" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "done" }));
    expect((screen.getByRole("button", { name: "Edit Scale unit" })).textContent).toContain("min");
  });
  it("a text piece edits its value: click, type, Enter sends the text once and shows the face again", async () => {
    const onCommit = vi.fn();
    render(<TextPiece on label="Scale unit" value="min" onCommit={onCommit} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    const input = screen.getByLabelText("Edit Scale unit");
    await userEvent.clear(input);
    await userEvent.type(input, "hours{Enter}");
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("hours");
    expect(screen.getByRole("button", { name: "Edit Scale unit" })).toBeTruthy();
  });
  it("an empty value shows the hint, a face given by the caller wins over the value, and off shows no button", () => {
    render(
      <>
        <TextPiece on={false} label="a" value="  " empty="Add unit" onCommit={() => {}} />
        <TextPiece on={false} label="b" value="min" face={<>Unit: min</>} onCommit={() => {}} />
        <TextPiece on={false} label="c" value="" onCommit={() => {}} />
      </>,
    );
    expect(screen.getByText("Add unit")).toBeTruthy();
    expect(screen.getByText("Unit: min")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("on with an empty value the hint is the clickable face", async () => {
    render(<TextPiece on label="Scale unit" value="" empty="Add unit" onCommit={() => {}} />);
    expect((screen.getByRole("button", { name: "Edit Scale unit" })).textContent).toContain("Add unit");
  });
  it("hint draws its text with the faint ink", () => {
    render(<>{hint("none")}</>);
    expect(screen.getByText("none").className).toContain("text-[var(--ink-faint,var(--ink-soft))]");
  });
});

describe("the small rules", () => {
  it("eq compares trimmed and case-folded", () => {
    expect(eq(" Country ", "country")).toBe(true);
    expect(eq("Country", "Countr y")).toBe(false);
  });
  it("inPlace: a person who may edit, on a card that is not in Edit", () => {
    expect(inPlace({ editing: false, canEdit: true })).toBe(true);
    expect(inPlace({ editing: true, canEdit: true })).toBe(false);
    expect(inPlace({ editing: false })).toBe(false);
    expect(inPlace({ editing: false, canEdit: false })).toBe(false);
  });
  it("own gives the signed-in person as the source of a value with none, and leaves a given source (same object) alone", () => {
    const given = { text: "a survey" };
    expect(own(given, "https://h.example.test/base/e/me")).toBe(given);
    expect(own({}, "https://h.example.test/base/e/me")).toEqual({ statedBy: "https://h.example.test/base/e/me" });
    const empty = {};
    expect(own(empty, null)).toBe(empty);
  });
});

describe("the source control slot", () => {
  const props = (over: Partial<ValueLineProps> = {}): ValueLineProps => ({
    data: card(),
    editing: false,
    canEdit: false,
    vaultId: VAULT,
    record,
    onOpen: () => {},
    selfId: null,
    onChange: () => {},
    ...over,
  });
  it("Src reading draws the source's words, and a source with no words draws nothing", () => {
    const { container, rerender } = render(<Src p={props()} value={{ text: "a survey" }} label="Scale source" onCommit={() => {}} />);
    expect(container.querySelector('[data-plan-source="Scale source"]')?.textContent).toContain("Source: a survey");
    rerender(<Src p={props()} value={{}} label="Scale source" onCommit={() => {}} />);
    expect(container.querySelector("[data-plan-source]")).toBeNull();
  });
  it("Src in Edit opens the picker, named by the label; a record source is shown by its live label", () => {
    const { container } = render(<Src p={props({ editing: true })} value={{ statedBy: ANN }} label="Scale source" onCommit={() => {}} />);
    expect(container.querySelector('[data-plan-source="Scale source"]')?.getAttribute("data-editing")).toBe("true");
    expect(screen.getByLabelText("Scale source")).toBeTruthy();
    expect(screen.getByText(labels[ANN]!)).toBeTruthy();
  });
  it("ViewSrc out of in-place mode is Src as it stands: no button around it", () => {
    render(<ViewSrc p={props()} value={{ text: "a survey" }} label="Scale source" onCommit={() => {}} />);
    expect(screen.getByText(/a survey/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Scale source" })).toBeNull();
  });
  it("ViewSrc in place, with a source: a click opens the picker; Escape closes it; a pick closes it after sending", async () => {
    const onCommit = vi.fn();
    const { container } = render(<ViewSrc p={props({ canEdit: true })} value={{ text: "a survey" }} label="Scale source" onCommit={onCommit} />);
    const slot = () => container.querySelector('[data-plan-source="Scale source"]');
    expect(slot()?.getAttribute("data-editing")).toBe("false");
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale source" }));
    expect(slot()?.getAttribute("data-editing")).toBe("true");
    await userEvent.keyboard("{Escape}");
    expect(slot()?.getAttribute("data-editing")).toBe("false");
    // Enter on the focused slot opens it too.
    screen.getByRole("button", { name: "Edit Scale source" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(slot()?.getAttribute("data-editing")).toBe("true");
    // Words typed with no match are offered as text; taking them sends the source and closes the editor.
    await userEvent.type(screen.getByLabelText("Scale source"), "interviews");
    await userEvent.click(await screen.findByRole("button", { name: 'Use "interviews" as text' }));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith({ text: "interviews" });
    expect(slot()?.getAttribute("data-editing")).toBe("false");
  });
  it("ViewSrc in place: a press outside closes the editor, a press inside a dialog does not", async () => {
    const { container } = render(
      <>
        <ViewSrc p={props({ canEdit: true })} value={{ text: "a survey" }} label="Scale source" onCommit={() => {}} />
        <div role="dialog" data-testid="dlg">
          <span>inside</span>
        </div>
        <p>outside</p>
      </>,
    );
    const slot = () => container.querySelector('[data-plan-source="Scale source"]');
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale source" }));
    fireEvent.mouseDown(screen.getByText("inside"));
    expect(slot()?.getAttribute("data-editing")).toBe("true");
    fireEvent.mouseDown(screen.getByText("outside"));
    expect(slot()?.getAttribute("data-editing")).toBe("false");
  });
  it("ViewSrc in place, with no source: nothing is drawn and there is nothing to click (the line must offer its own way in)", () => {
    const { container } = render(<ViewSrc p={props({ canEdit: true })} value={{}} label="Scale source" onCommit={() => {}} />);
    expect(container.querySelector("[data-plan-source]")).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("ViewSrc in place: a click on a link or button inside the source does not open the editor", async () => {
    const onOpen = vi.fn();
    const { container } = render(<ViewSrc p={props({ canEdit: true, onOpen })} value={{ statedBy: ANN }} label="Scale source" onCommit={() => {}} />);
    await userEvent.click(screen.getByRole("button", { name: labels[ANN]! }));
    expect(onOpen).toHaveBeenCalledWith("ann");
    expect(container.querySelector('[data-plan-source="Scale source"]')?.getAttribute("data-editing")).toBe("false");
  });
});

describe("UnsetQualifiers: the faint chip that offers the qualifiers a level or meter has not set", () => {
  const chooser = (name: string, close: () => void): ReactNode => (
    <button data-testid="chooser" onClick={close}>
      choose {name}
    </button>
  );
  it("a Level: the chip opens a menu of the names; a name opens the chooser; its close brings the chip back", async () => {
    render(<UnsetQualifiers n={2} hasBracket names={["Country", "Task"]} chooser={chooser} />);
    const chipBtn = screen.getByRole("button", { name: "Add Level 2 qualifier" });
    expect(chipBtn.getAttribute("title")).toBe("Set Country, Task");
    await userEvent.click(chipBtn);
    expect(screen.getByRole("menu", { name: "Level 2 unset qualifiers" })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: "Set Level 2 Task" }));
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByTestId("chooser").textContent).toContain("choose Task");
    await userEvent.click(screen.getByTestId("chooser"));
    expect(screen.queryByTestId("chooser")).toBeNull();
    expect(screen.getByRole("button", { name: "Add Level 2 qualifier" })).toBeTruthy();
  });
  it("a Meter (caption given) words its labels for the Meter", async () => {
    render(<UnsetQualifiers n={1} caption="meter" hasBracket names={["Country"]} chooser={chooser} />);
    await userEvent.click(screen.getByRole("button", { name: "Add Meter 1 qualifier value" }));
    expect(screen.getByRole("menu", { name: "Meter 1 qualifiers" })).toBeTruthy();
    expect(screen.getByRole("menuitem", { name: "Set Meter 1 Country" })).toBeTruthy();
  });
  it("Escape closes the menu, picks nothing, and the key stays inside the menu", async () => {
    const outer = vi.fn();
    render(
      <div onKeyDown={outer}>
        <UnsetQualifiers n={1} hasBracket names={["Country"]} chooser={chooser} />
      </div>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Add Level 1 qualifier" }));
    screen.getByRole("menuitem", { name: "Set Level 1 Country" }).focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.queryByTestId("chooser")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });
  it("with a condition handler, the chip also offers a condition: the names are folded until 'Add a qualifier' is pressed", async () => {
    const onCondition = vi.fn();
    render(<UnsetQualifiers n={3} hasBracket names={["Country"]} chooser={chooser} onCondition={onCondition} />);
    const chipBtn = screen.getByRole("button", { name: "Add Level 3 qualifier" });
    expect(chipBtn.getAttribute("title")).toBe("Add a qualifier or a condition");
    await userEvent.click(chipBtn);
    expect(screen.queryByRole("menuitem", { name: "Set Level 3 Country" })).toBeNull();
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    expect(screen.getByRole("menuitem", { name: "Set Level 3 Country" })).toBeTruthy();
    await userEvent.click(screen.getByRole("menuitem", { name: /Add a qualifier/ }));
    expect(screen.queryByRole("menuitem", { name: "Set Level 3 Country" })).toBeNull();
  });
  it("'Add a condition' opens an input; Enter sends the text once and closes the menu; Escape sends nothing", async () => {
    const onCondition = vi.fn();
    render(<UnsetQualifiers n={3} hasBracket names={["Country"]} chooser={chooser} onCondition={onCondition} />);
    await userEvent.click(screen.getByRole("button", { name: "Add Level 3 qualifier" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add a condition" }));
    await userEvent.type(screen.getByLabelText("Edit Add Level 3 condition"), "in Oslo{Enter}");
    expect(onCondition).toHaveBeenCalledTimes(1);
    expect(onCondition).toHaveBeenCalledWith("in Oslo");
    expect(screen.queryByRole("menu")).toBeNull();
    expect(screen.getByRole("button", { name: "Add Level 3 qualifier" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Add Level 3 qualifier" }));
    await userEvent.click(screen.getByRole("menuitem", { name: "Add a condition" }));
    await userEvent.type(screen.getByLabelText("Edit Add Level 3 condition"), "x{Escape}");
    expect(onCondition).toHaveBeenCalledTimes(1);
  });
  it("the chip's face is drawn by CSS, so the line's text stays the pure line: its classes depend on the bracket and the caller", () => {
    const { rerender } = render(<UnsetQualifiers n={1} hasBracket names={["a"]} chooser={chooser} />);
    expect(screen.getByRole("button").className).toContain("before:content-['+_qualifier']");
    rerender(<UnsetQualifiers n={1} hasBracket={false} names={["a"]} chooser={chooser} />);
    expect(screen.getByRole("button").className).toContain("before:content-['_[+_qualifier']");
    rerender(<UnsetQualifiers n={1} hasBracket caption="meter" names={["a"]} chooser={chooser} />);
    expect(screen.getByRole("button").className).toContain("before:content-['+_value']");
    rerender(<UnsetQualifiers n={1} hasBracket names={["a"]} chooser={chooser} onCondition={() => {}} />);
    expect(screen.getByRole("button").className).toContain("before:content-['+']");
    rerender(<UnsetQualifiers n={1} hasBracket={false} names={["a"]} chooser={chooser} onCondition={() => {}} />);
    expect(screen.getByRole("button").className).toContain("before:content-['_[+]']");
  });
});

describe("the move button for older stored lists", () => {
  const props = (legacy: ValueLineProps["legacy"]): ValueLineProps => ({
    data: card(),
    editing: false,
    vaultId: VAULT,
    record,
    onOpen: () => {},
    selfId: null,
    onChange: () => {},
    legacy,
  });
  const old = (o: Partial<NonNullable<ValueLineProps["legacy"]>> = {}) => ({ levels: 0, qualifiers: 0, meters: 0, busy: false, canMove: true, onMove: vi.fn(), ...o });
  it("the label counts what will move, singular and plural, with 'and' before the last", () => {
    expect(legacyMoveLabel({ levels: 1, qualifiers: 0, meters: 0 })).toBe("Move 1 level into their own records");
    expect(legacyMoveLabel({ levels: 2, qualifiers: 1, meters: 3 })).toBe("Move 2 levels, 1 qualifier and 3 meters into their own records");
    expect(legacyMoveLabel({ levels: 0, qualifiers: 2, meters: 1 })).toBe("Move 2 qualifiers and 1 meter into their own records");
    expect(legacyMoveLabel({ levels: 0, qualifiers: 0, meters: 0 })).toBe("Move  into their own records");
  });
  it("shows nothing without old lists, or when the person cannot move them", () => {
    const a = render(<LegacyMoveButton p={props(undefined)} group="levels" />);
    expect((a.container).innerHTML).toBe("");
    cleanup();
    const b = render(<LegacyMoveButton p={props(old({ levels: 2, canMove: false }))} group="levels" />);
    expect((b.container).innerHTML).toBe("");
  });
  it("sits in the first group that still shows an old list: Levels, else Qualifiers, else Meters", () => {
    const all = old({ levels: 1, qualifiers: 1, meters: 1 });
    const seen = (group: "levels" | "qualifiers" | "meters", l: ReturnType<typeof old>) => {
      const r = render(<LegacyMoveButton p={props(l)} group={group} />);
      const shown = r.container.querySelector('[data-testid="plan-levels-move"]') !== null;
      cleanup();
      return shown;
    };
    expect(["levels", "qualifiers", "meters"].map((g) => seen(g as "levels", all))).toEqual([true, false, false]);
    const noLevels = old({ qualifiers: 1, meters: 1 });
    expect(["levels", "qualifiers", "meters"].map((g) => seen(g as "levels", noLevels))).toEqual([false, true, false]);
    const metersOnly = old({ meters: 1 });
    expect(["levels", "qualifiers", "meters"].map((g) => seen(g as "levels", metersOnly))).toEqual([false, false, true]);
  });
  it("a click calls onMove once; busy disables it", async () => {
    const l = old({ levels: 1 });
    render(<LegacyMoveButton p={props(l)} group="levels" />);
    await userEvent.click(screen.getByRole("button", { name: "Move 1 level into their own records" }));
    expect(l.onMove).toHaveBeenCalledTimes(1);
    cleanup();
    const busy = old({ levels: 1, busy: true });
    render(<LegacyMoveButton p={props(busy)} group="levels" />);
    expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  });
});
