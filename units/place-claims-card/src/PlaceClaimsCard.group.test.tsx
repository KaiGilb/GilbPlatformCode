// @vitest-environment jsdom
// Ported from GilbApp `PlaceClaimsCard.s8cardlook.test.tsx` (the 2 of 4 H15f left: the framed group, and the empty group with the chooser), `PlaceClaimsCard.s10iter1focus.test.tsx` (2) and
// `PlaceClaimsCard.flags.s130.agenttester.test.tsx` (the legacy-address case): the card's group in its two modes and the cursor after the chooser's pick.
// Changed from the source: the chooser's sheet is `add-information`; the catalogue is the fake platform of `../test/world.ts`; `canAdd` and `readState` are the card's new props (below).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import axeCore from "axe-core";
import { AddInformationSheet } from "@kaigilb/gilbplatformcode-add-information";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { OneCardProvider, type OneCardView } from "@kaigilb/gilbplatformcode-one-card-context";
import type { OneCardGroup } from "@kaigilb/gilbplatformcode-one-card-merge";
import { PlaceClaimsCard, READING_NOTE, incompleteNote, NO_VAULT_NOTE } from "./index";
import { claim, field, noop } from "../test/support2";
import { GEO } from "../test/ported";
import { useWorld } from "../test/world";
import type { PlaceClaim } from "@kaigilb/gilbplatformcode-place-claims";

vi.mock("@kaigilb/gilbplatformcode-term-slots", () => ({
  attributeSpelling: vi.fn(async (name: string) => name),
  typeSpelling: vi.fn(async (name: string) => `t:${name}`),
  attributeLabel: vi.fn(async () => null),
}));
useWorld();
afterEach(cleanup);
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn();
});
const axe = (node: Element) => axeCore.run(node, { rules: { "color-contrast": { enabled: false } } });

const HOME = claim("c-home", "home", [
  field("c-home", { id: "h-street", subject: "street", streetLine: "Storgata 1" }),
  field("c-home", { id: "h-no", subject: "place", placeId: `${GEO}/no` }),
]);
const WORK = claim("c-work", "work", [field("c-work", { id: "w-street", subject: "street", streetLine: "Kongens gate 2" })]);
const card = (claims: PlaceClaim[], over: Partial<Parameters<typeof PlaceClaimsCard>[0]> = {}) => (
  <CardModeProvider canEdit>
    <CardModeBar />
    <PlaceClaimsCard title="Postal Address" claims={claims} editMode onSave={noop} onAmend={noop} onRemove={noop} {...over} />
    <AddInformationSheet />
  </CardModeProvider>
);
const chooser = async (label: string) => {
  await userEvent.click(screen.getByTestId("card-add-info"));
  await userEvent.click(within(screen.getByTestId("add-information-sheet")).getByRole("button", { name: label }));
};
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");

