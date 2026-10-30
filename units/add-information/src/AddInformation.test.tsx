// Ported from the source's two AddInformation test files (11 cases: `AddInformation.history.s12` 5, `AddInformation.s10iter1drawer` 6), then new
// cases. The source drew the app's own `CardGroup`; here a small stand-in group registers itself with the card mode the way `CardGroup` does
// (`mode.register({ kind, label, section, shown, addable })`), because what the chooser reads is that registration and nothing else. The
// phone drawer is the real unit `drawer`. `history.back()` is a fake that pops the entry and fires `popstate` at once, as the browser does a
// moment later, and the timers are fake: nothing waits on the clock.
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useEffect } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CardModeActions, CardModeProvider, useCardMode } from "@kaigilb/gilbplatformcode-card-mode";
import { Overlay } from "@kaigilb/gilbplatformcode-drawer";
import { openPortalRoots } from "@kaigilb/gilbplatformcode-open-popups";
import { __resetSheetHistory } from "@kaigilb/gilbplatformcode-sheet-history";
import { AddInformationButton, AddInformationSheet } from "./AddInformation";

const stateOf = () => (window.history.state ?? {}) as Record<string, unknown>;
const marked = () => !!stateOf().gilbSheet;
const BASE = { usr: null, key: "k0", idx: 2 };
const user = () => userEvent.setup({ delay: null });

let stack: Array<Record<string, unknown> | null>;
let back: ReturnType<typeof vi.spyOn>;

/** What `CardGroup` does for the chooser: report itself to the card mode, and draw something once the chooser has opened it. */
function Group({ kind, label, section, shown = false, addable = true }: { kind: string; label: string; section: string; shown?: boolean; addable?: boolean }) {
  const mode = useCardMode();
  const register = mode.register;
  useEffect(() => register({ kind, label, section, shown, addable }), [register, kind, label, section, shown, addable]);
  return mode.opened.has(kind) ? <div data-testid={`group-${kind}`}>{label} group</div> : null;
}
const email = <Group kind="email" label="Email" section="Connection points" />;

