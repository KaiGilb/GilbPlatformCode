// Adopted from Agent.Tester round 2 (report AgentTester-AppUnit-1c1c469.md, 2026-10-18); Q19, which
// compares with GilbApp's 0f0f1b7 source, stays in the QA copy.
// Agent.Tester round 2 probes (1c1c469). Scratch copy only.
// Spec: handoff 00.Handoff-2026-10-18-ToAgentCoder-SectionMenuAsDefaultSharedUnitAppAndWeb-GilbPlatformCode §2 + Outcome.
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StrictMode, createRef, useState } from "react";
import { SectionMenu, type SectionMenuHandle, type SectionMenuProps } from "./SectionMenu";
import { forYouFor, menuCommands, menuOptionsOf, placesFor, visibleSections, type MenuOption, type MenuSection } from "./menuList";
import { createIntentChannel, type Intent } from "./intent";

type Id = "home" | "notes" | "files";
interface Api { go(id: Id): void; newNote(): void; upload(): void; signOut(): void }
interface G { admin: boolean }
const SECTIONS: MenuSection<Id, Api, G>[] = [
  { id: "home", icon: "home", label: "Home", description: "Start here.", go: (a) => a.go("home"),
    options: [{ id: "home.tour", icon: "help", label: "Take the tour", description: "Two minutes.", run: (a) => a.go("home") }] },
  { id: "notes", icon: "records", label: "Notes", description: "Your notes.", go: (a) => a.go("notes"),
    options: [
      { id: "notes.new", icon: "plus", label: "New note", description: "A blank note.", run: (a) => a.newNote() },
      { id: "notes.admin", icon: "admin", label: "Admin", description: "Managers.", show: (g) => g.admin, run: (a) => a.newNote() },
      { id: "notes.soon", icon: "news", label: "Soon", description: "Later.", coming: true, href: "https://example.test/soon" },
    ], also: ["news"] },
  { id: "files", icon: "files", label: "Files", description: "Documents.", go: (a) => a.go("files"),
    options: [{ id: "files.upload", icon: "upload", label: "Upload a file", description: "Into this vault.", run: (a) => a.upload() }] },
];
const PLACES: MenuOption<Api, G>[] = [{ id: "news", icon: "news", label: "News", description: "What's new.", href: "https://example.test/news" }];
const fakeApi = () => ({ go: vi.fn(), newNote: vi.fn(), upload: vi.fn(), signOut: vi.fn() });

function props(over: Partial<SectionMenuProps<Id, Api, never, G>> = {}): SectionMenuProps<Id, Api, never, G> {
  return {
    sections: SECTIONS, current: "notes", api: fakeApi(), sizeClass: "expanded",
    places: (s) => placesFor(s, PLACES), layers: { scrim: 100, panel: 101 },
    footerAction: { label: "Sign out", icon: "signout", run: (a) => a.signOut() }, ...over,
  } as SectionMenuProps<Id, Api, never, G>;
}
const panel = () => screen.getByTestId("section-menu-panel");
const trigger = () => screen.getByTestId("section-menu-trigger");
const isOpen = () => panel().getAttribute("data-open") === "true";
const option = (id: string) => panel().querySelector<HTMLElement>(`[data-option="${id}"]`);
const frame = () => act(() => new Promise<void>((r) => requestAnimationFrame(() => r())));

