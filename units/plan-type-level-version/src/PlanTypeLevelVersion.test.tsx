import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState, type ReactNode } from "react";
import { TypePictureSourceContext } from "@kaigilb/gilbplatformcode-type-picture";
import type { TypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";
import { PlanTypeLevelVersion } from "./index";
import type { PlanTypeLevelVersionProps, PlanTypeSwitch } from "./index";

afterEach(cleanup);

const LEVELS = [
  { token: "now", label: "Now" },
  { token: "plan", label: "Plan" },
];
const base = (over: Partial<PlanTypeLevelVersionProps> = {}): PlanTypeLevelVersionProps => ({
  recordId: "fn1",
  typeLabel: "Function",
  editing: false,
  canEdit: true,
  levelOpen: false,
  setLevelOpen: () => undefined,
  levelText: "Plan",
  levelDefaultText: "Not set",
  levelSelected: "plan",
  levelOptions: LEVELS,
  optionLabel: ((n: { label: string }) => `Level ${n.label}`) as (node: never) => string,
  addLevelValue: "__add__",
  addingLevel: false,
  onAddLevel: () => undefined,
  onChooseLevel: () => undefined,
  version: new Date(2026, 9, 28, 14, 5),
  ...over,
});
const show = (over: Partial<PlanTypeLevelVersionProps> = {}, ui?: (el: ReactNode) => ReactNode) => {
  const el = <PlanTypeLevelVersion {...base(over)} />;
  return render(<>{ui ? ui(el) : el}</>);
};
const sw = (over: Partial<PlanTypeSwitch> = {}): PlanTypeSwitch => ({ plainWord: "Function", constraintWord: "Function Constraint", constraint: false, onPick: () => undefined, ...over });

describe("the line", () => {
  it("is one group with the card-group test id, group and kind exactly, and the line's classes", () => {
    show();
    const line = screen.getByTestId("card-group");
    expect(line.getAttribute("data-group")).toBe("plan-type-level");
    expect(line.getAttribute("data-kind")).toBe("plan-type-level");
    expect(line.className).toBe("flex min-h-7 flex-col gap-1 text-[14px] leading-7");
  });

  it("reads Type, Level, Version in that order, with two hidden dots between", () => {
    show();
    const row = screen.getByTestId("card-group").firstElementChild!;
    expect(row.textContent).toBe("Type:Function·Level:Plan·Version:2026-10-28");
    const dots = [...row.querySelectorAll("span[aria-hidden]")];
    expect(dots.map((d) => d.textContent)).toEqual(["·", "·"]);
    expect(dots.every((d) => d.getAttribute("aria-hidden") === "true")).toBe(true);
    expect([...row.querySelectorAll(":scope > span.text-\\[12px\\]")].map((s) => s.textContent)).toEqual(["Type:", "Level:", "Version:"]);
  });

  it("the three parts are labelled Type, Level and Version", () => {
    show();
    expect(screen.getByLabelText("Type").textContent).toBe("Function");
    expect(screen.getByLabelText("Level").textContent).toBe("Plan");
    expect(screen.getByLabelText("Version").textContent).toBe("2026-10-28");
  });

  it("draws the below and ask slots under the line, in that order, and nothing when they are absent", () => {
    const a = show({ below: <p data-testid="below">warning</p>, ask: <p data-testid="ask">question</p> });
    const line = screen.getByTestId("card-group");
    expect([...line.children].map((c) => c.getAttribute("data-testid"))).toEqual([null, "below", "ask"]);
    a.unmount();
    show();
    expect(screen.getByTestId("card-group").children).toHaveLength(1);
  });
});

describe("Type", () => {
  it("with no switch the word is plain text, not a button, and cannot be opened", () => {
    show();
    const word = screen.getByLabelText("Type");
    expect(word.tagName).toBe("SPAN");
    fireEvent.click(word);
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.queryByRole("button", { name: "Type" })).toBeNull();
  });

  it("with a switch, the word is a button; a click opens the two radios in place when the card can be edited", () => {
    show({ typeSwitch: sw() });
    const button = screen.getByRole("button", { name: "Type" });
    expect(button.textContent).toBe("Function");
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(button);
    const group = screen.getByRole("radiogroup", { name: "Type" });
    expect(screen.queryByRole("button", { name: "Type" })).toBeNull();
    const radios = within(group).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.name)).toEqual(["plan-type-fn1", "plan-type-fn1"]);
    expect(radios.map((r) => r.checked)).toEqual([true, false]);
    expect(group.textContent).toBe("FunctionFunction Constraint");
  });

  it("a click on the word does nothing when the card cannot be edited", () => {
    show({ typeSwitch: sw(), canEdit: false });
    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
  });

  it("in Edit the radios are there at once, with no button; the radio name follows the record id", () => {
    show({ typeSwitch: sw({ constraint: true }), editing: true, recordId: "sol-9" });
    const radios = within(screen.getByRole("radiogroup")).getAllByRole("radio") as HTMLInputElement[];
    expect(radios.map((r) => r.name)).toEqual(["plan-type-sol-9", "plan-type-sol-9"]);
    expect(radios.map((r) => r.checked)).toEqual([false, true]);
    expect(screen.queryByRole("button", { name: "Type" })).toBeNull();
  });

  it("picking the other side calls onPick(true) or onPick(false); the already chosen one does not call", () => {
    const onPick = vi.fn();
    const a = show({ typeSwitch: sw({ onPick }), editing: true });
    fireEvent.click(screen.getByRole("radio", { name: "Function" }));
    expect(onPick).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(onPick.mock.calls).toEqual([[true]]);
    a.unmount();
    onPick.mockClear();
    show({ typeSwitch: sw({ onPick, constraint: true }), editing: true });
    fireEvent.click(screen.getByRole("radio", { name: "Function" }));
    expect(onPick.mock.calls).toEqual([[false]]);
  });

  it("outside Edit, a pick closes the radios again and the word comes back", () => {
    function Card() {
      const [constraint, setConstraint] = useState(false);
      return <PlanTypeLevelVersion {...base({ typeSwitch: sw({ constraint, onPick: setConstraint }), typeLabel: constraint ? "Function Constraint" : "Function" })} />;
    }
    render(<Card />);
    fireEvent.click(screen.getByRole("button", { name: "Type" }));
    fireEvent.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(screen.queryByRole("radiogroup")).toBeNull();
    expect(screen.getByRole("button", { name: "Type" }).textContent).toBe("Function Constraint");
  });

  it("in Edit, a pick leaves the radios in place", () => {
    show({ typeSwitch: sw(), editing: true });
    fireEvent.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(screen.getByRole("radiogroup")).toBeTruthy();
  });

  it("the type's picture shows at 20 px between 'Type:' and the word when there is a type name and a picture", async () => {
    const source = { fetchTypePictureSrc: vi.fn(async (name: string) => (name === "FunctionConstraint" ? "https://files.example.test/files/fc" : null)) } as unknown as TypePictureSource;
    render(
      <TypePictureSourceContext.Provider value={source}>
        <PlanTypeLevelVersion {...base({ typeLabel: "Function Constraint", typeName: "FunctionConstraint" })} />
      </TypePictureSourceContext.Provider>,
    );
    const img = await waitFor(() => {
      const found = screen.getByTestId("card-group").querySelector<HTMLImageElement>("img[data-type-picture]");
      expect(found).not.toBeNull();
      return found!;
    });
    expect(img.getAttribute("src")).toBe("https://files.example.test/files/fc");
    expect(img.style.width).toBe("20px");
    expect(img.getAttribute("data-type-picture")).toBe("FunctionConstraint");
    const row = screen.getByTestId("card-group").firstElementChild!;
    expect([...row.children].slice(0, 3).map((c) => c.tagName)).toEqual(["SPAN", "IMG", "SPAN"]);
    expect(row.children[2]!.textContent).toBe("Function Constraint");
  });

  it("no type name, or a type with no picture, draws no image", async () => {
    const source = { fetchTypePictureSrc: vi.fn(async () => null) } as unknown as TypePictureSource;
    const a = render(
      <TypePictureSourceContext.Provider value={source}>
        <PlanTypeLevelVersion {...base()} />
      </TypePictureSourceContext.Provider>,
    );
    expect(source.fetchTypePictureSrc).not.toHaveBeenCalled();
    a.unmount();
    render(
      <TypePictureSourceContext.Provider value={source}>
        <PlanTypeLevelVersion {...base({ typeName: "Function" })} />
      </TypePictureSourceContext.Provider>,
    );
    await waitFor(() => expect(source.fetchTypePictureSrc).toHaveBeenCalledWith("Function"));
    expect(screen.getByTestId("card-group").querySelector("img")).toBeNull();
  });

  it("an empty type name draws nothing and asks for nothing", () => {
    const source = { fetchTypePictureSrc: vi.fn(async () => "x") } as unknown as TypePictureSource;
    render(
      <TypePictureSourceContext.Provider value={source}>
        <PlanTypeLevelVersion {...base({ typeName: "" })} />
      </TypePictureSourceContext.Provider>,
    );
    expect(source.fetchTypePictureSrc).not.toHaveBeenCalled();
  });
});

