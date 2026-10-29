// The kind-of-contact chips. Every expected value is a literal.
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ContactKindChip, ContactKindChips } from "./ContactKindChips";
import type { CatalogueEntry, ContactChip } from "@kaigilb/gilbplatformcode-contact-kind-model";

const chip = (over: Partial<ContactChip>): ContactChip => ({ key: "k", axis: "relationshipKind", entryId: "e", label: "Friend", tone: "neutral", claimId: "c", ...over });
const CHIPS: ContactChip[] = [
  chip({ key: "a", axis: "circleLabel", label: "Personal · 1st Connection", tone: "personal" }),
  chip({ key: "b", axis: "circleLabel", label: "Professional · Inner Circle", tone: "professional" }),
  chip({ key: "c", label: "Friend" }),
];
const entry = (id: string, label: string, axis: CatalogueEntry["axis"]): CatalogueEntry => ({ id, label, order: 1, playableBy: [], axis, own: false });
const OFFERED = {
  circleLabel: [entry("p1", "Personal · 1st Connection", "circleLabel"), entry("p2", "Professional · Inner Circle", "circleLabel")],
  relationshipKind: [entry("k1", "Customer", "relationshipKind"), entry("k2", "Friend", "relationshipKind")],
};
const HELP = "A label for you only: what kind of contact this is. It gives them no access to anything.";

describe("presentation", () => {
  it("draws the chips as text in MyNet's words (no middle dot), coloured by tone, with no (−) and no add", () => {
    render(<ContactKindChips chips={CHIPS} meaning="label" help={HELP} editing={false} onRemove={() => {}} offered={OFFERED} onAdd={() => {}} />);
    const chips = screen.getAllByTestId("contact-kind-chip");
    expect(chips.map((c) => c.textContent)).toEqual(["Personal 1st Connection", "Professional Inner Circle", "Friend"]);
    expect(chips.map((c) => c.getAttribute("data-tone"))).toEqual(["personal", "professional", "neutral"]);
    expect(screen.queryAllByRole("button", { name: /^Remove / })).toEqual([]);
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
    expect(screen.queryByTestId("contact-kind-help")).toBeNull();
  });
  it("every chip says what it means in this app, as its tooltip", () => {
    render(<ContactKindChips chips={CHIPS} meaning="label" help={HELP} editing={false} />);
    for (const c of screen.getAllByTestId("contact-kind-chip")) {
      expect(c.getAttribute("title")).toBe(HELP);
      expect(c.getAttribute("data-meaning")).toBe("label");
    }
  });
  it("the same chips mean access in the other app: the adapter says so, the look is the same", () => {
    render(<ContactKindChips chips={CHIPS} meaning="access" help="Who may see what." editing={false} />);
    expect(screen.getAllByTestId("contact-kind-chip")[0]!.getAttribute("data-meaning")).toBe("access");
    expect(screen.getAllByTestId("contact-kind-chip")[0]!.getAttribute("title")).toBe("Who may see what.");
  });
  it("draws nothing for no chips, and nothing while they are not read", () => {
    const { container, rerender } = render(<ContactKindChips chips={[]} meaning="label" editing={false} />);
    expect(container.firstChild).toBeNull();
    rerender(<ContactKindChips chips={null} meaning="label" editing={false} />);
    expect(container.firstChild).toBeNull();
  });
  it("still says a true thing when there is one (a list that may not be whole)", () => {
    render(<ContactKindChips chips={[]} meaning="label" editing={false} note="The list of kinds may not be whole." />);
    expect(screen.getByTestId("contact-kind-note").textContent).toBe("The list of kinds may not be whole.");
  });
});

describe("one chip, drawn by either app's adapter", () => {
  it("takes the adapter's own test id, data attributes and text colour (MyNet's placement chips keep theirs)", () => {
    render(<ContactKindChip chip={CHIPS[1]!} meaning="access" testId="contact-card-placement-chip" data={{ "data-context": "professional", "data-depth": "close-circle" }} textClass="text-ink" />);
    const c = screen.getByTestId("contact-card-placement-chip");
    expect(c.textContent).toBe("Professional Inner Circle");
    expect(c.getAttribute("data-context")).toBe("professional");
    expect(c.getAttribute("data-depth")).toBe("close-circle");
    expect(c.className).toContain("text-ink");
  });
});

