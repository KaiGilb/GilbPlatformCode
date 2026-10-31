// The two private groups on a held card, over the real card frame (`card-group`) and card mode (`card-mode`), the real annotations client and a stubbed platform.
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOTATION_AUTOSAVE_MS, HolderNoteGroup, NOTES_VAULT_UNTIED_COPY, type HolderField } from "./index";
import { HOME, PARTY, readAnswer, record, setUp, tearDown, type Call } from "../test/support";

beforeEach(() => {
  setUp();
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  tearDown();
});

function platform(read?: () => Response | Promise<Response>, putStatus = 201) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
    const c = record(url, init);
    calls.push(c);
    if (c.method === "PUT") return new Response(putStatus < 300 ? JSON.stringify({ changed: true }) : "refused", { status: putStatus });
    return read ? read() : new Response(JSON.stringify(readAnswer()), { status: 200 });
  });
  return { calls, puts: () => calls.filter((c) => c.method === "PUT") };
}
const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)));

function group(over: Partial<React.ComponentProps<typeof HolderNoteGroup>> = {}, field: HolderField = "note") {
  return <HolderNoteGroup field={field} vaultId={HOME} heldParty={PARTY} initialText={null} initialLoad="empty" {...over} />;
}
const card = (canEdit: boolean, children: ReactNode, startEditing = false) => (
  <CardModeProvider canEdit={canEdit} startEditing={startEditing}>
    {children}
  </CardModeProvider>
);

describe("what is drawn", () => {
  it("My Note: the title, the PRIVATE marker, the hint, one compact box on a card the holder can write", () => {
    platform();
    render(card(true, group()));
    expect(screen.getByRole("heading", { name: "My Note" })).toBeTruthy();
    expect(screen.getByTestId("contact-note-private").textContent).toBe("Private");
    const box = screen.getByTestId("contact-note-editor") as HTMLTextAreaElement;
    expect(box.placeholder).toBe("Something only you will see…");
    expect(box.rows).toBe(1);
    expect(screen.getByTestId("contact-note-group").getAttribute("data-compact")).toBe("true");
    expect(screen.getByTestId("contact-note-group").getAttribute("data-annotation-state")).toBe("empty");
  });
  it("Where / How we met: its own title, hint and test ids", () => {
    platform();
    render(card(true, group({}, "origin")));
    expect(screen.getByRole("heading", { name: "Where / How we met" })).toBeTruthy();
    expect((screen.getByTestId("connection-origin-editor") as HTMLTextAreaElement).placeholder).toBe("e.g. Madrid Conference");
    expect(screen.getByTestId("connection-origin-private").textContent).toBe("Private");
    expect(screen.getByTestId("connection-origin-group").getAttribute("data-group")).toBe("how-we-met");
  });
  it("a card that cannot be written draws a group with text as text, and an empty one not at all", () => {
    platform();
    render(
      card(
        false,
        <>
          {group({ initialText: "Met in Oslo", initialLoad: "ok" })}
          {group({}, "origin")}
        </>,
      ),
    );
    expect(screen.getByTestId("contact-note-text").textContent).toBe("Met in Oslo");
    expect(screen.queryByTestId("connection-origin-group")).toBeNull();
    expect(screen.queryByTestId("connection-origin-editor")).toBeNull();
  });
  it("with text on a writable card it is shown as text; a click turns edit mode on and puts the cursor in the box", () => {
    platform();
    render(card(true, group({ initialText: "Met in Oslo", initialLoad: "ok" })));
    const text = screen.getByTestId("contact-note-text");
    expect(text.textContent).toBe("Met in Oslo");
    fireEvent.click(text);
    const box = screen.getByTestId("contact-note-editor") as HTMLTextAreaElement;
    expect(box.value).toBe("Met in Oslo");
    expect(document.activeElement).toBe(box);
  });
  it("with no card mode at all (always editing) the full box is drawn", () => {
    platform();
    render(group({ initialText: "x", initialLoad: "ok" }));
    expect((screen.getByTestId("contact-note-editor") as HTMLTextAreaElement).value).toBe("x");
  });
  it("another app's value is shown beside the holder's, read-only, and the group is then never compact", async () => {
    platform(() => new Response(JSON.stringify(readAnswer({ note: "mine", others: [{ entity: "e2", text: "theirs" }] })), { status: 200 }));
    render(card(true, group({ initialLoad: undefined, initialText: undefined })));
    await tick(0);
    const list = screen.getByTestId("contact-note-others");
    expect(list.textContent).toContain("theirs");
    expect(list.textContent).toContain("from another app");
    expect(screen.getByTestId("contact-note-group").getAttribute("data-compact")).toBeNull();
  });
  it("while the read is out: Loading…", () => {
    platform(() => new Promise<Response>(() => undefined));
    render(card(true, group({ initialLoad: undefined })));
    expect(screen.getByTestId("contact-note-loading").textContent).toBe("Loading…");
  });
});

