// @vitest-environment jsdom
// Ported from the source's `LanguagesCard.s10iter1focus.test.tsx` (2 cases). Re-based: the units' own paths, the chooser stand-in (test/chooser.tsx), the example host.
// Cycle214 s10 iteration 1 FEEDBACK (Kai, 2026-10-16, verbatim): "After '+ Add information', then picking an information type, it should auto place the
// cursor in the right field so the user can just start typing." Languages: after the pick the language chooser opens with its search box focused.
// Harness copied from LanguagesCard.s8cardlook.test.tsx.
import { AddInformationSheet, addInformation } from "../test/chooser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("s10 iter1 — Languages: after the pick from + Add information the cursor is in the language chooser's search box", () => {
  it("the chooser is open and its search box has the focus", async () => {
    render(card(state({ rows: [], contactTag: "" })));
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Languages");
    const box = await screen.findByRole("combobox", { name: "Add a language" });
    expect(document.activeElement).toBe(box);
  });

  it("no focus on loading", () => {
    render(card(state()));
    expect(document.activeElement).toBe(document.body);
  });
});