describe("edit mode", () => {
  it("gives each chip MyNet's red round (−) named for it, and says what a chip means, under the chips", () => {
    const onRemove = vi.fn();
    render(<ContactKindChips chips={CHIPS} meaning="label" help={HELP} editing onRemove={onRemove} offered={OFFERED} onAdd={() => {}} />);
    expect(screen.getAllByRole("button", { name: /^Remove / }).map((b) => b.getAttribute("aria-label"))).toEqual(["Remove Personal 1st Connection", "Remove Professional Inner Circle", "Remove Friend"]);
    expect(screen.getByTestId("contact-kind-help").textContent).toBe(HELP);
    fireEvent.click(screen.getByRole("button", { name: "Remove Friend" }));
    expect(onRemove).toHaveBeenCalledWith(CHIPS[2]);
  });
  it("opens the chooser from '+ Kind': circle labels, then kinds; a pick is handed to the adapter and the chooser closes", () => {
    const onAdd = vi.fn();
    render(<ContactKindChips chips={[]} meaning="label" help={HELP} editing offered={OFFERED} onAdd={onAdd} />);
    fireEvent.click(screen.getByTestId("contact-kind-add"));
    const dlg = screen.getByRole("dialog", { name: "Add a kind of contact" });
    expect(within(dlg).getAllByRole("heading").map((h) => h.textContent)).toEqual(["Kind of contact", "Circle", "Kind of relationship"]);
    expect(within(dlg).getAllByTestId("contact-kind-option").map((o) => o.textContent)).toEqual(["Personal 1st Connection", "Professional Inner Circle", "Customer", "Friend"]);
    expect(within(dlg).getByTestId("contact-kind-chooser-help").textContent).toBe(HELP);
    fireEvent.click(within(dlg).getByRole("button", { name: "Customer" }));
    expect(onAdd).toHaveBeenCalledWith(OFFERED.relationshipKind[0]);
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("the chooser's search narrows both lists, Escape closes it, and an empty answer says so", () => {
    render(<ContactKindChips chips={[]} meaning="label" editing offered={OFFERED} onAdd={() => {}} />);
    fireEvent.click(screen.getByTestId("contact-kind-add"));
    const dlg = screen.getByRole("dialog");
    fireEvent.change(within(dlg).getByRole("searchbox"), { target: { value: "inner" } });
    expect(within(dlg).getAllByTestId("contact-kind-option").map((o) => o.textContent)).toEqual(["Professional Inner Circle"]);
    fireEvent.change(within(dlg).getByRole("searchbox"), { target: { value: "zzz" } });
    expect(within(dlg).getByTestId("contact-kind-none").textContent).toBe("Nothing matches.");
    fireEvent.keyDown(within(dlg).getByRole("searchbox"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
  it("draws no '+' when there is nothing left to offer", () => {
    render(<ContactKindChips chips={CHIPS} meaning="label" editing offered={{ circleLabel: [], relationshipKind: [] }} onAdd={() => {}} />);
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
  });
  it("a busy card cannot add or remove again until the act has finished", () => {
    render(<ContactKindChips chips={CHIPS} meaning="label" editing busy offered={OFFERED} onAdd={() => {}} onRemove={() => {}} />);
    expect((screen.getByTestId("contact-kind-add") as HTMLButtonElement).disabled).toBe(true);
    for (const b of screen.getAllByRole("button", { name: /^Remove / })) expect((b as HTMLButtonElement).disabled).toBe(true);
  });
});

// The chooser COVERS the card, so a statement about its lists is said inside it.
describe("the chooser says what is true about its lists", () => {
  it("a note about the lists is inside the chooser dialog, where the person is choosing", () => {
    const NOTE = "Showing 500 of 530 of your own kinds. The search looks only in these.";
    render(<ContactKindChips chips={CHIPS} meaning="label" help={HELP} editing offered={OFFERED} onAdd={() => {}} note={NOTE} />);
    fireEvent.click(screen.getByTestId("contact-kind-add"));
    const dialog = screen.getByTestId("contact-kind-chooser");
    expect(within(dialog).getByTestId("contact-kind-chooser-note").textContent).toBe(NOTE);
  });
  it("no note, none drawn", () => {
    render(<ContactKindChips chips={CHIPS} meaning="label" help={HELP} editing offered={OFFERED} onAdd={() => {}} />);
    fireEvent.click(screen.getByTestId("contact-kind-add"));
    expect(screen.queryByTestId("contact-kind-chooser-note")).toBeNull();
  });
});
