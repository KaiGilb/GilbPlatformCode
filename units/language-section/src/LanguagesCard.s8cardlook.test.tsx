// @vitest-environment jsdom
// Ported from the source's `LanguagesCard.s8cardlook.test.tsx` (5 cases). Re-based: the units' own paths, the chooser stand-in (test/chooser.tsx), the example host.
// Cycle214 s8 "card look" — the Languages card in the card's two modes (GilbApp's shell: a framed group).
// PRESENTATION: the languages as text with their flag (a picture, not a button), the contact language marked; no (−), no "Add
// languages", no "Make contact language", no "Share the languages you use"; a card with no language is not drawn.
import { AddInformationSheet, addInformation } from "../test/chooser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LanguagesCard } from "./index";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { LanguagesState } from "@kaigilb/gilbplatformcode-held-languages-state";
import { __resetLanguageEntries } from "@kaigilb/gilbplatformcode-language-entry";

const NOR = "https://veda.platform.example.test/base/e/xja6zz79cmva";
const ENG = "https://veda.platform.example.test/base/e/eng000000001";

function state(over: Partial<LanguagesState> = {}): LanguagesState {
  const ok = async () => true;
  return {
    rows: [
      { id: "c1", language: NOR, flagCountry: null, access: null },
      { id: "c2", language: ENG, flagCountry: null, access: null },
    ],
    loading: false,
    error: null,
    contactTag: "no",
    hasRungs: false,
    errorFor: () => null,
    savingFor: () => false,
    add: ok,
    listLegacy: ok,
    remove: ok,
    setFlag: ok,
    markContact: ok,
    clearContact: ok,
    ...over,
  };
}
beforeEach(() => {
  __resetLanguageEntries();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const docs: Record<string, unknown> = {
        [NOR]: { "@type": "t:HumanLanguage", label: "Norwegian", iso6393Code: "nor" },
        [ENG]: { "@type": "t:HumanLanguage", label: "English", iso6393Code: "eng" },
      };
      return docs[url] ? new Response(JSON.stringify(docs[url]), { status: 200 }) : new Response("no", { status: 404 });
    }),
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
const card = (s: LanguagesState, canEdit = true) => (
  <CardModeProvider canEdit={canEdit}>
    <CardModeBar />
    <LanguagesCard state={s} editMode={canEdit} />
    <AddInformationSheet />
  </CardModeProvider>
);
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");

describe("Languages — presentation", () => {
  it("reads the languages as text, the contact language marked and first, in a framed group titled Languages", async () => {
    render(card(state()));
    await waitFor(() => expect(screen.getAllByTestId("language-row-value").map((e) => e.textContent)).toEqual(["Norwegian", "English"]));
    const g = screen.getByRole("region", { name: "Languages" });
    expect(g.querySelector("svg[data-card-icon='language']")).toBeTruthy();
    expect(screen.getAllByTestId("language-row")[0]!.getAttribute("data-marked")).toBe("true");
    expect(within(screen.getAllByTestId("language-row")[0]!).getByTestId("language-contact-mark").textContent).toBe("Contact language");
  });

  it("shows NO (−), NO add control, NO 'Make contact language', and the flag is a picture, not a button", async () => {
    render(card(state()));
    await waitFor(() => expect(screen.getAllByTestId("language-row")).toHaveLength(2));
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.queryByTestId("language-add")).toBeNull();
    expect(screen.queryByTestId("language-make-contact")).toBeNull();
    expect(screen.queryByTestId("language-flag-button")).toBeNull();
    expect(screen.getAllByTestId("language-flag")).toHaveLength(2);
  });

  it("a card with no language is NOT drawn (no 'Share the languages you use'); the chooser adds it with its add control", async () => {
    render(card(state({ rows: [], contactTag: "" })));
    expect(screen.queryByTestId("languages-section")).toBeNull();
    expect(screen.queryByText(/Share the languages you use/)).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByTestId("languages-section")).toBeNull();
    await addInformation("Languages");
    expect(screen.getByTestId("languages-section")).toBeTruthy();
    expect(screen.getByText(/Share the languages you use/)).toBeTruthy();
    expect(screen.getByTestId("language-add")).toBeTruthy();
  });

  it("a click on a language turns edit mode on, and then the (−), the flag button and 'Make contact language' are there", async () => {
    render(card(state()));
    await waitFor(() => expect(screen.getAllByTestId("language-row")).toHaveLength(2));
    await userEvent.click(screen.getAllByTestId("language-row-value")[1]!);
    expect(modeOf()).toBe("edit");
    expect(document.querySelectorAll("[data-remove-control]").length).toBe(2);
    expect(screen.getAllByTestId("language-flag-button")).toHaveLength(2);
    expect(screen.getByTestId("language-make-contact")).toBeTruthy();
    expect(screen.getByTestId("language-add")).toBeTruthy();
  });

  it("the language is a keyboard-reachable button of at least 40 px with an accessible name", async () => {
    render(card(state()));
    await waitFor(() => expect(screen.getAllByTestId("language-row")).toHaveLength(2));
    const b = screen.getAllByTestId("language-row-value")[0]!;
    expect(b.tagName).toBe("BUTTON");
    expect(b.getAttribute("aria-label")).toBe("Edit language Norwegian");
    expect(b.className).toMatch(/min-h-10/);
  });
});