if (typeof window.PointerEvent === "undefined") {
  class P extends MouseEvent { pointerType: string; constructor(t: string, i: PointerEventInit = {}) { super(t, i); this.pointerType = i.pointerType ?? ""; } }
  (window as unknown as { PointerEvent: unknown }).PointerEvent = P;
}
let hoverable = false;
beforeEach(() => {
  hoverable = false;
  window.matchMedia = ((q: string) => ({ matches: hoverable && q.includes("hover: hover"), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

describe("round 2 — SectionMenu", () => {
  test("Q1 no sections: nothing drawn; sections arriving later draw a working menu", async () => {
    const view = render(<SectionMenu {...props({ sections: [] })} />);
    expect(view.container.innerHTML).toBe("");
    view.rerender(<SectionMenu {...props()} />);
    await userEvent.click(trigger());
    expect(isOpen()).toBe(true);
  });

  test("Q2a gate prop given: gated option follows it", async () => {
    render(<SectionMenu {...props({ gate: { admin: true } })} />);
    await userEvent.click(trigger());
    expect(option("notes.admin")).toBeTruthy();
  });

  test("Q2b gate prop omitted: gated option left out", async () => {
    render(<SectionMenu {...props()} />);
    await userEvent.click(trigger());
    expect(option("notes.admin")).toBeNull();
  });

  // A host whose gate is not loaded yet writes gate={maybeGate}: JSX passes the key with undefined.
  test("Q2c gate={undefined} (key present, value undefined) does not crash the header", () => {
    expect(() => render(<SectionMenu {...props({ gate: undefined })} />)).not.toThrow();
  });

  test("Q3 menuOptionsOf / placesFor with an explicit undefined gate do not throw", () => {
    expect(() => menuOptionsOf(SECTIONS[1]!, undefined)).not.toThrow();
    expect(() => placesFor({ also: ["p"] }, [{ id: "p", show: (g: G) => g.admin }], undefined)).not.toThrow();
  });

  test("Q4 coming + href: a button, aria-disabled, skipped by Tab, click keeps the menu open", async () => {
    render(<SectionMenu {...props()} />);
    await userEvent.click(trigger());
    await frame();
    const soon = option("notes.soon")!;
    expect(soon.tagName).toBe("BUTTON");
    expect(soon.getAttribute("aria-disabled")).toBe("true");
    await userEvent.click(soon);
    expect(isOpen()).toBe(true);
    const seen: string[] = [];
    for (let i = 0; i < 10; i++) { await userEvent.tab(); seen.push(document.activeElement?.getAttribute("data-option") ?? ""); }
    expect(seen).not.toContain("notes.soon");
  });

  test("Q5 footerHint wins over labels.hint; compact draws no hint", () => {
    const v = render(<SectionMenu {...props({ footerHint: "MINE", labels: { hint: () => "LABEL" } })} />);
    expect(panel().textContent).toContain("MINE");
    expect(panel().textContent).not.toContain("LABEL");
    v.unmount();
    render(<SectionMenu {...props({ sizeClass: "compact" })} />);
    expect(panel().textContent).not.toContain("Press");
  });

  test("Q6 under StrictMode: opens, Esc closes once, focus back on the button, Tab still trapped", async () => {
    render(<StrictMode><SectionMenu {...props()} /></StrictMode>);
    await userEvent.click(trigger());
    await frame();
    expect(document.activeElement?.getAttribute("data-section")).toBe("notes");
    await userEvent.tab();
    expect(panel().contains(document.activeElement)).toBe(true);
    await userEvent.keyboard("{Escape}");
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  test("Q7 touch/pen pointer enter does not open; mouse with fine hover does", () => {
    hoverable = true;
    render(<SectionMenu {...props()} />);
    fireEvent.pointerEnter(trigger(), { pointerType: "touch" });
    expect(isOpen()).toBe(false);
    fireEvent.pointerEnter(trigger(), { pointerType: "mouse" });
    expect(isOpen()).toBe(true);
  });

  test("Q8 the previewed section vanishing while open does not crash; preview falls back to current", async () => {
    const view = render(<SectionMenu {...props()} />);
    await userEvent.click(trigger());
    await frame();
    await userEvent.keyboard("{ArrowDown}"); // files previewed
    expect(option("files.upload")).toBeTruthy();
    view.rerender(<SectionMenu {...props({ sections: SECTIONS.filter((s) => s.id !== "files") as never })} />);
    expect(option("notes.new")).toBeTruthy();
  });

  test("Q9 ref.openAt previews the given section; ref.close returns focus", async () => {
    const ref = createRef<SectionMenuHandle<Id>>();
    render(<SectionMenu {...props({ ref })} />);
    act(() => ref.current!.openAt("files"));
    expect(isOpen()).toBe(true);
    expect(option("files.upload")).toBeTruthy();
    act(() => ref.current!.close());
    expect(isOpen()).toBe(false);
    expect(document.activeElement).toBe(trigger());
  });

  test("Q10 onChoose after close and before the act; api undefined only closes", async () => {
    const order: string[] = [];
    const api = { go: vi.fn(), newNote: vi.fn(() => order.push("run:" + String(isOpen()))), upload: vi.fn(), signOut: vi.fn() };
    const v = render(<SectionMenu {...props({ api, onChoose: (t) => order.push("choose:" + t) })} />);
    await userEvent.click(trigger());
    await userEvent.click(option("notes.new")!);
    // Probe corrected: the act runs in the same handler as close(), before React commits data-open.
    // Order is what the JSDoc promises (close called, then onChoose, then the act); focus is already back.
    expect(order).toEqual(["choose:notes", "run:true"]);
    v.unmount();
    render(<SectionMenu {...props({ api: undefined })} />);
    await userEvent.click(trigger());
    await userEvent.click(option("notes.new")!);
    expect(isOpen()).toBe(false);
  });

  test("Q11 unknown current reads as the first section (button label and You are here)", () => {
    render(<SectionMenu {...props({ current: "nope" as Id })} />);
    expect(trigger().getAttribute("aria-label")).toContain("Home");
    expect(panel().querySelector("[data-current='true']")?.getAttribute("data-section")).toBe("home");
  });

  test("Q12 Esc while closed is not swallowed by the menu", () => {
    render(<SectionMenu {...props()} />);
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});

describe("round 2 — menuList", () => {
  test("Q13 menuCommands: gated option, place, forYou, extra all follow the gate; command-only still listed", () => {
    const list = {
      sections: [{ ...SECTIONS[1]!, options: [...SECTIONS[1]!.options, { id: "notes.cmd", icon: "card" as const, label: "C", description: "", commandOnly: true }] }],
      places: [{ id: "p", icon: "news" as const, label: "P", description: "", show: (g: G) => g.admin }],
      forYou: [{ id: "f", icon: "news" as const, label: "F", description: "", show: (g: G) => g.admin }],
      extraCommands: [{ id: "x", icon: "news" as const, label: "X", description: "", section: null, show: (g: G) => g.admin }],
    };
    expect(menuCommands(list, { admin: false }, null).map((c) => c.id)).toEqual(["go.notes", "notes.new", "notes.soon", "notes.cmd"]);
    expect(menuCommands(list, { admin: true }, null).map((c) => c.id)).toEqual(["go.notes", "notes.new", "notes.admin", "notes.soon", "notes.cmd", "p", "f", "x"]);
  });

  test("Q14 menu and palette agree on a section's visible options for the same gate", () => {
    for (const admin of [false, true]) {
      const menu = menuOptionsOf(SECTIONS[1]!, { admin }).map((o) => o.id);
      const pal = menuCommands({ sections: [SECTIONS[1]!] }, { admin }, null).filter((c) => c.section === "notes" && !c.id.startsWith("go.")).map((c) => c.id);
      expect(pal).toEqual(menu);
    }
  });

  test("Q15 visibleSections / forYouFor keep entries without show", () => {
    expect(visibleSections(SECTIONS, { admin: false }).length).toBe(3);
    expect(forYouFor([{ id: "a" }, { id: "b", show: () => false }], {}).map((o) => o.id)).toEqual(["a"]);
  });
});

describe("round 2 — intent channel", () => {
  type I = Intent<"create", "home" | "notes">;
  const channel = createIntentChannel<I>();
  // A host that posts one constant intent object (a natural way to write a fixed act).
  const CREATE: I = { kind: "create", place: "any" };
  function Dest({ a }: { a: () => void }) { channel.useIntent("create", a); return <p>dest</p>; }
  function Host({ a, strict, fresh }: { a: () => void; strict?: boolean; fresh?: boolean }) {
    const [pending, setPending] = useState<I | null>(null);
    const body = (
      <channel.Context.Provider value={{ intent: pending, place: "notes", consume: () => setPending(null) }}>
        <button onClick={() => setPending(fresh ? { ...CREATE } : CREATE)}>post</button>
        <Dest a={a} />
      </channel.Context.Provider>
    );
    return strict ? <StrictMode>{body}</StrictMode> : body;
  }

  test("Q16 destination already mounted: two posts of fresh intents act twice", async () => {
    const a = vi.fn();
    render(<Host a={a} fresh />);
    await userEvent.click(screen.getByText("post"));
    await userEvent.click(screen.getByText("post"));
    expect(a).toHaveBeenCalledTimes(2);
  });

  test("Q17 destination already mounted: two posts of the SAME intent object act twice", async () => {
    const a = vi.fn();
    render(<Host a={a} />);
    await userEvent.click(screen.getByText("post"));
    await userEvent.click(screen.getByText("post"));
    expect(a).toHaveBeenCalledTimes(2);
  });

  // Fixed after round 2 (D9): the repeat acts at once, nothing stays pending, and a later mount does not act.
  test("Q17b the same intent posted again acts at once and does not linger for a later mount", async () => {
    const a = vi.fn();
    function H2() {
      const [pending, setPending] = useState<I | null>(null);
      const [shown, setShown] = useState(true);
      return (
        <channel.Context.Provider value={{ intent: pending, place: "notes", consume: () => setPending(null) }}>
          <button onClick={() => setPending(CREATE)}>post</button>
          <button onClick={() => setShown((x) => !x)}>toggle</button>
          <p data-testid="pending">{pending ? "pending" : "none"}</p>
          {shown && <Dest a={a} />}
        </channel.Context.Provider>
      );
    }
    render(<H2 />);
    await userEvent.click(screen.getByText("post"));
    await userEvent.click(screen.getByText("post"));
    expect(a).toHaveBeenCalledTimes(2);
    expect(screen.getByTestId("pending").textContent).toBe("none");
    await userEvent.click(screen.getByText("toggle"));
    await userEvent.click(screen.getByText("toggle"));
    expect(a).toHaveBeenCalledTimes(2);
  });

  test("Q18 under StrictMode, destination already mounted: one post acts once", async () => {
    const a = vi.fn();
    render(<Host a={a} strict fresh />);
    await userEvent.click(screen.getByText("post"));
    expect(a).toHaveBeenCalledTimes(1);
  });

});
