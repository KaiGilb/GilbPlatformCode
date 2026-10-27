import { afterEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  CardModeActions,
  CardModeBar,
  CardModeHint,
  CardModeProvider,
  __startCardsInEditMode,
  useCardMode,
  type CardMode,
  type GroupInfo,
} from "./index";

afterEach(() => {
  __startCardsInEditMode(false);
  vi.useRealTimers();
  cleanup();
  document.body.innerHTML = "";
});

// A probe: renders the mode it reads and keeps the latest mode object for the test to call.
let seen: CardMode;
function Probe() {
  seen = useCardMode();
  return (
    <div data-testid="probe" data-editing={String(seen.editing)} data-presentation={String(seen.presentation)}>
      <input data-testid="field" />
      <span data-testid="opened">{[...seen.opened].join(",")}</span>
      <span data-testid="focus-kind">{seen.focusKind ?? "none"}</span>
      <span data-testid="groups">{[...seen.groups.keys()].join(",")}</span>
      <span data-testid="chooser">{String(seen.chooserOpen)}</span>
    </div>
  );
}
const editing = () => screen.getByTestId("probe").getAttribute("data-editing") === "true";
const info = (kind: string, over: Partial<GroupInfo> = {}): GroupInfo => ({ kind, label: kind.toUpperCase(), section: "S", shown: true, addable: true, ...over });
function mount(props: { canEdit?: boolean; startEditing?: boolean; rootClassName?: string } = {}) {
  return render(
    <div>
      <button data-testid="outside">outside</button>
      <CardModeProvider canEdit={props.canEdit ?? true} startEditing={props.startEditing} rootClassName={props.rootClassName}>
        <Probe />
        <button data-testid="inside">inside</button>
      </CardModeProvider>
    </div>,
  );
}

describe("outside a provider (legacy mode)", () => {
  it("is always editing, with every field of the legacy value", () => {
    render(<Probe />);
    expect(seen.managed).toBe(false);
    expect(seen.canEdit).toBe(true);
    expect(seen.presentation).toBe(false);
    expect(seen.editing).toBe(true);
    expect(seen.groups.size).toBe(0);
    expect(seen.opened.size).toBe(0);
    expect(seen.focusKind).toBeNull();
    expect(seen.showAll).toBe(true);
    expect(seen.chooserOpen).toBe(false);
  });
  it("its methods do nothing and return nothing; register returns a function that does nothing", () => {
    render(<Probe />);
    expect(seen.enter()).toBeUndefined();
    expect(seen.leave()).toBeUndefined();
    expect(seen.openGroup("email")).toBeUndefined();
    expect(seen.clearFocus()).toBeUndefined();
    expect(seen.setChooserOpen(true)).toBeUndefined();
    const undo = seen.register(info("email"));
    expect(typeof undo).toBe("function");
    expect(undo()).toBeUndefined();
    expect(seen.editing).toBe(true);
    expect(seen.groups.size).toBe(0);
    expect(seen.chooserOpen).toBe(false);
  });
  it("is the same object on every read", () => {
    render(<Probe />);
    const first = seen;
    cleanup();
    render(<Probe />);
    expect(seen).toBe(first);
  });
});

