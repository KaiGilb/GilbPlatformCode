// The card's look of the relation fields: a relation shows under a human label with a one-line meaning, is hidden in presentation when
// empty, and each relation is a titled frame whose rows are the group's members.
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
const MEMBER = field("MemberOf", "Member-Of");
const LEGAL = field("LegalRepresentative", "Legal Representative");

function view(facts: Record<string, unknown>, fields = [ACTS, MEMBER, LEGAL], edit = false) {
  return render(
    <QueryClientProvider client={new QueryClient()}>
      <CardModeProvider canEdit startEditing={edit}>
        <CardModeBar />
        <StakeholderSetFields only="relations" fields={fields} facts={facts as never} fieldSets={{} as never} canEdit={false} holdingVault={null} agent={null} carrier={null} vaultId="v" />
        <AddInformationSheet />
      </CardModeProvider>
    </QueryClientProvider>,
  );
}

describe("a relation in presentation", () => {
  it("shows Acts-on-behalf-of as 'Represents', with its one-line meaning, and not under the master's hyphenated name", () => {
    view({ actsOnBehalfOf: "Ann Berg" });
    const g = screen.getByRole("region", { name: "Represents" });
    expect(within(g).getByText(/Acts or speaks for another party: a lawyer for a client/)).toBeTruthy();
    expect(g.querySelector("svg[data-card-icon='represents']")).toBeTruthy();
    expect(within(g).getByText("Ann Berg")).toBeTruthy();
    expect(screen.queryByText(/Acts-On-Behalf-Of/i)).toBeNull();
  });

  it("a relation with no value is NOT drawn at all (no heading, no '—', no 'None yet')", () => {
    view({});
    expect(screen.queryByRole("region")).toBeNull();
    expect(screen.queryByText(/None yet/)).toBeNull();
    expect(screen.queryByText("—")).toBeNull();
  });

  it("each relation is its OWN frame with its own title, the values listed inside it", () => {
    view({ actsOnBehalfOf: ["Ann Berg", "Ben Hayes"], memberOf: "Club One" });
    const rep = screen.getByRole("region", { name: "Represents" });
    const mem = screen.getByRole("region", { name: "Member of" });
    expect(within(rep).getAllByTestId("stakeholder-link")).toHaveLength(2);
    expect(within(mem).getAllByTestId("stakeholder-link")).toHaveLength(1);
    // a name belongs to ONE frame
    expect(within(mem).queryByText("Ann Berg")).toBeNull();
    expect(within(rep).queryByText("Club One")).toBeNull();
  });

  it("a term with no human copy keeps the master's label as its title", () => {
    view({ legalRepresentative: "Ann" });
    expect(screen.getByRole("region", { name: "Legal Representative" })).toBeTruthy();
  });

  it("an empty relation is not drawn in edit mode either; the chooser (when the card may add to it) draws it with its meaning", async () => {
    view({}, [ACTS], true);
    expect(screen.queryByRole("region", { name: "Represents" })).toBeNull();
    const g0 = { ...ACTS };
    cleanup();
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
    expect(within(g).getByText(/Acts or speaks for another party/)).toBeTruthy();
    expect(within(g).getByText("None yet.")).toBeTruthy();
    expect(within(g).getByRole("textbox")).toBeTruthy();
  });
});
