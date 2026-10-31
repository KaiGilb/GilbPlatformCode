// @vitest-environment jsdom
// Ported from the source's `LanguageSection.s9reader.test.tsx` (5 cases). Re-based: the two mocks name the unit `held-languages-state` and this unit's `./LanguagesCard`; the example host replaces the real one.
// Cycle214 s9 organization card FIX ROUND (Agent.Tester F8), REWRITTEN for SB1a (RuleBaseappSourceIsAdder). Old rule: a reader who could not read the holder's card was told
// "These languages are kept by the holder of this card and are not shown to you", and a writer in a vault with no card of its own was shown no Languages group. New rule: the
// card of the vault written to is not involved, so that sentence is gone; what the platform returns is shown to everyone; only a person with no landing vault of their own
// (nothing they add would have a source) is held back as an EDITOR, and the card says why once, where the kinds of contact sit.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

const hold = vi.hoisted(() => ({ error: "" as string | null, noOwnVault: false }));
vi.mock("@kaigilb/gilbplatformcode-held-languages-state", () => ({ useHeldLanguages: () => ({ error: hold.error, noOwnVault: hold.noOwnVault }) }));
vi.mock("./LanguagesCard", () => ({ LanguagesCard: ({ state }: { state: { error: string | null; notice?: string | null } }) => (
    <div>
      <p data-testid="card-error">{state.error}</p>
      <p data-testid="card-notice">{state.notice ?? ""}</p>
    </div>
  ) }));

// eslint-disable-next-line import/first
import { LanguageSection } from "./index";

const props = { vaultId: "https://v.platform.example.test/base", principal: null, recordEntityUri: "https://v.platform.example.test/base/e/o1", contactTag: "", writeContact: null };
afterEach(() => {
  cleanup();
  hold.noOwnVault = false;
  hold.error = "";
});

describe("Languages: no sentence about the holder's card any more", () => {
  it("a reader is shown the Languages group with no notice and no holder-card sentence", () => {
    hold.error = null;
    render(<LanguageSection {...props} canEdit={false} />);
    expect(screen.getByTestId("card-notice").textContent).toBe("");
    expect(screen.getByTestId("card-error").textContent).toBe("");
    expect(document.body.textContent).not.toMatch(/kept by the holder|no source|nothing is kept|no card of its holder/);
  });
  it("a writer with an own vault is shown the group the same way", () => {
    hold.error = null;
    render(<LanguageSection {...props} canEdit />);
    expect(screen.getByTestId("card-error").textContent).toBe("");
    expect(screen.getByTestId("card-notice").textContent).toBe("");
  });
  it("a writer with NO own vault is shown no Languages group at all (no raw text, no add); the card says why once beside the name", () => {
    hold.error = null;
    hold.noOwnVault = true;
    render(<LanguageSection {...props} canEdit />);
    expect(screen.queryByTestId("card-error")).toBeNull();
    expect(document.body.textContent).toBe("");
  });
  it("a READER with no own vault still sees the group (they add nothing; the platform decides what they read)", () => {
    hold.error = null;
    hold.noOwnVault = true;
    render(<LanguageSection {...props} canEdit={false} />);
    expect(screen.getByTestId("card-error").textContent).toBe("");
    expect(screen.getByTestId("card-notice").textContent).toBe("");
  });
  it("any error is shown as it is, to a reader too", () => {
    hold.error = "Could not read your languages: 503";
    render(<LanguageSection {...props} canEdit={false} />);
    expect(screen.getByTestId("card-error").textContent).toBe("Could not read your languages: 503");
  });
});
