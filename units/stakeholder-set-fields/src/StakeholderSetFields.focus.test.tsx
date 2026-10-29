// A relation (Represents, Member of): after the pick from "Add information" the record finder's box has the focus.
// The harness is the one of StakeholderSetFields.look.test.tsx.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import type { CardField } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { StakeholderSetFields } from "./StakeholderSetFields";
import { AddInformationSheet, addInformation } from "../test/chooser";

// The app read its ontology origin as a constant; the unit reads the setting at call time, and the finder reads the reference reading from it.
beforeEach(() => setTermOrigin("https://ontology.example.test"));
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

const field = (name: string, label: string, over: Partial<CardField> = {}): CardField & { shownBecause: string | null } => ({
  term: `https://ontology.example.test/base/t/${name}`,
  label,
  factKeys: [name.charAt(0).toLowerCase() + name.slice(1)],
  slug: null,
  writeKey: `a:${name.charAt(0).toLowerCase() + name.slice(1)}`,
  mode: "shown",
  rule: null,
  shownBecause: "test",
  many: true,
  ...over,
});
const ACTS = field("ActsOnBehalfOf", "Acts-On-Behalf-Of");


describe("a relation: after the pick from + Add information the cursor is in the record finder's box", () => {
  it("Represents: the finder box has the focus", async () => {
    const g0 = { ...ACTS };
    render(
      <QueryClientProvider client={new QueryClient()}>
        <CardModeProvider canEdit startEditing>
          <CardModeBar />
          <StakeholderSetFields only="relations" fields={[{ ...g0, mode: "reference-add", rule: "member-of" as never, shownBecause: null }]} facts={{} as never} fieldSets={{} as never} canEdit holdingVault="https://v/vault" agent="a" carrier="https://v/e/1" vaultId="v" />
          <AddInformationSheet />
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await addInformation("Represents");
    const g = screen.getByRole("region", { name: "Represents" });
    expect(document.activeElement).toBe(within(g).getByRole("textbox"));
  });
});