describe("CardModeProvider", () => {
  it("starts in presentation, with the root marked", () => {
    mount();
    expect(seen.managed).toBe(true);
    expect(seen.canEdit).toBe(true);
    expect(seen.presentation).toBe(true);
    expect(seen.editing).toBe(false);
    expect(seen.showAll).toBe(false);
    expect(seen.focusKind).toBeNull();
    expect(seen.opened.size).toBe(0);
    expect(seen.groups.size).toBe(0);
    expect(seen.chooserOpen).toBe(false);
    const root = screen.getByTestId("card-mode-root");
    expect(root.getAttribute("data-card-mode")).toBe("presentation");
    expect(root.hasAttribute("class")).toBe(false);
  });
  it("rootClassName is the root's class", () => {
    mount({ rootClassName: "contents" });
    expect(screen.getByTestId("card-mode-root").className).toBe("contents");
  });
  it("enter turns edit on, leave turns it off", () => {
    mount();
    act(() => seen.enter());
    expect(editing()).toBe(true);
    expect(seen.presentation).toBe(false);
    expect(screen.getByTestId("card-mode-root").getAttribute("data-card-mode")).toBe("edit");
    act(() => seen.leave());
    expect(editing()).toBe(false);
    expect(screen.getByTestId("card-mode-root").getAttribute("data-card-mode")).toBe("presentation");
  });
  it("startEditing starts in edit", () => {
    mount({ startEditing: true });
    expect(editing()).toBe(true);
  });
  it("canEdit false never edits: not at start, not on enter, not on openGroup", () => {
    mount({ canEdit: false, startEditing: true });
    expect(editing()).toBe(false);
    expect(seen.canEdit).toBe(false);
    act(() => seen.enter());
    expect(editing()).toBe(false);
    act(() => seen.openGroup("email"));
    expect(editing()).toBe(false);
    expect(screen.getByTestId("opened").textContent).toBe("");
    expect(screen.getByTestId("focus-kind").textContent).toBe("none");
  });
  it("a card that stops being writable while open goes back to presentation", () => {
    const { rerender } = render(
      <CardModeProvider canEdit>
        <Probe />
      </CardModeProvider>,
    );
    act(() => seen.enter());
    expect(editing()).toBe(true);
    rerender(
      <CardModeProvider canEdit={false}>
        <Probe />
      </CardModeProvider>,
    );
    expect(editing()).toBe(false);
  });

  it("openGroup turns edit on and sets opened and focusKind; clearFocus clears only the focus; leave clears both", () => {
    mount();
    act(() => seen.openGroup("email"));
    expect(editing()).toBe(true);
    expect(screen.getByTestId("opened").textContent).toBe("email");
    expect(screen.getByTestId("focus-kind").textContent).toBe("email");
    act(() => seen.openGroup("phone"));
    expect(screen.getByTestId("opened").textContent).toBe("email,phone");
    expect(screen.getByTestId("focus-kind").textContent).toBe("phone");
    act(() => seen.clearFocus());
    expect(screen.getByTestId("focus-kind").textContent).toBe("none");
    expect(screen.getByTestId("opened").textContent).toBe("email,phone");
    act(() => seen.leave());
    expect(screen.getByTestId("opened").textContent).toBe("");
    expect(screen.getByTestId("focus-kind").textContent).toBe("none");
  });

  it("chooserOpen and setChooserOpen", () => {
    mount();
    expect(seen.chooserOpen).toBe(false);
    act(() => seen.setChooserOpen(true));
    expect(screen.getByTestId("chooser").textContent).toBe("true");
    expect(editing()).toBe(false);
    act(() => seen.setChooserOpen(false));
    expect(screen.getByTestId("chooser").textContent).toBe("false");
  });

  it("register adds a group and the returned function removes it", () => {
    mount();
    let undo = () => {};
    act(() => {
      undo = seen.register(info("email"));
    });
    expect(screen.getByTestId("groups").textContent).toBe("email");
    expect(seen.groups.get("email")).toEqual({ kind: "email", label: "EMAIL", section: "S", shown: true, addable: true });
    act(() => {
      seen.register(info("phone"));
    });
    expect(screen.getByTestId("groups").textContent).toBe("email,phone");
    act(() => undo());
    expect(screen.getByTestId("groups").textContent).toBe("phone");
  });
  it("registering the same info again keeps the same map; changed info replaces the entry; removing a missing kind keeps the map", () => {
    mount();
    let undo = () => {};
    act(() => {
      undo = seen.register(info("email"));
    });
    const before = seen.groups;
    act(() => {
      seen.register(info("email"));
    });
    expect(seen.groups).toBe(before);
    act(() => {
      seen.register(info("email", { shown: false }));
    });
    expect(seen.groups).not.toBe(before);
    expect(seen.groups.get("email")?.shown).toBe(false);
    act(() => undo());
    const afterFirstUndo = seen.groups;
    expect(afterFirstUndo.size).toBe(0);
    act(() => undo());
    expect(seen.groups).toBe(afterFirstUndo);
  });
  it("a change of label, section or addable also replaces the entry", () => {
    mount();
    act(() => {
      seen.register(info("email"));
    });
    for (const over of [{ label: "Mail" }, { section: "Other" }, { addable: false }]) {
      const before = seen.groups;
      act(() => {
        seen.register(info("email", over));
      });
      expect(seen.groups).not.toBe(before);
      expect(seen.groups.get("email")).toMatchObject(over);
    }
  });
});