describe("Postal address in the card's two modes", () => {
  it("presentation: each address is its heading and compact lines in ONE framed group; no (-), no add row", async () => {
    render(card([HOME, WORK]));
    const g = screen.getByRole("region", { name: "Postal Address" });
    expect(g.querySelector("svg[data-card-icon='address']")).toBeTruthy();
    expect(within(g).getAllByTestId("place-claim")).toHaveLength(2);
    expect(within(g).getByRole("heading", { name: "home" })).toBeTruthy();
    await waitFor(() => expect(within(g).getByText("Storgata 1")).toBeTruthy());
    expect(document.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(screen.queryByTestId("address-add")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    // addresses are separated by a hairline inside the frame, not by a second frame each
    expect(screen.getByTestId("place-claims-list").className).toMatch(/\[&>\*\+\*\]:border-t/);
    expect(within(g).getAllByTestId("place-claim")[0]!.className).not.toMatch(/rounded-2xl/);
    expect((await axe(g)).violations).toEqual([]);
  });

  it("with no address the group is not drawn; the chooser adds it with 'Add Postal Address'", async () => {
    render(card([]));
    expect(screen.queryByTestId("address-rows")).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.queryByTestId("address-rows")).toBeNull();
    await chooser("Postal Address");
    // the pick presses "Add Postal Address" for the person: the form is open with the cursor in its first field
    expect(screen.queryByTestId("address-add")).toBeNull();
    expect(document.activeElement).toBe(screen.getByPlaceholderText(/home, work, cabin/));
  });
});

describe("s10 iter1: after the pick from + Add information the cursor is in the first field", () => {
  it("the add form is open and the cursor is in its first field, the Location box", async () => {
    render(card([]));
    await userEvent.click(screen.getByTestId("card-edit"));
    await chooser("Postal Address");
    const first = screen.getByPlaceholderText(/home, work, cabin/);
    expect(document.activeElement).toBe(first);
    const form = first.closest("div.flex.flex-col.gap-3")!;
    expect(form.querySelector("input")).toBe(first);
    await userEvent.keyboard("cabin");
    expect((first as HTMLInputElement).value).toBe("cabin");
  });

  it("no focus on loading: a card with an address, or none, focuses nothing", () => {
    render(card([HOME]));
    expect(document.activeElement).toBe(document.body);
  });
});

describe("a record's one-string legacy address", () => {
  it("is shown as it is stored, draws no flag and asks the catalogue nothing", async () => {
    render(<PlaceClaimsCard title="Postal Address" legacyText="Storgata 9, 0155 Oslo, Norway" claims={[]} editMode={false} onSave={noop} onAmend={noop} onRemove={noop} />);
    await screen.findByText("Storgata 9, 0155 Oslo, Norway");
    expect(document.querySelectorAll('[data-testid="flag-image"]')).toHaveLength(0);
  });
});

describe("what the read came to (F1-F4), as the card draws it", () => {
  const plain = (readState: NonNullable<Parameters<typeof PlaceClaimsCard>[0]["readState"]>, claims: PlaceClaim[] = [], over = {}) =>
    render(<PlaceClaimsCard title="Postal Address" claims={claims} readState={readState} editMode onSave={noop} onAmend={noop} onRemove={noop} {...over} />);

  it("no vault, reading and incomplete each have their own line, and none is the line of another", () => {
    const { rerender } = plain({ status: "no-vault" });
    expect(screen.getByTestId("place-claims-no-vault").textContent).toBe(NO_VAULT_NOTE);
    rerender(<PlaceClaimsCard title="Postal Address" claims={[]} readState={{ status: "reading" }} editMode onSave={noop} onAmend={noop} onRemove={noop} />);
    expect(screen.getByTestId("place-claims-reading").textContent).toBe(READING_NOTE);
    expect(screen.queryByTestId("place-claims-no-vault")).toBeNull();
    rerender(<PlaceClaimsCard title="Postal Address" claims={[]} readState={{ status: "incomplete", reason: "capped", vaultName: "Hytta" }} editMode onSave={noop} onAmend={noop} onRemove={noop} />);
    expect(screen.getByTestId("place-claims-incomplete").textContent).toBe(incompleteNote("capped", "Hytta"));
    expect(screen.queryByTestId("place-claims-reading")).toBeNull();
  });

  it("while reading with addresses already on screen, nothing is said about reading", () => {
    plain({ status: "reading" }, [HOME]);
    expect(screen.queryByTestId("place-claims-reading")).toBeNull();
  });

  it("a failed read with no sentence given draws the fixed one; with one given, that one, once", () => {
    const { rerender } = plain({ status: "failed" });
    expect(screen.getAllByTestId("place-claims-error")).toHaveLength(1);
    expect(screen.getByTestId("place-claims-error").textContent).toMatch(/The addresses could not be read right now\. This is not a statement that there are none\./);
    rerender(<PlaceClaimsCard title="Postal Address" claims={[]} readState={{ status: "failed" }} error="mine" editMode onSave={noop} onAmend={noop} onRemove={noop} />);
    expect(screen.getAllByTestId("place-claims-error")).toHaveLength(1);
    expect(screen.getByTestId("place-claims-error").textContent).toBe("mine");
  });

  it("canAdd=false withholds '+ Add' and '+ Add your own'", () => {
    plain({ status: "ready" }, [], { canAdd: false });
    expect(screen.queryByTestId("address-add")).toBeNull();
    cleanup();
    plain({ status: "ready" }, [], {});
    expect(screen.getByTestId("address-add")).toBeTruthy();
    expect(fireEvent).toBeTruthy();
  });

  it("the group is drawn in every state that is not 'ready', even with nothing listed", () => {
    for (const status of ["no-vault", "reading", "failed", "incomplete"] as const) {
      const { container, unmount } = render(
        <CardModeProvider canEdit>
          <PlaceClaimsCard title="Postal Address" claims={[]} readState={{ status }} editMode={false} onSave={noop} onAmend={noop} onRemove={noop} />
        </CardModeProvider>,
      );
      expect(container.querySelector("section[data-group='address']"), status).toBeTruthy();
      unmount();
    }
  });

  it("canAdd=false also withholds '+ Add your own' on the one card", async () => {
    const THEIRS: OneCardGroup = {
      field: "a:postalAddress",
      term: "https://id.example.test/base/a/postalAddress",
      label: "Postal Address",
      known: true,
      many: true,
      bothKept: false,
      rows: [{ field: "a:postalAddress", value: "Storgata 1, Oslo", source: "theirs", rung: "public", rungWords: "Public", editable: false }],
    };
    const VIEW: OneCardView = { marks: true, byKind: new Map([["address", { kind: "address", groups: [THEIRS] }]]), own: [], rowLabel: () => null, valueText: (r) => r.value };
    const withOneCard = (canAdd: boolean) => (
      <CardModeProvider canEdit>
        <OneCardProvider view={VIEW}>
          <PlaceClaimsCard title="Postal Address" claims={[]} editMode addInPlace canAdd={canAdd} onSave={noop} onAmend={noop} onRemove={noop} />
        </OneCardProvider>
      </CardModeProvider>
    );
    const { unmount } = render(withOneCard(true));
    expect(await screen.findByTestId("add-own")).toBeTruthy();
    unmount();
    render(withOneCard(false));
    await screen.findByText(/Storgata 1, Oslo/);
    expect(screen.queryByTestId("add-own")).toBeNull();
  });

  it("a stalled read is worded as such, and a capped one is not", () => {
    const { rerender } = plain({ status: "incomplete", reason: "stalled", vaultName: "Hytta" });
    expect(screen.getByTestId("place-claims-incomplete").textContent).toBe("Not every address in Hytta could be read: the read could not go on.");
    rerender(<PlaceClaimsCard title="Postal Address" claims={[]} readState={{ status: "incomplete", reason: "capped", vaultName: "Hytta" }} editMode onSave={noop} onAmend={noop} onRemove={noop} />);
    expect(screen.getByTestId("place-claims-incomplete").textContent).toBe("Not every address in Hytta was read.");
  });

  it("an address of yours that the merge folded into a row of theirs is not drawn again while the card is presented, and is drawn in edit", async () => {
    const THEIRS: OneCardGroup = {
      field: "a:postalAddress",
      term: "https://id.example.test/base/a/postalAddress",
      label: "Postal Address",
      known: true,
      many: true,
      bothKept: false,
      rows: [{ field: "a:postalAddress", value: "Storgata 1", source: "theirs", rung: "public", rungWords: "Public", editable: false, sameAsTheirs: true, claims: [HOME.uri] }],
    };
    const VIEW: OneCardView = { marks: true, byKind: new Map([["address", { kind: "address", groups: [THEIRS] }]]), own: [], rowLabel: () => null, valueText: (r) => r.value };
    render(
      <CardModeProvider canEdit>
        <CardModeBar />
        <OneCardProvider view={VIEW}>
          <PlaceClaimsCard title="Postal Address" claims={[HOME, WORK]} editMode onSave={noop} onAmend={noop} onRemove={noop} />
        </OneCardProvider>
      </CardModeProvider>,
    );
    await waitFor(() => expect(screen.getAllByTestId("place-claim")).toHaveLength(1));
    expect(screen.getByRole("heading", { name: "work" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "home" })).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    await waitFor(() => expect(screen.getAllByTestId("place-claim")).toHaveLength(2));
  });
});
