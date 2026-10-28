// Pinning tests: every prop, every testid, aria name and data attribute of the picker, and the odd cases as the code does them.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { PlanQualifierValue, type QualifierPick, type QualifierValueProps } from "./index";

afterEach(() => {
  cleanup();
  document.body.innerHTML = "";
});

const OPTIONS = [
  { name: "iPhone", definition: "Apple phone" },
  { name: "Android", definition: "" },
  { name: "Web", definition: "A browser" },
];

function setup(props: Partial<QualifierValueProps> = {}) {
  const onCommit = vi.fn<(next: QualifierPick) => void>();
  const close = vi.fn();
  const view = render(
    <div data-testid="outside-wrap">
      <button type="button" data-testid="outside">outside</button>
      <PlanQualifierValue label="Platform" name="Platform" options={OPTIONS} value="" onCommit={onCommit} close={close} {...props} />
    </div>,
  );
  const group = () => screen.getByRole("group");
  const box = (r: string) => screen.getByLabelText(`Platform ${r}`) as HTMLInputElement;
  const done = () => screen.getByText("Done");
  const free = () => group().querySelector("[data-qv-row-free]") as HTMLInputElement;
  return { onCommit, close, view, group, box, done, free };
}

const ticked = (t: ReturnType<typeof setup>) =>
  [...t.group().querySelectorAll<HTMLInputElement>("[data-qv-row]")].filter((b) => b.checked).map((b) => b.getAttribute("data-qv-row"));
const rowNames = (t: ReturnType<typeof setup>) =>
  [...t.group().querySelectorAll<HTMLInputElement>("[data-qv-row]")].map((b) => b.getAttribute("data-qv-row"));

describe("the group", () => {
  it("is a role=group named exactly `Choose <label>` (another unit finds it by [role=group][aria-label^=\"Choose \"])", () => {
    const t = setup({ label: "Level 2 Country" });
    expect(t.group().getAttribute("aria-label")).toBe("Choose Level 2 Country");
    const found = t.view.container.querySelectorAll('[role="group"][aria-label^="Choose "]');
    expect(found).toHaveLength(1);
    expect(found[0]).toBe(t.group());
  });
  it("has no data-not-in-scale and no note when the name is in the Scale", () => {
    const t = setup();
    expect(t.group().hasAttribute("data-not-in-scale")).toBe(false);
    expect(screen.queryByText("Not in the Scale")).toBeNull();
    expect(t.group().className).not.toMatch(/opacity-70/);
  });
  it("notInScale: data-not-in-scale=yes, the note, greyed (opacity-70)", () => {
    const t = setup({ notInScale: true });
    expect(t.group().getAttribute("data-not-in-scale")).toBe("yes");
    expect(screen.getByText("Not in the Scale")).toBeTruthy();
    expect(t.group().className).toMatch(/opacity-70/);
  });
  it("the rows sit in data-testid=qv-rows", () => {
    const t = setup();
    const rows = screen.getByTestId("qv-rows");
    expect(rows.querySelectorAll("[data-qv-row]")).toHaveLength(4);
    expect(t.group().contains(rows)).toBe(true);
  });
  it("uses the variables the host must supply", () => {
    const t = setup();
    for (const v of ["--r-md", "--focus", "--surface", "--ink", "--line", "--accent", "--ink-soft", "--ink-faint"]) {
      expect(t.view.container.innerHTML, v).toContain(v);
    }
  });
});

