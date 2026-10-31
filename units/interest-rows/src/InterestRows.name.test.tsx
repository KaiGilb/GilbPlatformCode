// @vitest-environment jsdom
// New. An interest is shown by its NAME, never by its address or any part of it, in every state of the name: being read, read, the term gave no label, and an
// address that is not the ontology's term address. Checked on what a person sees or hears: the text, every aria-label, every title; in edit and in presentation.
// The held-notes state is a double (its store has its own suite).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { HeldNotesState } from "@kaigilb/gilbplatformcode-held-notes";

const ONTOLOGY = "https://veda.platform.example.test";
const world = vi.hoisted(() => ({ topics: [] as string[], labels: {} as Record<string, string | null | "pending">, asked: [] as string[] }));
vi.mock("@kaigilb/gilbplatformcode-held-notes", () => ({
  useHeldNotes: (): HeldNotesState => ({
    noteFor: () => "Long exposures",
    topics: () => world.topics,
    readError: null,
    errorFor: () => null,
    savingFor: () => false,
    save: async () => true,
    add: async () => true,
    removeFor: async () => true,
    noOwnVault: false,
    editableFor: () => true,
    markFor: () => "private",
    sourceFor: () => null,
    setPrivate: async () => true,
  }),
}));
vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  termLabelOfIri: (iri: string): Promise<string | null> => {
    world.asked.push(iri);
    const l = world.labels[iri];
    return l === "pending" ? new Promise<string | null>(() => undefined) : Promise.resolve(l ?? null);
  },
}));
vi.mock("@kaigilb/gilbplatformcode-skill-picker-sheet", async (orig) => ({ ...(await orig<typeof import("@kaigilb/gilbplatformcode-skill-picker-sheet")>()), SkillPickerSheet: () => null }));
vi.mock("@kaigilb/gilbplatformcode-added-by", () => ({ AddedByLine: () => null, HeldVisibilitySwitch: ({ noun, isPrivate }: { noun: string; isPrivate: boolean }) => <button aria-label={`Make ${noun} ${isPrivate ? "shared" : "private"}`} type="button" /> }));

// eslint-disable-next-line import/first
import { InterestRows } from "./index";

const TERM = `${ONTOLOGY}/base/t/StreetPhotography`;
const STORAGE = `${ONTOLOGY}/base/e/06gf80rjtdw3h9q187p80kx00m`;
const FOREIGN = "https://elsewhere.example.test/base/t/Welding";
beforeEach(() => {
  setTermOrigin(ONTOLOGY);
  world.topics = [];
  world.labels = {};
  world.asked = [];
});
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

function seen(root: HTMLElement): string {
  const attrs = [...root.querySelectorAll("[aria-label],[title]")].map((e) => `${e.getAttribute("aria-label") ?? ""} ${e.getAttribute("title") ?? ""}`);
  return `${root.textContent ?? ""} ${attrs.join(" ")}`;
}
const card = (canEdit: boolean) => (
  <CardModeProvider canEdit={canEdit}>
    <InterestRows vaultId="v" principal="p" recordEntityUri="https://v/e/1" canEdit={canEdit} />
  </CardModeProvider>
);
/** Outside a managed card there is no presentation mode: the rows are drawn as when the card is being edited. */
const editCard = () => <InterestRows vaultId="v" principal="p" recordEntityUri="https://v/e/1" canEdit />;
const NOT_ADDRESS = (all: string) => {
  expect(all).not.toContain("https://");
  expect(all).not.toContain("06gf80rjtdw3h9q187p80kx00m");
  expect(all).not.toContain("Welding");
  expect(all).not.toContain("StreetPhotography");
};

describe("the name of an interest, in every state", () => {
  it("while the term's label is being read: '…' (not the address, not a part of it)", async () => {
    world.topics = [TERM];
    world.labels[TERM] = "pending";
    const { container } = render(card(false));
    expect(screen.getByTestId("interest-row-value").textContent).toBe("…");
    await waitFor(() => expect(world.asked).toEqual([TERM]));
    NOT_ADDRESS(seen(container));
  });
  it("read: the term's own label", async () => {
    world.topics = [TERM];
    world.labels[TERM] = "street photography";
    const { container } = render(card(false));
    await waitFor(() => expect(screen.getByTestId("interest-row-value").textContent).toBe("street photography"));
    NOT_ADDRESS(seen(container));
  });
  it("the term gave no label: the catalogue name in the term's address, split into words", async () => {
    world.topics = [TERM];
    world.labels[TERM] = null;
    const { container } = render(card(false));
    await waitFor(() => expect(screen.getByTestId("interest-row-value").textContent).toBe("Street Photography"));
    expect(seen(container)).not.toContain("https://");
    expect(seen(container)).not.toContain("StreetPhotography");
  });
  it.each([["a storage address", STORAGE], ["a foreign origin", FOREIGN]])("%s with no label: the word 'An interest'", async (_n, iri) => {
    world.topics = [iri];
    world.labels[iri] = null;
    const { container } = render(card(false));
    await waitFor(() => expect(screen.getByTestId("interest-row-value").textContent).toBe("An interest"));
    NOT_ADDRESS(seen(container));
  });
});

describe("no state shows the address, in edit mode either (no address line, no title, no accessible name)", () => {
  it.each([["a term with a label", TERM, "street photography"], ["a term with none", TERM, null], ["a storage address", STORAGE, null], ["a foreign origin", FOREIGN, null]] as const)(
    "edit: %s",
    async (_n, iri, label) => {
      world.topics = [iri];
      world.labels[iri] = label;
      const { container } = render(editCard());
      await waitFor(() => expect(screen.getByTestId("interest-row-value").textContent).not.toBe("…"));
      expect(screen.getByTestId("interest-row-remove")).toBeTruthy();
      const all = seen(container);
      expect(all).not.toContain("https://");
      expect(all).not.toContain("06gf80rjtdw3h9q187p80kx00m");
      expect(all).not.toContain("Welding");
      if (label) expect(all).toContain(`Remove interest ${label}`);
      if (label) expect(all).toContain(`Edit note for ${label}`);
      if (label) expect(all).toContain(`Make interest ${label} shared`);
    },
  );

  it.each([["a term with a label", TERM, "street photography", "Edit interest street photography"], ["a storage address", STORAGE, null, "Edit interest An interest"]] as const)(
    "presentation of a card that may be edited: the name is a button, named by the name (%s)",
    async (_n, iri, label, accessible) => {
      world.topics = [iri];
      world.labels[iri] = label;
      const { container } = render(card(true));
      await waitFor(() => expect(screen.getByRole("button", { name: accessible })).toBeTruthy());
      const all = seen(container);
      expect(all).not.toContain("https://");
      expect(all).not.toContain("06gf80rjtdw3h9q187p80kx00m");
    },
  );
});