describe("Level (read)", () => {
  it("is a button naming the level; a click opens the chooser when the card can be edited", () => {
    const setLevelOpen = vi.fn();
    show({ setLevelOpen });
    const button = screen.getByRole("button", { name: "Level" });
    expect(button.textContent).toBe("Plan");
    expect(button.className).toBe("text-left text-[var(--ink)]");
    fireEvent.click(button);
    expect(setLevelOpen).toHaveBeenCalledWith(true);
  });

  it("with no level it shows the default text in the faint colour", () => {
    show({ levelText: "", levelDefaultText: "Not set" });
    const button = screen.getByRole("button", { name: "Level" });
    expect(button.textContent).toBe("Not set");
    expect(button.className).toBe("text-left text-[var(--ink-faint)]");
  });

  it("a click does nothing when the card cannot be edited", () => {
    const setLevelOpen = vi.fn();
    show({ setLevelOpen, canEdit: false });
    fireEvent.click(screen.getByRole("button", { name: "Level" }));
    expect(setLevelOpen).not.toHaveBeenCalled();
  });
});

describe("Level (chooser)", () => {
  const sel = () => screen.getByRole("combobox", { name: "Level" }) as HTMLSelectElement;

  it("shows a select in Edit and when opened; the options are the level options labelled by optionLabel, then '+ Add level…'", () => {
    const a = show({ editing: true });
    expect([...sel().options].map((o) => [o.value, o.textContent])).toEqual([
      ["now", "Level Now"],
      ["plan", "Level Plan"],
      ["__add__", "+ Add level…"],
    ]);
    expect(sel().value).toBe("plan");
    a.unmount();
    show({ levelOpen: true });
    expect(sel()).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Level" })).toBeNull();
  });

  it("the option's own `label` is not shown; optionLabel is asked for each node", () => {
    const optionLabel = vi.fn((n: { token: string }) => `<${n.token}>`);
    show({ editing: true, optionLabel: optionLabel as unknown as (node: never) => string });
    expect([...sel().options].map((o) => o.textContent)).toEqual(["<now>", "<plan>", "+ Add level…"]);
    expect(optionLabel).toHaveBeenCalledWith(LEVELS[0]);
  });

  it("with no level selected a blank option comes first and is the one selected", () => {
    show({ editing: true, levelSelected: "" });
    expect([...sel().options].map((o) => o.value)).toEqual(["", "now", "plan", "__add__"]);
    expect(sel().value).toBe("");
  });

  it("choosing a level calls onChooseLevel with its token", () => {
    const onChooseLevel = vi.fn();
    show({ editing: true, onChooseLevel });
    fireEvent.change(sel(), { target: { value: "now" } });
    expect(onChooseLevel.mock.calls).toEqual([["now"]]);
  });

  it("choosing '+ Add level…' calls onAddLevel and not onChooseLevel", () => {
    const onChooseLevel = vi.fn();
    const onAddLevel = vi.fn();
    show({ editing: true, onChooseLevel, onAddLevel });
    fireEvent.change(sel(), { target: { value: "__add__" } });
    expect(onAddLevel).toHaveBeenCalledTimes(1);
    expect(onChooseLevel).not.toHaveBeenCalled();
  });

  it("choosing an option whose token is empty calls nothing", () => {
    const onChooseLevel = vi.fn();
    const onAddLevel = vi.fn();
    show({ editing: true, onChooseLevel, onAddLevel, levelOptions: [{ token: "", label: "None" }, ...LEVELS] });
    fireEvent.change(sel(), { target: { value: "" } });
    expect(onChooseLevel).not.toHaveBeenCalled();
    expect(onAddLevel).not.toHaveBeenCalled();
  });

  it("takes the focus when it was opened by a click (not in Edit), and not in Edit", () => {
    const a = show({ levelOpen: true });
    expect(document.activeElement).toBe(sel());
    a.unmount();
    show({ levelOpen: true, editing: true });
    expect(document.activeElement).not.toBe(sel());
  });

  it("leaving it closes it when it was opened by a click, unless a level is being added; in Edit it stays", () => {
    const setLevelOpen = vi.fn();
    const a = show({ levelOpen: true, setLevelOpen });
    fireEvent.blur(sel());
    expect(setLevelOpen.mock.calls).toEqual([[false]]);
    a.unmount();
    setLevelOpen.mockClear();
    const b = show({ levelOpen: true, setLevelOpen, addingLevel: true });
    fireEvent.blur(sel());
    b.unmount();
    show({ levelOpen: true, setLevelOpen, editing: true });
    fireEvent.blur(sel());
    expect(setLevelOpen).not.toHaveBeenCalled();
  });

  it("Escape closes it (and stops there) when it was opened by a click; in Edit the key goes on", () => {
    const setLevelOpen = vi.fn();
    const around = vi.fn();
    const a = show({ levelOpen: true, setLevelOpen }, (el) => <div onKeyDown={around}>{el}</div>);
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    sel().dispatchEvent(ev);
    expect(setLevelOpen.mock.calls).toEqual([[false]]);
    expect(ev.defaultPrevented).toBe(true);
    expect(around).not.toHaveBeenCalled();
    a.unmount();
    setLevelOpen.mockClear();
    show({ levelOpen: true, editing: true, setLevelOpen }, (el) => <div onKeyDown={around}>{el}</div>);
    fireEvent.keyDown(sel(), { key: "Escape" });
    expect(setLevelOpen).not.toHaveBeenCalled();
    expect(around).toHaveBeenCalledTimes(1);
  });

  it("Enter takes the focus out of it (which, outside Edit, closes it)", async () => {
    const user = userEvent.setup();
    const setLevelOpen = vi.fn();
    show({ levelOpen: true, setLevelOpen });
    expect(document.activeElement).toBe(sel());
    await user.keyboard("{Enter}");
    expect(document.activeElement).not.toBe(sel());
    expect(setLevelOpen).toHaveBeenCalledWith(false);
  });

  it("another key does nothing here", () => {
    const setLevelOpen = vi.fn();
    show({ levelOpen: true, setLevelOpen });
    fireEvent.keyDown(sel(), { key: "a" });
    expect(setLevelOpen).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(sel());
  });
});

describe("Version", () => {
  it("shows the day in the local zone and the full local date and time as the title", () => {
    const version = new Date(2026, 0, 5, 23, 59, 30);
    show({ version });
    const el = screen.getByLabelText("Version");
    expect(el.textContent).toBe("2026-01-05");
    expect(el.getAttribute("title")).toBe(version.toLocaleString());
    expect(el.getAttribute("title")).not.toBe("");
  });

  it("with no version shows a dash and no title", () => {
    show({ version: null });
    const el = screen.getByLabelText("Version");
    expect(el.textContent).toBe("—");
    expect(el.hasAttribute("title")).toBe(false);
  });
});
