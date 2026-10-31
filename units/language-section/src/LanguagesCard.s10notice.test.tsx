// @vitest-environment jsdom
// Ported from the source's `LanguagesCard.s10notice.test.tsx` (2 cases). Re-based: the units' own paths, the chooser stand-in (test/chooser.tsx), the example host.
// Cycle214 s10 organization card FIX — Agent.Tester F7: a NOTICE is a neutral sentence, not an alert: the group stays drawn in presentation
// when it has no rows, the sentence is not role="alert" and is not drawn in the error colour.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { LanguagesCard } from "./index";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { LanguagesState } from "@kaigilb/gilbplatformcode-held-languages-state";

const ok = async () => true;
const state = (over: Partial<LanguagesState>): LanguagesState => ({ rows: [], loading: false, error: null, contactTag: "", hasRungs: false, errorFor: () => null, savingFor: () => false, add: ok, listLegacy: ok, remove: ok, setFlag: ok, markContact: ok, clearContact: ok, ...over });
afterEach(() => cleanup());

describe("LanguagesCard notice", () => {
  it("draws the notice neutrally and keeps the group in presentation", () => {
    render(
      <CardModeProvider canEdit={false}>
        <LanguagesCard state={state({ notice: "These languages are kept by the holder." })} editMode={false} />
      </CardModeProvider>,
    );
    const n = screen.getByTestId("languages-notice");
    expect(n.textContent).toBe("These languages are kept by the holder.");
    expect(n.getAttribute("role")).toBeNull();
    expect(n.className).not.toMatch(/--bad/);
  });
  it("an error wins over a notice and is the alert", () => {
    render(
      <CardModeProvider canEdit={false}>
        <LanguagesCard state={state({ notice: "n", error: "boom" })} editMode={false} />
      </CardModeProvider>,
    );
    expect(screen.getByTestId("languages-read-error").getAttribute("role")).toBe("alert");
    expect(screen.queryByTestId("languages-notice")).toBeNull();
  });
});