describe("the options", () => {
  it("lists ALL first, then the defined options in order, each as a checkbox named `<label> <option>`", () => {
    const t = setup();
    expect(rowNames(t)).toEqual(["ALL", "iPhone", "Android", "Web"]);
    for (const r of ["ALL", "iPhone", "Android", "Web"]) expect(t.box(r).type).toBe("checkbox");
  });
  it("shows each definition as a hint (and as the row's title); ALL says `Every value of <name>`", () => {
    setup();
    expect(screen.getByText("Apple phone")).toBeTruthy();
    expect(screen.getByText("A browser")).toBeTruthy();
    expect(screen.getByText("Every value of Platform")).toBeTruthy();
    expect(screen.getByText("Apple phone").closest("label")?.getAttribute("title")).toBe("Apple phone");
    expect(screen.getByText("Every value of Platform").closest("label")?.getAttribute("title")).toBe("Every value of Platform");
  });
  it("an option with no definition has no hint and no title, unless it is the default: then `Default`", () => {
    setup({ defaultOption: "Android" });
    const label = screen.getByText("Android").closest("label")!;
    expect(label.getAttribute("title")).toBe("Default");
    expect(label.textContent).toBe("AndroidDefault");
    cleanup();
    setup();
    const plain = screen.getByText("Android").closest("label")!;
    expect(plain.hasAttribute("title")).toBe(false);
    expect(plain.textContent).toBe("Android");
  });
  it("the default is matched without case or spaces; a definition wins over `Default`", () => {
    setup({ defaultOption: "  android " });
    expect(screen.getByText("Android").closest("label")?.getAttribute("title")).toBe("Default");
    cleanup();
    setup({ defaultOption: "iPhone" });
    expect(screen.getByText("iPhone").closest("label")?.getAttribute("title")).toBe("Apple phone");
  });
  it("an option with a blank name is not offered", () => {
    const t = setup({ options: [{ name: "  ", definition: "x" }, { name: "Web", definition: "" }] });
    expect(rowNames(t)).toEqual(["ALL", "Web"]);
  });
  it("the free-text input is `Other…`, named `Other value for <label>`, not focused", () => {
    const t = setup();
    expect(t.free().getAttribute("aria-label")).toBe("Other value for Platform");
    expect(t.free().getAttribute("placeholder")).toBe("Other…");
    expect(t.free().hasAttribute("list")).toBe(false);
    expect(document.activeElement).not.toBe(t.free());
    expect(t.view.container.querySelector("datalist")).toBeNull();
  });
});

describe("what is ticked at the start", () => {
  it("nothing for an empty value", () => {
    expect(ticked(setup())).toEqual([]);
  });
  it("the current value, one or several, matched without case", () => {
    expect(ticked(setup({ value: "iphone" }))).toEqual(["iPhone"]);
    cleanup();
    expect(ticked(setup({ value: ["iPhone", "Web"] }))).toEqual(["iPhone", "Web"]);
    cleanup();
    expect(ticked(setup({ value: "ALL" }))).toEqual(["ALL"]);
  });
  it("a value that is not a defined option gets its own ticked row, after the options, once", () => {
    const t = setup({ value: ["Old", "old", "iPhone"] });
    expect(rowNames(t)).toEqual(["ALL", "iPhone", "Android", "Web", "Old"]);
    expect(ticked(t)).toEqual(["iPhone", "Old"]);
  });
  it("undefined is empty", () => {
    expect(ticked(setup({ value: undefined }))).toEqual([]);
  });
});

