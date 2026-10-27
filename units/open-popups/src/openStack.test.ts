import { afterEach, describe, expect, it, vi } from "vitest";
import { FOCUSABLE_SELECTOR, registerOpen, tabInside, topOpen, type OpenEntry } from "./index";

const undo: Array<() => void> = [];
function open(entry: OpenEntry): () => void {
  const off = registerOpen(entry);
  undo.push(off);
  return off;
}
function entry(extra: Partial<OpenEntry> = {}): OpenEntry {
  return { el: () => null, close: vi.fn(), ...extra };
}

afterEach(() => {
  while (undo.length) undo.pop()!();
  document.body.innerHTML = "";
});

describe("registerOpen / topOpen", () => {
  it("topOpen is null when nothing is open", () => {
    expect(topOpen()).toBeNull();
  });
  it("pushes, and the newest is on top", () => {
    const a = entry();
    const b = entry();
    open(a);
    expect(topOpen()).toBe(a);
    open(b);
    expect(topOpen()).toBe(b);
  });
  it("the returned function removes the entry; the one below is on top again", () => {
    const a = entry();
    const b = entry();
    open(a);
    const offB = open(b);
    offB();
    expect(topOpen()).toBe(a);
  });
  it("removing an entry that is not on top leaves the top alone", () => {
    const a = entry();
    const b = entry();
    const offA = open(a);
    open(b);
    offA();
    expect(topOpen()).toBe(b);
  });
  it("removing twice is harmless", () => {
    const a = entry();
    const b = entry();
    open(a);
    const offB = open(b);
    offB();
    offB();
    expect(topOpen()).toBe(a);
  });
  it("removing twice does not remove a different entry registered meanwhile", () => {
    const a = entry();
    const offA = open(a);
    offA();
    const b = entry();
    open(b);
    offA();
    expect(topOpen()).toBe(b);
  });
});

describe("exclusive entries", () => {
  it("opening an exclusive entry calls dismiss on the other exclusive entries", () => {
    const dismiss = vi.fn();
    const first = entry({ exclusive: true, dismiss });
    open(first);
    const second = entry({ exclusive: true });
    open(second);
    expect(dismiss).toHaveBeenCalledTimes(1);
    expect(first.close).not.toHaveBeenCalled();
  });
  it("calls close when the other exclusive entry has no dismiss", () => {
    const first = entry({ exclusive: true });
    open(first);
    open(entry({ exclusive: true }));
    expect(first.close).toHaveBeenCalledTimes(1);
  });
  it("does not call a non-exclusive entry", () => {
    const plain = entry({ dismiss: vi.fn() });
    open(plain);
    open(entry({ exclusive: true }));
    expect(plain.close).not.toHaveBeenCalled();
    expect(plain.dismiss).not.toHaveBeenCalled();
  });
  it("does not call itself", () => {
    const self = entry({ exclusive: true, dismiss: vi.fn() });
    open(self);
    expect(self.close).not.toHaveBeenCalled();
    expect(self.dismiss).not.toHaveBeenCalled();
  });
  it("opening a non-exclusive entry calls nobody", () => {
    const other = entry({ exclusive: true, dismiss: vi.fn() });
    open(other);
    open(entry());
    expect(other.dismiss).not.toHaveBeenCalled();
    expect(other.close).not.toHaveBeenCalled();
  });
  it("the entry the call closed stays registered until its own remover runs", () => {
    const first = entry({ exclusive: true });
    open(first);
    const second = entry({ exclusive: true });
    open(second);
    expect(topOpen()).toBe(second);
  });
});

function fixture(html: string): HTMLElement {
  const el = document.createElement("div");
  el.tabIndex = -1;
  el.innerHTML = html;
  document.body.appendChild(el);
  return el;
}
function key(shiftKey: boolean) {
  return { shiftKey, preventDefault: vi.fn() };
}

describe("tabInside", () => {
  it("names the focusable selector", () => {
    expect(FOCUSABLE_SELECTOR).toContain("button:not(:disabled)");
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
  it("Tab from the last wraps to the first", () => {
    const el = fixture(`<button id="a"></button><button id="b"></button><button id="c"></button>`);
    const e = key(false);
    el.querySelector<HTMLElement>("#c")!.focus();
    tabInside(e, el);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("a");
  });
  it("Shift+Tab from the first wraps to the last", () => {
    const el = fixture(`<button id="a"></button><button id="b"></button><button id="c"></button>`);
    const e = key(true);
    el.querySelector<HTMLElement>("#a")!.focus();
    tabInside(e, el);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("c");
  });
  it("Tab from the middle is left to the browser", () => {
    const el = fixture(`<button id="a"></button><button id="b"></button><button id="c"></button>`);
    const e = key(false);
    el.querySelector<HTMLElement>("#b")!.focus();
    tabInside(e, el);
    expect(e.preventDefault).not.toHaveBeenCalled();
    expect(document.activeElement?.id).toBe("b");
  });
  it("Shift+Tab from the middle is left to the browser", () => {
    const el = fixture(`<button id="a"></button><button id="b"></button><button id="c"></button>`);
    const e = key(true);
    el.querySelector<HTMLElement>("#b")!.focus();
    tabInside(e, el);
    expect(e.preventDefault).not.toHaveBeenCalled();
  });
  it("focus outside goes into the first on Tab, and into the last on Shift+Tab", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    const el = fixture(`<button id="a"></button><button id="b"></button>`);
    outside.focus();
    const e1 = key(false);
    tabInside(e1, el);
    expect(e1.preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("a");
    outside.focus();
    const e2 = key(true);
    tabInside(e2, el);
    expect(e2.preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement?.id).toBe("b");
  });
  it("focus on the container itself goes to the first on Tab and to the last on Shift+Tab", () => {
    const el = fixture(`<button id="a"></button><button id="b"></button>`);
    el.focus();
    expect(document.activeElement).toBe(el);
    tabInside(key(false), el);
    expect(document.activeElement?.id).toBe("a");
    el.focus();
    tabInside(key(true), el);
    expect(document.activeElement?.id).toBe("b");
  });
  it("with no focusable child it calls preventDefault and focuses the element", () => {
    const el = fixture(`<span>nothing here</span>`);
    const e = key(false);
    tabInside(e, el);
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(el);
  });
  it("skips disabled buttons and tabindex=-1", () => {
    const el = fixture(
      `<button id="skip1" disabled></button><button id="a"></button><span id="skip2" tabindex="-1"></span><button id="b"></button><button id="skip3" disabled></button>`,
    );
    const e = key(false);
    el.querySelector<HTMLElement>("#b")!.focus();
    tabInside(e, el);
    expect(document.activeElement?.id).toBe("a");
    const e2 = key(true);
    tabInside(e2, el);
    expect(document.activeElement?.id).toBe("b");
  });
  it("counts links with href, inputs, selects, textareas and tabindex=0", () => {
    const el = fixture(`<a id="l" href="#x">l</a><input id="i" /><select id="s"></select><textarea id="t"></textarea><div id="d" tabindex="0"></div><a id="nohref">n</a>`);
    el.querySelector<HTMLElement>("#d")!.focus();
    tabInside(key(false), el);
    expect(document.activeElement?.id).toBe("l");
  });
});