function drawer(onClose = vi.fn(), groups = email) {
  return render(
    <Overlay open onClose={onClose} side="right" title="Record detail">
      <CardModeProvider canEdit>
        <CardModeActions />
        {groups}
        <AddInformationSheet />
      </CardModeProvider>
    </Overlay>,
  );
}
function card(groups: React.ReactNode, canEdit = true) {
  return render(
    <CardModeProvider canEdit={canEdit}>
      <CardModeActions />
      <AddInformationButton />
      {groups}
      <AddInformationSheet />
    </CardModeProvider>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  // Testing Library waits one real `setTimeout(0)` after each user-event call unless it sees a `jest` global with fake timers; this lets it advance ours.
  vi.stubGlobal("jest", { advanceTimersByTime: (ms: number) => vi.advanceTimersByTime(ms) });
  __resetSheetHistory();
  openPortalRoots.length = 0;
  window.history.replaceState(BASE, "", "/app/?rec=r1");
  stack = [];
  const push = window.history.pushState.bind(window.history);
  vi.spyOn(window.history, "pushState").mockImplementation((s, t) => {
    stack.push(window.history.state as Record<string, unknown> | null);
    push(s, t as string);
  });
  back = vi.spyOn(window.history, "back").mockImplementation(() => {
    const prior = stack.pop() ?? BASE;
    window.history.replaceState(prior, "", "/app/?rec=r1");
    window.dispatchEvent(new PopStateEvent("popstate", { state: prior }));
  });
});
afterEach(() => {
  cleanup();
  openPortalRoots.length = 0;
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("the chooser is a history entry (ported)", () => {
  it("opening pushes one marked entry (router state kept); the address does not change", async () => {
    drawer();
    await user().click(screen.getByTestId("card-add-info"));
    expect(window.history.pushState).toHaveBeenCalledTimes(1);
    expect(stateOf()).toMatchObject({ key: "k0", idx: 2, gilbSheet: true });
    expect(window.location.search).toBe("?rec=r1");
  });
  it("the system Back closes ONLY the chooser: the phone drawer stays open", async () => {
    const onClose = vi.fn();
    drawer(onClose);
    await user().click(screen.getByTestId("card-add-info"));
    await act(async () => {
      window.history.back();
    });
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Record detail" })).toBeTruthy();
    expect(marked()).toBe(false);
  });
  it("Cancel and Escape close it at once and remove the entry (one back each, never two)", async () => {
    drawer();
    const u = user();
    await u.click(screen.getByTestId("card-add-info"));
    await u.click(within(screen.getByTestId("add-information-sheet")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(marked()).toBe(false);
    await u.click(screen.getByTestId("card-add-info"));
    await u.keyboard("{Escape}");
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(marked()).toBe(false);
    act(() => void vi.advanceTimersByTime(450));
    expect(back).toHaveBeenCalledTimes(2);
  });
  it("a pick closes it at once, removes the entry, and still opens the group", async () => {
    drawer();
    await user().click(screen.getByTestId("card-add-info"));
    await user().click(screen.getByTestId("add-information-email"));
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(marked()).toBe(false);
    expect(screen.getByTestId("group-email")).toBeTruthy();
  });
  it("a reload that landed on the chooser's entry steps back off it once", () => {
    window.history.replaceState({ ...BASE, gilbSheet: true }, "", "/app/?rec=r1");
    drawer();
    act(() => void vi.advanceTimersByTime(50));
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(back).toHaveBeenCalledTimes(1);
  });
});

/** The z-index a layer literal in a class names (`z-50`, `z-[60]`), 0 when none. */
const zOf = (el: Element | null): number => {
  const m = /(?:^|\s)z-(?:\[(\d+)\]|(\d+))(?:\s|$)/.exec(el?.getAttribute("class") ?? "");
  return m ? Number(m[1] ?? m[2]) : 0;
};
/** The mobile bottom nav's layer in a typical shell (`relative z-[60] … h-16`): the sheet covers it too (a full-window sheet), so it is part of the order. */
const NAV_LAYER = 60;
const overlayRoot = () => document.querySelector('[role="presentation"]')!;

describe("the chooser opened from the phone's Detail drawer is above the drawer (ported)", () => {
  it("the sheet stacks above the drawer's overlay and above the bottom nav", async () => {
    drawer();
    await user().click(screen.getByTestId("card-add-info"));
    const sheet = screen.getByTestId("add-information-sheet");
    expect(zOf(sheet)).toBeGreaterThan(zOf(overlayRoot()));
    expect(zOf(sheet)).toBeGreaterThan(NAV_LAYER);
  });

  it("it is mounted on the document body, outside the drawer (so the drawer's own box cannot hold it down)", async () => {
    drawer();
    await user().click(screen.getByTestId("card-add-info"));
    const sheet = screen.getByTestId("add-information-sheet");
    expect(sheet.parentElement).toBe(document.body);
    expect(overlayRoot().contains(sheet)).toBe(false);
  });

  it("it stays below the surfaces that are opened FROM a picture or a picker (the photo viewer z-[80], the vault image picker z-[90])", async () => {
    drawer();
    await user().click(screen.getByTestId("card-add-info"));
    expect(zOf(screen.getByTestId("add-information-sheet"))).toBeLessThan(80);
  });

  it("Escape closes the sheet and ONLY the sheet: the drawer stays open", async () => {
    const onClose = vi.fn();
    drawer(onClose);
    await user().click(screen.getByTestId("card-add-info"));
    expect(document.activeElement).toBe(within(screen.getByTestId("add-information-sheet")).getByRole("searchbox"));
    await user().keyboard("{Escape}");
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Record detail" })).toBeTruthy();
  });

  it("Escape closes only the sheet even when the focus is NOT inside it (the drawer's own focus move lands later, or a press on the backdrop)", async () => {
    const onClose = vi.fn();
    drawer(onClose);
    await user().click(screen.getByTestId("card-add-info"));
    (document.activeElement as HTMLElement).blur();
    document.body.focus();
    await user().keyboard("{Escape}");
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Record detail" })).toBeTruthy();
  });

  it("Cancel closes the sheet and leaves the drawer; a pick closes it, opens the group and puts the cursor in it, in the drawer", async () => {
    const onClose = vi.fn();
    drawer(onClose);
    const u = user();
    await u.click(screen.getByTestId("card-add-info"));
    await u.click(within(screen.getByTestId("add-information-sheet")).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    await u.click(screen.getByTestId("card-add-info"));
    await u.click(within(screen.getByTestId("add-information-sheet")).getByRole("button", { name: "Email" }));
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(screen.getByRole("dialog", { name: "Record detail" })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });
});

const groups = (
  <>
    <Group kind="email" label="Email" section="Connection points" />
    <Group kind="phone" label="Phone" section="Connection points" />
    <Group kind="employment" label="Employment" section="Companies" />
    <Group kind="skill" label="Skill" section="Skills and interests" />
    <Group kind="shown-one" label="Shown already" section="Connection points" shown />
    <Group kind="relation-x" label="Relation" section="Relations" addable={false} />
  </>
);
const sheet = () => screen.getByTestId("add-information-sheet");
const openChooser = async (u = user()) => u.click(screen.getByTestId("card-add-info-button"));

describe("the button at the foot of the card", () => {
  it("is drawn on a card that may be written, full width, with its words, and opens the chooser", async () => {
    card(groups);
    const b = screen.getByTestId("card-add-info-button");
    expect(b.textContent).toBe("+ Add Information");
    expect(b.getAttribute("type")).toBe("button");
    expect(b.getAttribute("aria-haspopup")).toBe("dialog");
    expect(b.className).toContain("w-full");
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    await openChooser();
    expect(sheet()).toBeTruthy();
  });

  it("is not drawn on a card that cannot be written", () => {
    card(groups, false);
    expect(screen.queryByTestId("card-add-info-button")).toBeNull();
  });

  it("is not drawn outside a card (no provider)", () => {
    render(<AddInformationButton />);
    expect(screen.queryByTestId("card-add-info-button")).toBeNull();
  });
});

describe("the chooser", () => {
  it("draws nothing while closed, and nothing outside a card or on a card that cannot be written", () => {
    card(groups);
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    cleanup();
    render(<AddInformationSheet />);
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it("never opens on a card that cannot be written, even if something asks the card mode to open it", () => {
    function Asker() {
      const mode = useCardMode();
      useEffect(() => mode.setChooserOpen(true), [mode.setChooserOpen]);
      return null;
    }
    card(<Asker />, false);
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(window.history.pushState).not.toHaveBeenCalled();
  });

  it("is a modal dialog named 'Add information', with a Search box, a Cancel, and a bold title", async () => {
    card(groups);
    await openChooser();
    const d = sheet();
    expect(d.getAttribute("role")).toBe("dialog");
    expect(d.getAttribute("aria-modal")).toBe("true");
    expect(d.getAttribute("aria-label")).toBe("Add information");
    const search = within(d).getByRole("searchbox", { name: "Search the kinds of information" });
    expect(search.getAttribute("placeholder")).toBe("Search");
    expect(within(d).getByRole("heading", { level: 2 }).textContent).toBe("Add information");
    expect(within(d).getByRole("button", { name: "Cancel" })).toBeTruthy();
  });

  it("puts the cursor in the Search box when it opens", async () => {
    card(groups);
    await openChooser();
    expect(document.activeElement).toBe(within(sheet()).getByRole("searchbox"));
  });

  it("lists the groups that are not shown and may be added to, under their headings, and nothing else", async () => {
    card(groups);
    await openChooser();
    const d = sheet();
    expect(within(d).getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Connection points", "Companies", "Skills and interests"]);
    expect(within(within(d).getByRole("region", { name: "Connection points" })).getAllByRole("button").map((b) => b.textContent)).toEqual(["Email", "Phone"]);
    expect(within(d).queryByText("Shown already")).toBeNull();
    expect(within(d).queryByText("Relation")).toBeNull();
    expect(within(d).getByTestId("add-information-employment").textContent).toBe("Employment");
    expect(within(d).getByTestId("add-information-skill").textContent).toBe("Skill");
  });

  it("says so when the card holds everything already", async () => {
    card(<Group kind="email" label="Email" section="Connection points" shown />);
    await openChooser();
    expect(within(sheet()).getByTestId("add-information-none").textContent).toBe("Everything this card can hold is already on it.");
    expect(within(sheet()).queryAllByRole("heading", { level: 3 })).toHaveLength(0);
  });

  it("says so when the card has no groups at all", async () => {
    card(null);
    await openChooser();
    expect(within(sheet()).getByTestId("add-information-none")).toBeTruthy();
  });

  it("searches the label and the heading, ignoring case and the ends of the words", async () => {
    card(groups);
    const u = user();
    await openChooser(u);
    const box = within(sheet()).getByRole("searchbox");
    await u.type(box, "  EMA ");
    expect(within(sheet()).getAllByRole("button", { name: /Email|Phone|Employment|Skill/ }).filter((b) => b.getAttribute("data-testid")?.startsWith("add-information-")).map((b) => b.textContent)).toEqual(["Email"]);
    await u.clear(box);
    await u.type(box, "companies");
    expect(within(sheet()).getByTestId("add-information-employment")).toBeTruthy();
    expect(within(sheet()).queryByTestId("add-information-email")).toBeNull();
  });

  it("a search that finds nothing says 'Nothing matches.'", async () => {
    card(groups);
    const u = user();
    await openChooser(u);
    await u.type(within(sheet()).getByRole("searchbox"), "zzz");
    expect(within(sheet()).getByTestId("add-information-none").textContent).toBe("Nothing matches.");
  });

  it("the search is empty again the next time it opens", async () => {
    card(groups);
    const u = user();
    await openChooser(u);
    await u.type(within(sheet()).getByRole("searchbox"), "zzz");
    await u.click(within(sheet()).getByRole("button", { name: "Cancel" }));
    await openChooser(u);
    expect((within(sheet()).getByRole("searchbox") as HTMLInputElement).value).toBe("");
    expect(within(sheet()).getByTestId("add-information-email")).toBeTruthy();
  });

  it("a pick opens that group in the card (edit mode on), and only that group", async () => {
    card(groups);
    await openChooser();
    await user().click(screen.getByTestId("add-information-skill"));
    expect(screen.getByTestId("group-skill")).toBeTruthy();
    expect(screen.queryByTestId("group-email")).toBeNull();
    expect(screen.getByTestId("card-mode-root").getAttribute("data-card-mode")).toBe("edit");
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
  });

  it("the header '+' opens the same chooser as the button at the foot", async () => {
    card(groups);
    await user().click(screen.getByTestId("card-add-info"));
    expect(sheet()).toBeTruthy();
    expect(screen.getByTestId("add-information-email")).toBeTruthy();
  });

  it("a group that registers after the chooser is open appears in it", async () => {
    const view = (withPhone: boolean) => (
      <CardModeProvider canEdit>
        <CardModeActions />
        <Group kind="email" label="Email" section="Connection points" />
        {withPhone ? <Group kind="phone" label="Phone" section="Connection points" /> : null}
        <AddInformationSheet />
      </CardModeProvider>
    );
    const { rerender } = render(view(false));
    await user().click(screen.getByTestId("card-add-info"));
    expect(screen.queryByTestId("add-information-phone")).toBeNull();
    rerender(view(true));
    expect(screen.getByTestId("add-information-phone")).toBeTruthy();
  });

  it("a group that becomes shown leaves the list", async () => {
    const view = (shown: boolean) => (
      <CardModeProvider canEdit>
        <CardModeActions />
        <Group kind="email" label="Email" section="Connection points" shown={shown} />
        <Group kind="phone" label="Phone" section="Connection points" />
        <AddInformationSheet />
      </CardModeProvider>
    );
    const { rerender } = render(view(false));
    await user().click(screen.getByTestId("card-add-info"));
    expect(screen.getByTestId("add-information-email")).toBeTruthy();
    rerender(view(true));
    expect(screen.queryByTestId("add-information-email")).toBeNull();
    expect(screen.getByTestId("add-information-phone")).toBeTruthy();
  });

  it("every choice is a button of at least 44 px (min-h-11) that does not submit", async () => {
    card(groups);
    await openChooser();
    for (const b of within(sheet()).getAllByRole("button").filter((x) => x.getAttribute("data-testid")?.startsWith("add-information-"))) {
      expect(b.getAttribute("type")).toBe("button");
      expect(b.className).toContain("min-h-11");
    }
  });
});

describe("Escape", () => {
  it("pressed inside the sheet closes it and goes no further", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    card(groups);
    await openChooser();
    fireEvent.keyDown(within(sheet()).getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("pressed with the focus outside the sheet closes it and goes no further (a listener on the page does not see it)", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    card(groups);
    await openChooser();
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
  });

  it("pressed in the sheet while a create dialog is open elsewhere is still the sheet's: it closes and goes no further", async () => {
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    card(groups);
    await openChooser();
    const top = document.createElement("div");
    document.body.appendChild(top);
    openPortalRoots.push(top);
    fireEvent.keyDown(within(sheet()).getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    expect(outer).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outer);
    top.remove();
  });

  it("any other key does nothing", async () => {
    card(groups);
    await openChooser();
    fireEvent.keyDown(document.body, { key: "a" });
    fireEvent.keyDown(within(sheet()).getByRole("searchbox"), { key: "Enter" });
    expect(sheet()).toBeTruthy();
  });

  it("is left to a create dialog that is open above it, when the key was pressed outside that dialog", async () => {
    card(groups);
    await openChooser();
    const top = document.createElement("div");
    document.body.appendChild(top);
    openPortalRoots.push(top);
    fireEvent.keyDown(document.body, { key: "Escape" });
    expect(sheet()).toBeTruthy();
    top.remove();
  });

  it("is taken when the key was pressed inside the open create dialog", async () => {
    card(groups);
    await openChooser();
    const top = document.createElement("div");
    const inner = document.createElement("button");
    top.appendChild(inner);
    document.body.appendChild(top);
    openPortalRoots.push(top);
    fireEvent.keyDown(inner, { key: "Escape" });
    expect(screen.queryByTestId("add-information-sheet")).toBeNull();
    top.remove();
  });

  it("is not listened for while the chooser is closed", () => {
    const add = vi.spyOn(document, "addEventListener");
    card(groups);
    expect(add.mock.calls.filter((c) => c[0] === "keydown" && c[2] === true)).toHaveLength(0);
  });

  it("the listener is taken off when the chooser closes", async () => {
    const remove = vi.spyOn(document, "removeEventListener");
    card(groups);
    await openChooser();
    await user().click(within(sheet()).getByRole("button", { name: "Cancel" }));
    expect(remove.mock.calls.filter((c) => c[0] === "keydown" && c[2] === true).length).toBeGreaterThanOrEqual(1);
  });
});