describe("ticking", () => {
  it("several options may be ticked, and one Done commits them in tick order as a list", () => {
    const t = setup();
    fireEvent.click(t.box("Web"));
    fireEvent.click(t.box("iPhone"));
    expect(ticked(t)).toEqual(["iPhone", "Web"]);
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    expect(t.onCommit).toHaveBeenCalledWith(["Web", "iPhone"]);
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("one option commits as a plain string", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith("iPhone");
  });
  it("ticking again unticks", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.click(t.box("iPhone"));
    expect(ticked(t)).toEqual([]);
    fireEvent.click(t.done());
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("ALL clears the others, and another tick clears ALL", () => {
    const t = setup({ value: ["iPhone", "Web"] });
    fireEvent.click(t.box("ALL"));
    expect(ticked(t)).toEqual(["ALL"]);
    fireEvent.click(t.box("Android"));
    expect(ticked(t)).toEqual(["Android"]);
    fireEvent.click(t.box("ALL"));
    expect(ticked(t)).toEqual(["ALL"]);
    fireEvent.click(t.box("ALL"));
    expect(ticked(t)).toEqual([]);
  });
  it("ALL commits as the string ALL", () => {
    const t = setup();
    fireEvent.click(t.box("ALL"));
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith("ALL");
  });
  it("the same set in another tick order is a change (the order is compared)", () => {
    const t = setup({ value: ["iPhone", "Web"] });
    fireEvent.click(t.box("iPhone"));
    fireEvent.click(t.box("iPhone"));
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith(["Web", "iPhone"]);
  });
  it("Done with nothing changed commits nothing and closes", () => {
    const t = setup({ value: ["iPhone", "Web"] });
    fireEvent.click(t.done());
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("a list that differs from the current value only in case or padding is not a change", () => {
    const t = setup({ value: ["  iPhone ", "Web"] });
    fireEvent.click(t.done());
    expect(t.onCommit).not.toHaveBeenCalled();
  });
});

describe("Other…", () => {
  it("typed text is added to the ticks on Done", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.change(t.free(), { target: { value: "  Watch " } });
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith(["iPhone", "Watch"]);
  });
  it("Enter in the box ticks the typed word as a new row and empties the box; nothing is committed yet", () => {
    const t = setup();
    fireEvent.change(t.free(), { target: { value: "Watch" } });
    fireEvent.keyDown(t.free(), { key: "Enter" });
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).not.toHaveBeenCalled();
    expect(t.free().value).toBe("");
    expect(rowNames(t)).toEqual(["ALL", "iPhone", "Android", "Web", "Watch"]);
    expect(ticked(t)).toEqual(["Watch"]);
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith("Watch");
  });
  it("Enter on a typed word drops ALL and does not tick the same word twice", () => {
    const t = setup({ value: "ALL" });
    fireEvent.change(t.free(), { target: { value: "iPhone" } });
    fireEvent.keyDown(t.free(), { key: "Enter" });
    expect(ticked(t)).toEqual(["iPhone"]);
    fireEvent.change(t.free(), { target: { value: "IPHONE" } });
    fireEvent.keyDown(t.free(), { key: "Enter" });
    expect(ticked(t)).toEqual(["iPhone"]);
  });
  it("Enter in an empty box commits (as Done does)", () => {
    const t = setup({ value: "iPhone" });
    fireEvent.click(t.box("Web"));
    fireEvent.keyDown(t.free(), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith(["iPhone", "Web"]);
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("typing all (any case) commits ALL", () => {
    const t = setup();
    fireEvent.change(t.free(), { target: { value: "all" } });
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith("ALL");
  });
  it("typed text equal (without case) to a ticked option is not added twice", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.change(t.free(), { target: { value: "iphone" } });
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith("iPhone");
  });
});

describe("with no defined options", () => {
  it("the free text is the main input: named `Edit <label>`, focused, placeholder is the name, filled with the current value", () => {
    const t = setup({ options: [], value: "Sweden" });
    expect(t.free().getAttribute("aria-label")).toBe("Edit Platform");
    expect(t.free().getAttribute("placeholder")).toBe("Platform");
    expect(t.free().value).toBe("Sweden");
    expect(document.activeElement).toBe(t.free());
    expect(rowNames(t)).toEqual(["ALL"]);
    expect(ticked(t)).toEqual([]);
  });
  it("offers the values used elsewhere as a datalist named from the label", () => {
    const t = setup({ options: [], used: ["Sweden", "Norway"], label: "Level 2 Country" });
    const list = t.view.container.querySelector("datalist") as HTMLDataListElement;
    expect(list.id).toBe("qv-Level-2-Country");
    expect([...list.querySelectorAll("option")].map((o) => o.getAttribute("value"))).toEqual(["Sweden", "Norway"]);
    expect(t.free().getAttribute("list")).toBe("qv-Level-2-Country");
  });
  it("the datalist id replaces each run of non-word characters by one hyphen", () => {
    const t = setup({ options: [], label: "A/B  c.d" });
    expect(t.view.container.querySelector("datalist")?.id).toBe("qv-A-B-c-d");
  });
  it("Enter commits what is typed", () => {
    const t = setup({ options: [], value: "Sweden" });
    fireEvent.change(t.free(), { target: { value: "Norway" } });
    fireEvent.keyDown(t.free(), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith("Norway");
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("Done with the text unchanged commits nothing", () => {
    const t = setup({ options: [], value: "Sweden" });
    fireEvent.click(t.done());
    expect(t.onCommit).not.toHaveBeenCalled();
  });
  it("a current value of ALL is ticked, and the box is empty", () => {
    const t = setup({ options: [], value: "ALL" });
    expect(t.free().value).toBe("");
    expect(ticked(t)).toEqual(["ALL"]);
  });
  it("several current values are rows, ticked, and the box is empty", () => {
    const t = setup({ options: [], value: ["a", "b"] });
    expect(t.free().value).toBe("");
    expect(rowNames(t)).toEqual(["ALL", "a", "b"]);
    expect(ticked(t)).toEqual(["a", "b"]);
  });
  it("the datalist exists only when there are no options", () => {
    expect(setup().view.container.querySelector("datalist")).toBeNull();
  });
});

describe("single", () => {
  it("one tick replaces another, and ticking the same one again unticks it", () => {
    const t = setup({ single: true });
    fireEvent.click(t.box("iPhone"));
    fireEvent.click(t.box("Web"));
    expect(ticked(t)).toEqual(["Web"]);
    fireEvent.click(t.box("Web"));
    expect(ticked(t)).toEqual([]);
  });
  it("commits one value", () => {
    const t = setup({ single: true });
    fireEvent.click(t.box("Web"));
    fireEvent.click(t.done());
    expect(t.onCommit).toHaveBeenCalledWith("Web");
  });
  it("Enter in the Other… box does not tick: it commits the box with the tick as a list (as the code does)", () => {
    const t = setup({ single: true });
    fireEvent.click(t.box("iPhone"));
    fireEvent.change(t.free(), { target: { value: "Watch" } });
    fireEvent.keyDown(t.free(), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith(["iPhone", "Watch"]);
  });
});

describe("Clear", () => {
  it("is named `Clear <label>`, commits an empty value once and closes", () => {
    const t = setup({ value: ["iPhone", "Web"] });
    const clear = screen.getByLabelText("Clear Platform");
    expect(clear.textContent).toBe("Clear");
    fireEvent.click(clear);
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    expect(t.onCommit).toHaveBeenCalledWith("");
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("ignores the ticks and the typed text", () => {
    const t = setup({ value: "iPhone" });
    fireEvent.click(t.box("Web"));
    fireEvent.change(t.free(), { target: { value: "Watch" } });
    fireEvent.click(screen.getByLabelText("Clear Platform"));
    expect(t.onCommit).toHaveBeenCalledWith("");
  });
  it("on a value that is already empty commits nothing, and closes", () => {
    const t = setup({ value: "" });
    fireEvent.click(screen.getByLabelText("Clear Platform"));
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("Enter on the Clear button commits the ticks, not a clear (the key goes to the group's Enter rule)", () => {
    const t = setup({ value: "iPhone" });
    fireEvent.click(t.box("Web"));
    fireEvent.keyDown(screen.getByLabelText("Clear Platform"), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith(["iPhone", "Web"]);
  });
});

describe("Enter", () => {
  it("on a row with nothing ticked picks that row at once", () => {
    const t = setup();
    fireEvent.keyDown(t.box("Web"), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    expect(t.onCommit).toHaveBeenCalledWith("Web");
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("on the ALL row with nothing ticked picks ALL", () => {
    const t = setup();
    fireEvent.keyDown(t.box("ALL"), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith("ALL");
  });
  it("on a row with something ticked commits the ticks, not the row", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.keyDown(t.box("Web"), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith("iPhone");
  });
  it("on a row with text typed in the box commits the ticks and the text", () => {
    const t = setup();
    fireEvent.change(t.free(), { target: { value: "Watch" } });
    fireEvent.keyDown(t.box("Web"), { key: "Enter" });
    expect(t.onCommit).toHaveBeenCalledWith("Watch");
  });
  it("commits ONE change: a second Enter, Done or leaving does nothing more", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.keyDown(t.box("iPhone"), { key: "Enter" });
    fireEvent.keyDown(t.box("iPhone"), { key: "Enter" });
    fireEvent.click(t.done());
    fireEvent.blur(t.box("iPhone"), { relatedTarget: null });
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("the key's default is prevented", () => {
    const t = setup();
    expect(fireEvent.keyDown(t.box("Web"), { key: "Enter" })).toBe(false);
    expect(t.onCommit).toHaveBeenCalledTimes(1);
  });
  it("a key other than Enter, Escape or the arrows does nothing", () => {
    const t = setup();
    expect(fireEvent.keyDown(t.box("Web"), { key: "a" })).toBe(true);
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).not.toHaveBeenCalled();
  });
});

describe("leaving", () => {
  it("focus moving outside the group commits once, and closes", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    t.box("iPhone").focus();
    screen.getByTestId("outside").focus();
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    expect(t.onCommit).toHaveBeenCalledWith("iPhone");
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("a blur with no other element (the window lost focus) commits too", () => {
    const t = setup();
    fireEvent.click(t.box("Web"));
    fireEvent.blur(t.box("Web"), { relatedTarget: null });
    expect(t.onCommit).toHaveBeenCalledWith("Web");
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("focus moving between controls inside the group does not commit", () => {
    const t = setup();
    t.box("iPhone").focus();
    t.free().focus();
    t.box("Web").focus();
    fireEvent.blur(t.box("Web"), { relatedTarget: t.done() });
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).not.toHaveBeenCalled();
  });
  it("leaving with nothing changed commits nothing but closes", () => {
    const t = setup({ value: "iPhone" });
    fireEvent.blur(t.box("iPhone"), { relatedTarget: screen.getByTestId("outside") });
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("a click outside is a focus move to an outside control, so it commits (one change)", () => {
    const t = setup();
    fireEvent.click(t.box("Android"));
    const outside = screen.getByTestId("outside");
    t.box("Android").focus();
    outside.focus();
    fireEvent.click(outside);
    expect(t.onCommit).toHaveBeenCalledTimes(1);
    expect(t.onCommit).toHaveBeenCalledWith("Android");
  });
});

describe("Escape", () => {
  it("commits nothing, closes once, and stops the key from reaching the parent", () => {
    const onCommit = vi.fn();
    const close = vi.fn();
    const parentKey = vi.fn();
    render(
      <div onKeyDown={parentKey}>
        <PlanQualifierValue label="Platform" name="Platform" options={OPTIONS} value="" onCommit={onCommit} close={close} />
      </div>,
    );
    fireEvent.click(screen.getByLabelText("Platform iPhone"));
    const notPrevented = fireEvent.keyDown(screen.getByLabelText("Platform iPhone"), { key: "Escape" });
    expect(notPrevented).toBe(false);
    expect(onCommit).not.toHaveBeenCalled();
    expect(close).toHaveBeenCalledTimes(1);
    expect(parentKey).not.toHaveBeenCalled();
  });
  it("other keys still reach the parent", () => {
    const parentKey = vi.fn();
    render(
      <div onKeyDown={parentKey}>
        <PlanQualifierValue label="Platform" name="Platform" options={OPTIONS} value="" onCommit={() => {}} close={() => {}} />
      </div>,
    );
    fireEvent.keyDown(screen.getByLabelText("Platform iPhone"), { key: "a" });
    expect(parentKey).toHaveBeenCalledTimes(1);
  });
  it("after Escape, leaving or Done commits nothing and does not close again", () => {
    const t = setup();
    fireEvent.click(t.box("iPhone"));
    fireEvent.keyDown(t.box("iPhone"), { key: "Escape" });
    fireEvent.blur(t.box("iPhone"), { relatedTarget: null });
    fireEvent.click(t.done());
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
  it("works from the Other… box too", () => {
    const t = setup();
    fireEvent.change(t.free(), { target: { value: "Watch" } });
    fireEvent.keyDown(t.free(), { key: "Escape" });
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).toHaveBeenCalledTimes(1);
  });
});

describe("arrow keys", () => {
  const focused = () => document.activeElement?.getAttribute("data-qv-row");
  it("ArrowDown and ArrowUp move between the rows, wrapping, and prevent the default", () => {
    const t = setup();
    t.box("ALL").focus();
    expect(fireEvent.keyDown(t.box("ALL"), { key: "ArrowDown" })).toBe(false);
    expect(focused()).toBe("iPhone");
    fireEvent.keyDown(t.box("iPhone"), { key: "ArrowDown" });
    expect(focused()).toBe("Android");
    fireEvent.keyDown(t.box("Android"), { key: "ArrowUp" });
    expect(focused()).toBe("iPhone");
    fireEvent.keyDown(t.box("iPhone"), { key: "ArrowUp" });
    expect(focused()).toBe("ALL");
    fireEvent.keyDown(t.box("ALL"), { key: "ArrowUp" });
    expect(focused()).toBe("Web");
    fireEvent.keyDown(t.box("Web"), { key: "ArrowDown" });
    expect(focused()).toBe("ALL");
  });
  it("from the Other… box, ArrowDown goes to the first row and ArrowUp to the last", () => {
    const t = setup();
    t.free().focus();
    fireEvent.keyDown(t.free(), { key: "ArrowDown" });
    expect(focused()).toBe("ALL");
    t.free().focus();
    fireEvent.keyDown(t.free(), { key: "ArrowUp" });
    expect(focused()).toBe("Web");
  });
  it("moving does not commit", () => {
    const t = setup();
    t.box("ALL").focus();
    fireEvent.keyDown(t.box("ALL"), { key: "ArrowDown" });
    expect(t.onCommit).not.toHaveBeenCalled();
    expect(t.close).not.toHaveBeenCalled();
  });
});

describe("the type exports", () => {
  it("QualifierPick is a string or a list of strings; the props type has the documented fields", () => {
    const one: QualifierPick = "a";
    const many: QualifierPick = ["a", "b"];
    const props: QualifierValueProps = {
      label: "L",
      name: "N",
      options: [{ name: "o", definition: "d" }],
      defaultOption: "o",
      value: undefined,
      used: ["u"],
      single: true,
      notInScale: false,
      onCommit: () => {},
      close: () => {},
    };
    expect([one, many, props.label]).toEqual(["a", ["a", "b"], "L"]);
  });
});
