// @vitest-environment jsdom
// Ported from the source's `InterestRows.s10iter1focus.test.tsx` (1 case). Kai's feedback (2026-10-16): "After '+ Add information', then picking an information type, it should
// auto place the cursor in the right field so the user can just start typing." Interests: after the pick the interest chooser opens with its search box focused.
// Harness as `InterestRows.s8cardlook.test.tsx`.
import { AddInformationSheet, addInformation } from "../test/chooser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { HeldNotesState } from "@kaigilb/gilbplatformcode-held-notes";

const notes = vi.hoisted(() => ({ topics: [] as string[], note: {} as Record<string, string> }));
vi.mock("@kaigilb/gilbplatformcode-held-notes", () => ({
  useHeldNotes: (): HeldNotesState => ({
    noteFor: (t) => notes.note[t] ?? "",
    topics: () => notes.topics,
    readError: null,
    errorFor: () => null,
    savingFor: () => false,
    save: async () => true,
    add: async () => true,
    removeFor: async () => true,
    noOwnVault: false,
    editableFor: () => true,
    markFor: () => null,
    sourceFor: () => null,
    setPrivate: async () => true,
  }),
}));
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({ termLabelOfIri: async (iri: string) => iri.slice(iri.lastIndexOf("/") + 1) }));

// eslint-disable-next-line import/first
import { InterestRows } from "./index";
// eslint-disable-next-line import/first
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";

afterEach(() => {
  cleanup();
  notes.topics = [];
  notes.note = {};
});
const card = () => (
  <CardModeProvider canEdit>
    <CardModeBar />
    <InterestRows vaultId="v" principal="p" recordEntityUri="https://v/e/1" canEdit />
    <AddInformationSheet />
  </CardModeProvider>
);

describe("s10 iter1 — Interests: after the pick from + Add information the cursor is in the chooser's search box", () => {
  it("the chooser is open and its search box has the focus", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ results: [], items: [] }), { status: 200, headers: { "content-type": "application/json" } })));
    render(card());
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Interests");
    const dlg = await screen.findByRole("dialog");
    expect(dlg.contains(document.activeElement)).toBe(true);
    expect((document.activeElement as HTMLElement).tagName).toBe("INPUT");
    vi.unstubAllGlobals();
  });
});