describe("a failed read is a failed read, never an empty note", () => {
  it("shows the alert with the words and Try again, which reads again and calls onReload", async () => {
    let n = 0;
    const p = platform(() => (n++ === 0 ? new Response("x", { status: 500 }) : new Response(JSON.stringify(readAnswer({ note: "back" })), { status: 200 })));
    const onReload = vi.fn();
    render(card(true, group({ initialLoad: undefined, onReload })));
    await tick(0);
    const alert = screen.getByTestId("contact-note-error");
    expect(alert.textContent).toContain("Could not load your note.");
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await tick(0);
    expect(onReload).toHaveBeenCalledTimes(1);
    expect(p.calls.filter((c) => c.method === "GET")).toHaveLength(2);
    expect((screen.getByTestId("contact-note-text") as HTMLElement).textContent).toBe("back");
  });
  it("the origin field says its own words", () => {
    platform();
    render(card(true, group({ initialLoad: "error" }, "origin")));
    expect(screen.getByTestId("connection-origin-error").textContent).toContain("Could not load where you met.");
  });
  it("errorCopy replaces the generic words (a read that could not be tied to the card's vault)", () => {
    platform();
    render(card(true, group({ initialLoad: "error", errorCopy: NOTES_VAULT_UNTIED_COPY })));
    expect(screen.getByTestId("contact-note-error").textContent).toContain(NOTES_VAULT_UNTIED_COPY);
  });
});

describe("typing saves", () => {
  it("shows Not saved yet…, then Saving…/Saved, and writes once to the holder's vault", async () => {
    const p = platform();
    const onSaved = vi.fn();
    render(card(true, group({ onSaved })));
    const box = screen.getByTestId("contact-note-editor");
    fireEvent.change(box, { target: { value: "Met at the conference" } });
    expect(screen.getByTestId("contact-note-save-state").textContent).toBe("Not saved yet…");
    await tick(ANNOTATION_AUTOSAVE_MS - 1);
    expect(p.puts()).toHaveLength(0);
    await tick(1);
    expect(p.puts()).toHaveLength(1);
    expect(JSON.parse(p.puts()[0]!.body!)).toEqual({ heldParty: PARTY, vaultId: HOME, note: "Met at the conference" });
    expect(screen.getByTestId("contact-note-save-state").textContent).toBe("Saved");
    expect(onSaved).toHaveBeenCalledWith("Met at the conference");
  });
  it("the origin box writes `origin`", async () => {
    const p = platform();
    render(card(true, group({}, "origin")));
    const box = screen.getByTestId("connection-origin-editor");
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "Madrid" } });
    fireEvent.blur(box);
    await tick(0);
    expect(JSON.parse(p.puts()[0]!.body!)).toEqual({ heldParty: PARTY, vaultId: HOME, origin: "Madrid" });
  });
  it("a refused write shows the failure's words on the group", async () => {
    platform(undefined, 500);
    render(card(true, group()));
    fireEvent.change(screen.getByTestId("contact-note-editor"), { target: { value: "x" } });
    await tick(ANNOTATION_AUTOSAVE_MS);
    const e = screen.getByTestId("contact-note-save-error");
    expect(e.textContent).toBe("Could not save your note — Annotation 500 — refused");
    expect(screen.getByTestId("contact-note-group").getAttribute("data-save")).toBe("error");
  });
  it("the compact shape is held while the box has focus: clearing the text does not swap the box out", async () => {
    platform();
    render(card(true, group({ initialText: "a", initialLoad: "ok" }, "origin"), true));
    const box = screen.getByTestId("connection-origin-editor") as HTMLTextAreaElement;
    expect(box.rows).not.toBe(1);
    box.focus();
    fireEvent.focus(box);
    fireEvent.change(box, { target: { value: "" } });
    expect(screen.getByTestId("connection-origin-editor")).toBe(box);
  });
});
