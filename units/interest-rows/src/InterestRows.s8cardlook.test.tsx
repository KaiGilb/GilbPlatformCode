// @vitest-environment jsdom
// Ported from the source's `InterestRows.s8cardlook.test.tsx` (4 cases): Interests in the card's two modes (framed group; presentation hides the (−), "Add interests", the
// raw address and an empty note; a card with no interest is not drawn). The held-notes store has its own suite; its state is a double here. Re-based on the units
// (`card-mode`, a stand-in for the "Add information" sheet in test/chooser.tsx). One assertion is added (no address in edit mode either).
import { AddInformationSheet, addInformation } from "../test/chooser";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
vi.mock("@kaigilb/gilbplatformcode-skill-picker-sheet", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-skill-picker-sheet")>()), SkillPickerSheet: () => null }));

// eslint-disable-next-line import/first
import { InterestRows } from "./index";
// eslint-disable-next-line import/first
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";

afterEach(() => {
  cleanup();
  notes.topics = [];
  notes.note = {};
});
const SAIL = "https://veda.platform.example.test/base/t/Sailing";
const card = () => (
  <CardModeProvider canEdit>
    <CardModeBar />
    <InterestRows vaultId="v" principal="p" recordEntityUri="https://v/e/1" canEdit />
    <AddInformationSheet />
  </CardModeProvider>
);
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");

describe("Interests", () => {
  it("presentation: the interest as text in a framed, titled group; no (−), no add, no address line, no empty note", async () => {
    notes.topics = [SAIL];
    render(card());
    const g = screen.getByRole("region", { name: "Interests" });
    expect(g.querySelector("svg[data-card-icon='interest']")).toBeTruthy();
    // 0.1.0: the source showed the last part of the address at once and the label after; the name is "…" while it is read (never the address or a part of it).
    await waitFor(() => expect(screen.getByTestId("interest-row-value").textContent).toBe("Sailing"));
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.queryByTestId("interest-add")).toBeNull();
    expect(g.textContent).not.toMatch(/https:|veda\.platform\.example\.test/);
    expect(screen.queryByTestId("interest-note-text")).toBeNull();
    expect(g.textContent).not.toMatch(/About this interest/);
  });

  it("presentation: an interest that has a note shows the note as text", () => {
    notes.topics = [SAIL];
    notes.note[SAIL] = "Dinghies, mostly";
    render(card());
    expect(screen.getByTestId("interest-note-text").textContent).toBe("Dinghies, mostly");
  });

  it("no interest at all → the group is not drawn, in presentation or in edit; the chooser adds it with 'Add interests'", async () => {
    render(card());
    expect(screen.queryByTestId("interest-section")).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByTestId("interest-section")).toBeNull();
    await addInformation("Interests");
    expect(screen.getByTestId("interest-section")).toBeTruthy();
    expect(screen.getByTestId("interest-add")).toBeTruthy();
  });

  it("a click on the interest turns edit mode on; the (−), the address line and the note box appear", async () => {
    notes.topics = [SAIL];
    render(card());
    await userEvent.click(screen.getByTestId("interest-row-value"));
    expect(modeOf()).toBe("edit");
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(1);
    expect(screen.getByTestId("interest-add")).toBeTruthy();
    expect(screen.getByText(/Add a note about this interest/)).toBeTruthy();
    // 0.1.0: the source's title says "the address line appears"; the address is no longer drawn, so the address is not there.
    expect(document.body.textContent).not.toMatch(/https:|veda\.platform\.example\.test/);
  });
});