describe("leaving edit mode", () => {
  it("a click outside the card leaves; a click inside does not", () => {
    mount();
    act(() => seen.enter());
    fireEvent.click(screen.getByTestId("inside"));
    expect(editing()).toBe(true);
    fireEvent.click(screen.getByTestId("outside"));
    expect(editing()).toBe(false);
  });
  it("a click outside also clears the groups opened in this edit", () => {
    mount();
    act(() => seen.openGroup("email"));
    fireEvent.click(screen.getByTestId("outside"));
    expect(screen.getByTestId("opened").textContent).toBe("");
  });
  it("a click inside an element matching the keep-edit selector does not leave", () => {
    mount();
    for (const html of [`<div role="dialog"><button id="t">x</button></div>`, `<div aria-modal="true"><button id="t">x</button></div>`, `<div data-card-keep-edit><button id="t">x</button></div>`]) {
      act(() => seen.enter());
      const host = document.createElement("div");
      host.innerHTML = html;
      document.body.appendChild(host);
      const t = host.querySelector("#t")!;
      fireEvent.click(t);
      expect(editing(), html).toBe(true);
      host.remove();
    }
  });
  it("while a modal dialog is open anywhere, a click outside does not leave", () => {
    mount();
    act(() => seen.enter());
    const dlg = document.createElement("div");
    dlg.setAttribute("aria-modal", "true");
    document.body.appendChild(dlg);
    fireEvent.click(screen.getByTestId("outside"));
    expect(editing()).toBe(true);
    dlg.remove();
    fireEvent.click(screen.getByTestId("outside"));
    expect(editing()).toBe(false);
  });
  it("a click outside while in presentation changes nothing", () => {
    mount();
    fireEvent.click(screen.getByTestId("outside"));
    expect(editing()).toBe(false);
  });

  it("Escape in edit leaves, and blurs the focused field first", () => {
    mount();
    act(() => seen.enter());
    const field = screen.getByTestId("field");
    field.focus();
    expect(document.activeElement).toBe(field);
    fireEvent.keyDown(field, { key: "Escape" });
    expect(editing()).toBe(false);
    expect(document.activeElement).not.toBe(field);
  });
  it("Escape does nothing in presentation, for another key, when something handled it, or inside a keep-edit element", () => {
    mount();
    fireEvent.keyDown(screen.getByTestId("field"), { key: "Escape" });
    expect(editing()).toBe(false);
    act(() => seen.enter());
    fireEvent.keyDown(screen.getByTestId("field"), { key: "Enter" });
    expect(editing()).toBe(true);
    cleanup();

    render(
      <CardModeProvider canEdit startEditing>
        <Probe />
        <div onKeyDown={(e) => e.preventDefault()}>
          <input data-testid="handled" />
        </div>
        <div role="dialog">
          <input data-testid="in-dialog" />
        </div>
        <div data-card-keep-edit>
          <input data-testid="in-keep" />
        </div>
      </CardModeProvider>,
    );
    expect(editing()).toBe(true);
    fireEvent.keyDown(screen.getByTestId("handled"), { key: "Escape" });
    expect(editing()).toBe(true);
    fireEvent.keyDown(screen.getByTestId("in-dialog"), { key: "Escape" });
    expect(editing()).toBe(true);
    fireEvent.keyDown(screen.getByTestId("in-keep"), { key: "Escape" });
    expect(editing()).toBe(true);
    fireEvent.keyDown(screen.getByTestId("field"), { key: "Escape" });
    expect(editing()).toBe(false);
  });

  it("a blur to somewhere outside the card leaves, after a zero-delay timer", () => {
    vi.useFakeTimers();
    mount();
    act(() => seen.enter());
    fireEvent.blur(screen.getByTestId("field"), { relatedTarget: screen.getByTestId("outside") });
    expect(editing()).toBe(true);
    act(() => {
      vi.advanceTimersByTime(0);
    });
    expect(editing()).toBe(false);
  });
  it("a blur to nothing, to inside the card, or to a keep-edit element does not leave", () => {
    vi.useFakeTimers();
    render(
      <div>
        <CardModeProvider canEdit startEditing>
          <Probe />
          <button data-testid="inside">inside</button>
        </CardModeProvider>
        <div data-card-keep-edit>
          <button data-testid="keep">keep</button>
        </div>
      </div>,
    );
    for (const related of [null, screen.getByTestId("inside"), screen.getByTestId("keep")]) {
      fireEvent.blur(screen.getByTestId("field"), { relatedTarget: related });
      act(() => {
        vi.runAllTimers();
      });
      expect(editing()).toBe(true);
    }
  });
  it("a blur in presentation does nothing", () => {
    vi.useFakeTimers();
    mount();
    fireEvent.blur(screen.getByTestId("field"), { relatedTarget: screen.getByTestId("outside") });
    act(() => {
      vi.runAllTimers();
    });
    expect(editing()).toBe(false);
  });
});

