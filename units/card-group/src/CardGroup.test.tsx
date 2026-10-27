import { StrictMode, useState, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardModeProvider, __startCardsInEditMode, useCardMode, type CardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { CARD_ADD_ATTR, CardGroup, CardSection, FOCUS_WAIT_MS, chooserSectionOf } from "./index";

afterEach(() => {
  __startCardsInEditMode(false);
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = "";
});

let mode: CardMode;
function Probe() {
  mode = useCardMode();
  return null;
}
const card = (children: ReactNode, props: { canEdit?: boolean } = {}) => (
  <CardModeProvider canEdit={props.canEdit ?? true}>
    <Probe />
    {children}
  </CardModeProvider>
);
const drawn = (id = "card-group") => screen.queryByTestId(id) !== null;
const wait = (ms = 20) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms));
  });

describe("chooserSectionOf", () => {
  it.each([
    ["name", "Name"],
    ["email", "Connection points"],
    ["phone", "Connection points"],
    ["address", "Connection points"],
    ["social", "Connection points"],
    ["employment", "Companies"],
    ["skill", "Skills and interests"],
    ["interest", "Skills and interests"],
    ["language", "Skills and interests"],
    ["relation-actsOnBehalfOf", "Relations"],
    ["channel-email", "Contact preferences"],
    ["time-zone", "Contact preferences"],
    ["attachments", "Attachments"],
    ["my-note", "Notes"],
    ["how-we-met", "Notes"],
    ["plan-function", "Plan"],
    ["plan-", "Plan"],
    ["other", "Record"],
    ["", "Record"],
  ])("%j is listed under %j", (kind, section) => {
    expect(chooserSectionOf(kind)).toBe(section);
  });
  it("matches whole names for the exact kinds and prefixes for the others", () => {
    expect(chooserSectionOf("emails")).toBe("Record");
    expect(chooserSectionOf("relation")).toBe("Record");
    expect(chooserSectionOf("channel")).toBe("Record");
    expect(chooserSectionOf("plan")).toBe("Record");
    expect(chooserSectionOf("Name")).toBe("Record");
  });
});

describe("constants", () => {
  it("CARD_ADD_ATTR is data-card-add and the wait is a minute", () => {
    expect(CARD_ADD_ATTR).toBe("data-card-add");
    expect(FOCUS_WAIT_MS).toBe(60000);
  });
});