describe("__startCardsInEditMode", () => {
  it("a new provider starts editing, shows all groups, and cannot be left", () => {
    __startCardsInEditMode(true);
    mount();
    expect(editing()).toBe(true);
    expect(seen.showAll).toBe(true);
    act(() => seen.leave());
    expect(editing()).toBe(true);
    fireEvent.click(screen.getByTestId("outside"));
    expect(editing()).toBe(true);
    fireEvent.keyDown(screen.getByTestId("field"), { key: "Escape" });
    expect(editing()).toBe(true);
  });
  it("a card that cannot be written still does not edit", () => {
    __startCardsInEditMode(true);
    mount({ canEdit: false });
    expect(editing()).toBe(false);
  });
  it("turning it off lets a new provider start in presentation again", () => {
    __startCardsInEditMode(true);
    __startCardsInEditMode(false);
    mount();
    expect(editing()).toBe(false);
    expect(seen.showAll).toBe(false);
  });
});

describe("CardModeActions", () => {
  it("draws nothing outside a provider, or when the card cannot be written", () => {
    const { container } = render(<CardModeActions />);
    expect(container.innerHTML).toBe("");
    cleanup();
    const r = render(
      <CardModeProvider canEdit={false}>
        <CardModeActions />
      </CardModeProvider>,
    );
    expect(r.container.querySelector("button")).toBeNull();
  });
  it("in presentation: an Edit button (not pressed) and the add button", () => {
    render(
      <CardModeProvider canEdit>
        <CardModeActions />
      </CardModeProvider>,
    );
    const edit = screen.getByTestId("card-edit");
    expect(edit.textContent).toBe("Edit");
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    expect(edit.getAttribute("aria-label")).toBe("Edit this card");
    expect(edit.getAttribute("title")).toBe("Edit");
    expect(edit.getAttribute("type")).toBe("button");
    expect(edit.className).toContain("italic");
    expect(screen.queryByTestId("card-done")).toBeNull();
    const add = screen.getByTestId("card-add-info");
    expect(add.textContent).toBe("+");
    expect(add.getAttribute("aria-label")).toBe("Add information");
    expect(add.getAttribute("aria-haspopup")).toBe("dialog");
    expect(add.className).toContain("min-w-10");
  });
  it("Edit enters; the button becomes Done (pressed); Done leaves", () => {
    render(
      <CardModeProvider canEdit>
        <Probe />
        <CardModeActions />
      </CardModeProvider>,
    );
    fireEvent.click(screen.getByTestId("card-edit"));
    expect(editing()).toBe(true);
    const done = screen.getByTestId("card-done");
    expect(done.textContent).toBe("Done");
    expect(done.getAttribute("aria-pressed")).toBe("true");
    expect(done.getAttribute("aria-label")).toBe("Done editing this card");
    expect(done.getAttribute("title")).toBe("Done");
    expect(screen.queryByTestId("card-edit")).toBeNull();
    fireEvent.click(done);
    expect(editing()).toBe(false);
    expect(screen.getByTestId("card-edit")).toBeTruthy();
  });
  it("the add button opens the chooser and does not enter edit", () => {
    render(
      <CardModeProvider canEdit>
        <Probe />
        <CardModeActions />
      </CardModeProvider>,
    );
    fireEvent.click(screen.getByTestId("card-add-info"));
    expect(screen.getByTestId("chooser").textContent).toBe("true");
    expect(editing()).toBe(false);
  });
  it("add={false} leaves the add button out", () => {
    render(
      <CardModeProvider canEdit>
        <CardModeActions add={false} />
      </CardModeProvider>,
    );
    expect(screen.getByTestId("card-edit")).toBeTruthy();
    expect(screen.queryByTestId("card-add-info")).toBeNull();
  });
  it("compact draws an icon (a pencil, then a tick) instead of words, and a 40 px-wide add button", () => {
    render(
      <CardModeProvider canEdit>
        <Probe />
        <CardModeActions compact />
      </CardModeProvider>,
    );
    const edit = screen.getByTestId("card-edit");
    expect(edit.textContent).toBe("");
    expect(edit.className).toContain("w-10");
    expect(edit.className).not.toContain("italic");
    expect(edit.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(edit.querySelector("path")?.getAttribute("d")).toBe("M4 20h4l10.5-10.5a2.1 2.1 0 0 0-3-3L5 17v3zM13.5 7.5l3 3");
    expect(screen.getByTestId("card-add-info").className).toContain(" w-10 ");
    fireEvent.click(edit);
    const done = screen.getByTestId("card-done");
    expect(done.textContent).toBe("");
    expect(done.querySelector("path")?.getAttribute("d")).toBe("M5 12.5l4.5 4.5L19 7.5");
    expect(done.getAttribute("aria-label")).toBe("Done editing this card");
  });
  it("the buttons carry a focus-visible outline in --accent", () => {
    render(
      <CardModeProvider canEdit>
        <CardModeActions />
      </CardModeProvider>,
    );
    expect(screen.getByTestId("card-edit").className).toContain("focus-visible:outline-[var(--accent)]");
    expect(screen.getByTestId("card-add-info").className).toContain("focus-visible:outline-[var(--accent)]");
  });
});

describe("CardModeHint", () => {
  it("is drawn in edit only, for a card that can be written", () => {
    expect(render(<CardModeHint />).container.innerHTML).toBe("");
    cleanup();
    render(
      <CardModeProvider canEdit>
        <Probe />
        <CardModeHint />
      </CardModeProvider>,
    );
    expect(screen.queryByTestId("card-mode-hint")).toBeNull();
    act(() => seen.enter());
    const hint = screen.getByTestId("card-mode-hint");
    expect(hint.tagName).toBe("P");
    expect(hint.textContent).toBe("Editing. Changes save as you leave a field.");
    cleanup();
    render(
      <CardModeProvider canEdit={false} startEditing>
        <CardModeHint />
      </CardModeProvider>,
    );
    expect(screen.queryByTestId("card-mode-hint")).toBeNull();
  });
});

describe("CardModeBar", () => {
  it("draws nothing outside a provider or when the card cannot be written", () => {
    expect(render(<CardModeBar />).container.innerHTML).toBe("");
    cleanup();
    const r = render(
      <CardModeProvider canEdit={false}>
        <CardModeBar />
      </CardModeProvider>,
    );
    expect(r.queryByTestId("card-mode-bar")).toBeNull();
  });
  it("holds the actions, and the hint while editing", () => {
    render(
      <CardModeProvider canEdit>
        <CardModeBar />
      </CardModeProvider>,
    );
    const bar = screen.getByTestId("card-mode-bar");
    expect(bar.contains(screen.getByTestId("card-edit"))).toBe(true);
    expect(bar.contains(screen.getByTestId("card-add-info"))).toBe(true);
    expect(screen.queryByTestId("card-mode-hint")).toBeNull();
    fireEvent.click(screen.getByTestId("card-edit"));
    expect(bar.contains(screen.getByTestId("card-mode-hint"))).toBe(true);
    expect(bar.contains(screen.getByTestId("card-done"))).toBe(true);
  });
});