describe("CardGroup: when it is drawn", () => {
  it("in presentation an empty group is not drawn; one with a value is", () => {
    const { rerender } = render(card(<CardGroup kind="email" title="Email" empty>x</CardGroup>));
    expect(drawn()).toBe(false);
    rerender(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    expect(drawn()).toBe(true);
  });
  it("in edit an empty group is still not drawn, unless keepInEdit, or it was opened from the chooser", () => {
    const { rerender } = render(card(<CardGroup kind="email" title="Email" empty>x</CardGroup>));
    act(() => mode.enter());
    expect(drawn()).toBe(false);
    rerender(card(<CardGroup kind="email" title="Email" empty keepInEdit>x</CardGroup>));
    expect(drawn()).toBe(true);
    rerender(card(<CardGroup kind="email" title="Email" empty>x</CardGroup>));
    expect(drawn()).toBe(false);
    act(() => mode.openGroup("email"));
    expect(drawn()).toBe(true);
  });
  it("keepInEdit does not draw an empty group in presentation", () => {
    render(card(<CardGroup kind="name" title="Name" empty keepInEdit>x</CardGroup>));
    expect(drawn()).toBe(false);
    act(() => mode.enter());
    expect(drawn()).toBe(true);
    act(() => mode.leave());
    expect(drawn()).toBe(false);
  });
  it("a group that had a value in this edit stays when emptied; leaving edit forgets it", () => {
    const { rerender } = render(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    act(() => mode.enter());
    rerender(card(<CardGroup kind="email" title="Email" empty>x</CardGroup>));
    expect(drawn()).toBe(true);
    act(() => mode.leave());
    expect(drawn()).toBe(false);
    act(() => mode.enter());
    expect(drawn()).toBe(false);
  });
  it("with no provider (not managed) an empty group is drawn, and nothing is registered", () => {
    render(<CardGroup kind="email" title="Email" empty>x</CardGroup>);
    expect(drawn()).toBe(true);
  });
  it("with the showAll seam on, an empty group is drawn in presentation too", () => {
    __startCardsInEditMode(true);
    render(card(<CardGroup kind="email" title="Email" empty>x</CardGroup>));
    expect(mode.showAll).toBe(true);
    expect(drawn()).toBe(true);
  });
  it("a card that cannot be written never draws an empty group", () => {
    render(card(<CardGroup kind="email" title="Email" empty keepInEdit>x</CardGroup>, { canEdit: false }));
    act(() => mode.openGroup("email"));
    expect(drawn()).toBe(false);
  });
});

describe("CardGroup: registering with the mode", () => {
  it("registers {kind, label, section, shown, addable}; the label is the string title", () => {
    render(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    expect(mode.groups.get("email")).toEqual({ kind: "email", label: "Email", section: "Connection points", shown: true, addable: true });
  });
  it("the label is the label prop, else a string title, else the kind", () => {
    render(card(
      <>
        <CardGroup kind="a" title={<b>A</b>} label="Words">x</CardGroup>
        <CardGroup kind="b" title="Plain" label="Words B">x</CardGroup>
        <CardGroup kind="c" title={<b>C</b>}>x</CardGroup>
      </>,
    ));
    expect(mode.groups.get("a")?.label).toBe("Words");
    expect(mode.groups.get("b")?.label).toBe("Words B");
    expect(mode.groups.get("c")?.label).toBe("c");
  });
  it("shown is false while hidden, true once drawn; addable false is passed on", () => {
    render(card(<CardGroup kind="phone" title="Phone" empty addable={false}>x</CardGroup>));
    expect(mode.groups.get("phone")).toEqual({ kind: "phone", label: "Phone", section: "Connection points", shown: false, addable: false });
    act(() => mode.enter());
    expect(mode.groups.get("phone")?.shown).toBe(false);
    act(() => mode.openGroup("phone"));
    expect(mode.groups.get("phone")?.shown).toBe(true);
  });
  it("its section is chooserSectionOf(kind)", () => {
    render(card(<CardGroup kind="plan-solution" title="Solution">x</CardGroup>));
    expect(mode.groups.get("plan-solution")?.section).toBe("Plan");
  });
  it("unmounting removes it again", () => {
    const { rerender } = render(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    expect(mode.groups.has("email")).toBe(true);
    rerender(card(null));
    expect(mode.groups.has("email")).toBe(false);
  });
});

describe("CardGroup: markup", () => {
  it("non-inline: section with header, title, helper, items and aside", () => {
    render(card(
      <CardGroup kind="email" title="Email" icon="email" helper="One quiet line" aside={<i data-testid="chip">chip</i>}>
        <span data-testid="child">v</span>
      </CardGroup>,
    ));
    const section = screen.getByTestId("card-group");
    expect(section.tagName).toBe("SECTION");
    expect(section.getAttribute("data-group")).toBe("email");
    expect(section.hasAttribute("data-inline")).toBe(false);
    const h3 = section.querySelector("h3")!;
    expect(h3.textContent).toBe("Email");
    expect(section.getAttribute("aria-labelledby")).toBe(h3.id);
    expect(section.querySelector("header")).not.toBeNull();
    expect(section.querySelector("header svg")?.getAttribute("data-card-icon")).toBe("email");
    expect(screen.getByTestId("card-group-helper").textContent).toBe("One quiet line");
    expect(screen.getByTestId("card-group-helper").tagName).toBe("P");
    expect(screen.getByTestId("card-group-items").contains(screen.getByTestId("child"))).toBe(true);
    expect(screen.getByTestId("card-group-aside").contains(screen.getByTestId("chip"))).toBe(true);
    expect(screen.getByTestId("card-group-aside").className).toContain("max-w-[75%]");
  });
  it("non-inline without icon, helper or aside draws none of them", () => {
    render(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    expect(document.querySelector("svg")).toBeNull();
    expect(screen.queryByTestId("card-group-helper")).toBeNull();
    expect(screen.queryByTestId("card-group-aside")).toBeNull();
    expect(screen.getByTestId("card-group-items").textContent).toBe("x");
  });
  it("inline: data-inline, the items and the aside side by side, no header or helper", () => {
    render(card(
      <CardGroup kind="my-note" title="My Note" icon="note" inline helper="not drawn inline" aside={<i data-testid="chip">chip</i>}>
        <span data-testid="child">v</span>
      </CardGroup>,
    ));
    const section = screen.getByTestId("card-group");
    expect(section.getAttribute("data-inline")).toBe("true");
    expect(section.className).toContain("@container");
    expect(section.querySelector("header")).toBeNull();
    expect(screen.queryByTestId("card-group-helper")).toBeNull();
    expect(section.querySelector("h3")?.textContent).toBe("My Note");
    expect(section.getAttribute("aria-labelledby")).toBe(section.querySelector("h3")!.id);
    expect(screen.getByTestId("card-group-items").contains(screen.getByTestId("child"))).toBe(true);
    expect(screen.getByTestId("card-group-aside").contains(screen.getByTestId("chip"))).toBe(true);
    expect(section.querySelector("svg")?.getAttribute("data-card-icon")).toBe("note");
  });
  it("inline without an aside draws no aside", () => {
    render(card(<CardGroup kind="my-note" title="My Note" inline>x</CardGroup>));
    expect(screen.queryByTestId("card-group-aside")).toBeNull();
    expect(screen.getByTestId("card-group-items")).toBeTruthy();
  });
  it("default test id is card-group; testId overrides it", () => {
    render(card(<CardGroup kind="email" title="Email" testId="email-rows">x</CardGroup>));
    expect(screen.queryByTestId("card-group")).toBeNull();
    expect(screen.getByTestId("email-rows").getAttribute("data-group")).toBe("email");
    cleanup();
    render(card(<CardGroup kind="email" title="Email" inline testId="email-inline">x</CardGroup>));
    expect(screen.getByTestId("email-inline").getAttribute("data-inline")).toBe("true");
  });
  it("dataAttrs are spread onto the section", () => {
    render(card(<CardGroup kind="email" title="Email" dataAttrs={{ "data-x": "1", "data-y": "two" }}>x</CardGroup>));
    const s = screen.getByTestId("card-group");
    expect(s.getAttribute("data-x")).toBe("1");
    expect(s.getAttribute("data-y")).toBe("two");
    cleanup();
    render(card(<CardGroup kind="email" title="Email" inline dataAttrs={{ "data-x": "1" }}>x</CardGroup>));
    expect(screen.getByTestId("card-group").getAttribute("data-x")).toBe("1");
  });
  it("the frame's border is a mix of --lines at 14%", () => {
    render(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    const s = screen.getByTestId("card-group");
    expect(s.style.borderColor).toBe("color-mix(in srgb, var(--lines) 14%, transparent)");
    cleanup();
    render(card(<CardGroup kind="email" title="Email" inline>x</CardGroup>));
    expect(screen.getByTestId("card-group").style.borderColor).toBe("color-mix(in srgb, var(--lines) 14%, transparent)");
  });
  it("className is appended after the frame classes (one trailing space when empty)", () => {
    render(card(<CardGroup kind="email" title="Email" className="mt-2">x</CardGroup>));
    expect(screen.getByTestId("card-group").className).toBe("rounded-xl border bg-[var(--surface)] px-4 py-3 mt-2");
    cleanup();
    render(card(<CardGroup kind="email" title="Email">x</CardGroup>));
    expect(screen.getByTestId("card-group").getAttribute("class")).toBe("rounded-xl border bg-[var(--surface)] px-4 py-3 ");
    cleanup();
    render(card(<CardGroup kind="email" title="Email" inline className="mt-2">x</CardGroup>));
    expect(screen.getByTestId("card-group").className).toBe("@container rounded-xl border bg-[var(--surface)] px-4 py-1.5 mt-2");
  });
  it("addOwn is drawn after the children, inside the items; with none, nothing", () => {
    const { rerender } = render(card(<CardGroup kind="email" title="Email" addOwn={<button data-testid="own">+ Add your own</button>}><span data-testid="child">v</span></CardGroup>));
    const items = screen.getByTestId("card-group-items");
    expect([...items.children].map((c) => c.getAttribute("data-testid"))).toEqual(["child", "own"]);
    rerender(card(<CardGroup kind="email" title="Email"><span data-testid="child">v</span></CardGroup>));
    expect(screen.getByTestId("card-group-items").children).toHaveLength(1);
  });
  it("addOwn is not drawn in the inline layout", () => {
    render(card(<CardGroup kind="email" title="Email" inline addOwn={<button data-testid="own">own</button>}>x</CardGroup>));
    expect(screen.queryByTestId("own")).toBeNull();
  });
});

describe("CardGroup: the pick from the chooser (focusAfterPick, through openGroup)", () => {
  function Rows({ onAdd, disabled = false }: { onAdd?: () => void; disabled?: boolean }) {
    return (
      <CardGroup kind="email" title="Email" empty>
        <input data-testid="first" aria-label="first" />
        <button type="button" data-testid="add" {...{ [CARD_ADD_ATTR]: "" }} disabled={disabled} onClick={onAdd}>add</button>
      </CardGroup>
    );
  }

  // The host re-renders the button as enabled (React reads its own props, so the test drives the state, not the DOM).
  function Late({ onAdd }: { onAdd?: () => void }) {
    const [ready, setReady] = useState(false);
    return (
      <>
        <button type="button" data-testid="ready" onClick={() => setReady(true)}>ready</button>
        <Rows onAdd={onAdd} disabled={!ready} />
      </>
    );
  }

  it("presses the [data-card-add] button, once, and ends the pick", () => {
    const onAdd = vi.fn();
    render(card(<Rows onAdd={onAdd} />));
    expect(onAdd).not.toHaveBeenCalled();
    act(() => mode.openGroup("email"));
    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(mode.focusKind).toBeNull();
    expect(mode.opened.has("email")).toBe(true);
  });
  it("nothing is pressed or focused on loading or on entering edit", () => {
    const onAdd = vi.fn();
    render(card(<CardGroup kind="email" title="Email" keepInEdit empty><input data-testid="first" /><button data-card-add="" onClick={onAdd}>add</button></CardGroup>));
    act(() => mode.enter());
    expect(onAdd).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(document.body);
  });
  it("only the picked group is touched", () => {
    const a = vi.fn();
    const b = vi.fn();
    render(card(
      <>
        <CardGroup kind="email" title="Email" empty><button data-card-add="" onClick={a}>a</button></CardGroup>
        <CardGroup kind="phone" title="Phone" empty><button data-card-add="" onClick={b}>b</button></CardGroup>
      </>,
    ));
    act(() => mode.openGroup("phone"));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledTimes(1);
  });
  it("a group with no add control gets its first enabled control focused (hidden and disabled inputs are skipped)", () => {
    render(card(
      <CardGroup kind="record" title="Record" empty>
        <input type="hidden" />
        <input data-testid="off" disabled />
        <input data-testid="first" />
        <input data-testid="second" />
      </CardGroup>,
    ));
    act(() => mode.openGroup("record"));
    expect(document.activeElement).toBe(screen.getByTestId("first"));
    expect(mode.focusKind).toBeNull();
  });
  it("a lone button is focused, not pressed", () => {
    const onClick = vi.fn();
    render(card(<CardGroup kind="attachments" title="Attachments" empty><button data-testid="attach" onClick={onClick}>Attach file</button></CardGroup>));
    act(() => mode.openGroup("attachments"));
    expect(document.activeElement).toBe(screen.getByTestId("attach"));
    expect(onClick).not.toHaveBeenCalled();
  });
  it("a select and a textarea count as controls", () => {
    render(card(<CardGroup kind="record" title="Record" empty><textarea data-testid="ta" /></CardGroup>));
    act(() => mode.openGroup("record"));
    expect(document.activeElement).toBe(screen.getByTestId("ta"));
    cleanup();
    render(card(<CardGroup kind="record" title="Record" empty><select data-testid="sel"><option>a</option></select></CardGroup>));
    act(() => mode.openGroup("record"));
    expect(document.activeElement).toBe(screen.getByTestId("sel"));
  });
  it("a group with nothing to focus takes no focus, and the pick stays pending", () => {
    render(card(<CardGroup kind="channel-x" title="Channel" empty><span>None chosen yet.</span></CardGroup>));
    act(() => mode.openGroup("channel-x"));
    expect(screen.getByText("None chosen yet.")).toBeTruthy();
    expect(document.activeElement).toBe(document.body);
    expect(mode.focusKind).toBe("channel-x");
  });
  it("scrolls the group into view, centred, when the browser can", () => {
    const scroll = vi.fn();
    Element.prototype.scrollIntoView = scroll;
    try {
      render(card(<Rows />));
      act(() => mode.openGroup("email"));
      expect(scroll).toHaveBeenCalledWith({ block: "center" });
    } finally {
      delete (Element.prototype as { scrollIntoView?: unknown }).scrollIntoView;
    }
  });

  describe("a control that is not ready", () => {
    it("a disabled [data-card-add] is waited for, not replaced by focusing the first input, and pressed once enabled", async () => {
      const onAdd = vi.fn();
      render(card(<Late onAdd={onAdd} />));
      act(() => mode.openGroup("email"));
      expect(onAdd).not.toHaveBeenCalled();
      expect(document.activeElement).toBe(document.body);
      expect(mode.focusKind).toBe("email");
      fireEvent.click(screen.getByTestId("ready"));
      await wait();
      expect(onAdd).toHaveBeenCalledTimes(1);
      expect(mode.focusKind).toBeNull();
    });
    it("a control added later is found by the observer", async () => {
      render(card(<CardGroup kind="record" title="Record" empty><div data-testid="slot" /></CardGroup>));
      act(() => mode.openGroup("record"));
      const input = document.createElement("input");
      input.setAttribute("data-testid", "late");
      screen.getByTestId("slot").appendChild(input);
      await wait();
      expect(document.activeElement).toBe(input);
      expect(mode.focusKind).toBeNull();
    });
    it("a key pressed by the person ends the wait", async () => {
      const onAdd = vi.fn();
      render(card(<Late onAdd={onAdd} />));
      act(() => mode.openGroup("email"));
      fireEvent.keyDown(document.body, { key: "a" });
      expect(mode.focusKind).toBeNull();
      fireEvent.click(screen.getByTestId("ready"));
      await wait();
      expect(onAdd).not.toHaveBeenCalled();
    });
    it("a press anywhere ends the wait", async () => {
      const onAdd = vi.fn();
      render(card(<Late onAdd={onAdd} />));
      act(() => mode.openGroup("email"));
      fireEvent.pointerDown(document.body);
      fireEvent.click(screen.getByTestId("ready"));
      await wait();
      expect(onAdd).not.toHaveBeenCalled();
      expect(mode.focusKind).toBeNull();
    });
    it("the cursor put outside the group ends the wait at the next change", async () => {
      const onAdd = vi.fn();
      render(card(
        <>
          <input data-testid="elsewhere" />
          <Late onAdd={onAdd} />
        </>,
      ));
      act(() => mode.openGroup("email"));
      screen.getByTestId("elsewhere").focus();
      fireEvent.click(screen.getByTestId("ready"));
      await wait();
      expect(onAdd).not.toHaveBeenCalled();
      expect(mode.focusKind).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId("elsewhere"));
    });
    it("the wait ends after FOCUS_WAIT_MS", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onAdd = vi.fn();
      render(card(<Late onAdd={onAdd} />));
      act(() => mode.openGroup("email"));
      await act(async () => {
        vi.advanceTimersByTime(FOCUS_WAIT_MS - 1);
      });
      expect(mode.focusKind).toBe("email");
      await act(async () => {
        vi.advanceTimersByTime(2);
      });
      expect(mode.focusKind).toBeNull();
      fireEvent.click(screen.getByTestId("ready"));
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      expect(onAdd).not.toHaveBeenCalled();
    });
    it("a control that arrives 25 s after the pick is still pressed", async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      const onAdd = vi.fn();
      render(card(<Late onAdd={onAdd} />));
      act(() => mode.openGroup("email"));
      await act(async () => {
        vi.advanceTimersByTime(25000);
      });
      fireEvent.click(screen.getByTestId("ready"));
      await act(async () => {
        vi.advanceTimersByTime(50);
      });
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
    it("the key and press listeners are removed once the wait is over", async () => {
      const added: string[] = [];
      const removed: string[] = [];
      const add = vi.spyOn(document, "addEventListener").mockImplementation(function (this: Document, t: string, ...a: unknown[]) {
        if (t === "keydown" || t === "pointerdown") added.push(t);
        return EventTarget.prototype.addEventListener.call(this, t, ...(a as [EventListenerOrEventListenerObject]));
      } as never);
      const rem = vi.spyOn(document, "removeEventListener").mockImplementation(function (this: Document, t: string, ...a: unknown[]) {
        if (t === "keydown" || t === "pointerdown") removed.push(t);
        return EventTarget.prototype.removeEventListener.call(this, t, ...(a as [EventListenerOrEventListenerObject]));
      } as never);
      try {
        render(card(<Late />));
        act(() => mode.openGroup("email"));
        expect([...new Set(added)].sort()).toEqual(["keydown", "pointerdown"]);
        expect(removed).toEqual([]);
        fireEvent.click(screen.getByTestId("ready"));
        await wait();
        expect([...new Set(removed)].sort()).toEqual(["keydown", "pointerdown"]);
      } finally {
        add.mockRestore();
        rem.mockRestore();
      }
    });
    it("a group remounted by the pick itself (under StrictMode) keeps the pick pending", async () => {
      const onAdd = vi.fn();
      function Sectioned({ children }: { children: ReactNode }) {
        const m = useCardMode();
        return m.opened.size > 0 ? <section data-testid="heading-section">{children}</section> : <>{children}</>;
      }
      function Remounted() {
        const [ready, setReady] = useState(false);
        return (
          <>
            <button data-testid="ready" onClick={() => setReady(true)}>ready</button>
            <Sectioned><Rows onAdd={onAdd} disabled={!ready} /></Sectioned>
          </>
        );
      }
      render(<StrictMode>{card(<Remounted />)}</StrictMode>);
      act(() => mode.openGroup("email"));
      expect(screen.getByTestId("heading-section")).toBeTruthy();
      expect(onAdd).not.toHaveBeenCalled();
      fireEvent.click(screen.getByTestId("ready"));
      await wait(50);
      expect(onAdd).toHaveBeenCalledTimes(1);
    });
  });

  it("a hidden group is not focused", () => {
    render(card(<CardGroup kind="email" title="Email" empty><input data-testid="first" /></CardGroup>, { canEdit: false }));
    act(() => mode.openGroup("email"));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("CardSection", () => {
  it("draws its heading and children", () => {
    render(card(<CardSection title="Relations"><span data-testid="child">c</span></CardSection>));
    const s = screen.getByTestId("card-section");
    expect(s.tagName).toBe("SECTION");
    const h2 = s.querySelector("h2")!;
    expect(h2.textContent).toBe("Relations");
    expect(s.getAttribute("aria-labelledby")).toBe(h2.id);
    expect(s.contains(screen.getByTestId("child"))).toBe(true);
  });
  it("testId overrides the default", () => {
    render(card(<CardSection title="Relations" testId="rel">x</CardSection>));
    expect(screen.getByTestId("rel")).toBeTruthy();
    expect(screen.queryByTestId("card-section")).toBeNull();
  });
  it("an empty section in presentation draws only its children, with no heading", () => {
    render(card(<CardSection title="Relations" empty><span data-testid="child">c</span></CardSection>));
    expect(screen.queryByTestId("card-section")).toBeNull();
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.getByTestId("child")).toBeTruthy();
  });
  it("in edit an empty section stays hidden, unless a kind under it is open or it has had a value in this edit", () => {
    const { rerender } = render(card(<CardSection title="Relations" empty kinds={["relation-a", "relation-b"]}>x</CardSection>));
    act(() => mode.enter());
    expect(drawn("card-section")).toBe(false);
    act(() => mode.openGroup("relation-b"));
    expect(drawn("card-section")).toBe(true);
    act(() => mode.leave());
    expect(drawn("card-section")).toBe(false);
    act(() => mode.enter());
    rerender(card(<CardSection title="Relations" kinds={["relation-a"]}>x</CardSection>));
    expect(drawn("card-section")).toBe(true);
    rerender(card(<CardSection title="Relations" empty kinds={["relation-a"]}>x</CardSection>));
    expect(drawn("card-section")).toBe(true);
    act(() => mode.leave());
    expect(drawn("card-section")).toBe(false);
  });
  it("outside a provider the heading is always drawn, empty or not", () => {
    render(<CardSection title="Relations" empty>x</CardSection>);
    expect(drawn("card-section")).toBe(true);
  });
  it("with the showAll seam on, the heading is drawn though empty", () => {
    __startCardsInEditMode(true);
    render(card(<CardSection title="Relations" empty>x</CardSection>));
    expect(drawn("card-section")).toBe(true);
  });
});
