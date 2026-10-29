// The card group with and without the one card. With no OneCardProvider above it, a group draws as it did before
// (children only, hidden when empty in presentation). Inside one it draws the rows of the person beside the holder's.
import type { ReactNode } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { OneCardProvider, type OneCardView } from "@kaigilb/gilbplatformcode-one-card-context";
import type { OneCardGroup, OneCardRow } from "@kaigilb/gilbplatformcode-one-card-merge";
import { CardGroup, CardTopSlots } from "./index";

afterEach(cleanup);

const row = (value: string, source: "theirs" | "yours", extra: Partial<OneCardRow> = {}): OneCardRow => ({
  field: "a:email",
  value,
  source,
  editable: source === "yours",
  ...extra,
});
const group = (rows: OneCardRow[], extra: Partial<OneCardGroup> = {}): OneCardGroup => ({
  field: "a:email",
  term: "https://master.example/base/t/email",
  label: "Email",
  known: true,
  many: true,
  bothKept: false,
  rows,
  ...extra,
});
const viewOf = (groups: OneCardGroup[], over: Partial<OneCardView> = {}): OneCardView => ({
  marks: true,
  byKind: new Map([["email", { kind: "email", groups }]]),
  own: [],
  rowLabel: () => null,
  valueText: (r) => r.value,
  ...over,
});

const card = (view: OneCardView | null | undefined, node: ReactNode, editing = false) => (
  <CardModeProvider canEdit startEditing={editing}>
    {view === undefined ? node : <OneCardProvider view={view}>{node}</OneCardProvider>}
  </CardModeProvider>
);
const mine = <div data-testid="mine">my editor</div>;
const theirs = group([row("ann@example.test", "theirs")]);

describe("outside a OneCardProvider the group draws as before", () => {
  it("draws its children and no row of theirs", () => {
    render(card(undefined, <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.getByTestId("mine")).toBeTruthy();
    expect(screen.queryByTestId("one-card-row")).toBeNull();
    expect(screen.queryByTestId("one-card-both-kept")).toBeNull();
  });
  it("is not drawn when empty in presentation", () => {
    render(card(undefined, <CardGroup kind="email" title="Email" empty>{mine}</CardGroup>));
    expect(screen.queryByTestId("card-group")).toBeNull();
  });
  it("draws children then addOwn", () => {
    render(card(undefined, <CardGroup kind="email" title="Email" addOwn={<i data-testid="add" />}>{mine}</CardGroup>));
    const items = screen.getByTestId("card-group-items");
    expect([...items.children].map((c) => c.getAttribute("data-testid"))).toEqual(["mine", "add"]);
  });
  it("is the same under a provider given null", () => {
    render(card(null, <CardGroup kind="email" title="Email" empty>{mine}</CardGroup>));
    expect(screen.queryByTestId("card-group")).toBeNull();
  });
});

describe("inside a OneCardProvider", () => {
  it("draws the rows of theirs first, then the group's own children, then addOwn", () => {
    render(card(viewOf([theirs]), <CardGroup kind="email" title="Email" addOwn={<i data-testid="add" />}>{mine}</CardGroup>));
    const items = screen.getByTestId("card-group-items");
    expect([...items.children].map((c) => c.getAttribute("data-testid"))).toEqual(["one-card-row", "mine", "add"]);
    expect(screen.getByTestId("one-card-row-value").textContent).toBe("ann@example.test");
  });
  it("asks the view for the row's label and the value's wording", () => {
    const seen: string[] = [];
    const view = viewOf([theirs], {
      rowLabel: (kind, g) => {
        seen.push(`${kind}|${g.field}`);
        return "Work";
      },
      valueText: (r) => `<${r.value}>`,
    });
    render(card(view, <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(seen).toContain("email|a:email");
    expect(screen.getByTestId("one-card-row-label").textContent).toBe("Work");
    expect(screen.getByTestId("one-card-row-value").textContent).toBe("<ann@example.test>");
  });
  it("draws no row of theirs for another kind", () => {
    render(card(viewOf([theirs]), <CardGroup kind="phone" title="Phone">{mine}</CardGroup>));
    expect(screen.queryByTestId("one-card-row")).toBeNull();
    expect(screen.getByTestId("mine")).toBeTruthy();
  });
  it("draws one block per merged group", () => {
    const two = [group([row("a@example.test", "theirs")]), group([row("b@example.test", "theirs")], { field: "a:email2" })];
    render(card(viewOf(two), <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.getAllByTestId("one-card-row")).toHaveLength(2);
  });
  it("draws a group that is empty of its own while it has a row of theirs", () => {
    render(card(viewOf([theirs]), <CardGroup kind="email" title="Email" empty>{mine}</CardGroup>));
    expect(screen.getByTestId("card-group")).toBeTruthy();
    expect(screen.getByTestId("one-card-row")).toBeTruthy();
  });
  it("still hides an empty group that has no row of theirs", () => {
    const onlyMine = group([row("me@example.test", "yours")]);
    render(card(viewOf([onlyMine]), <CardGroup kind="email" title="Email" empty>{mine}</CardGroup>));
    expect(screen.queryByTestId("card-group")).toBeNull();
  });
  it("leaves the own children out while presented when the own side is empty under rows of theirs", () => {
    render(card(viewOf([theirs]), <CardGroup kind="email" title="Email" empty>{mine}</CardGroup>));
    expect(screen.queryByTestId("mine")).toBeNull();
  });
  it("draws the own children in edit even when the own side is empty", () => {
    render(card(viewOf([theirs]), <CardGroup kind="email" title="Email" empty>{mine}</CardGroup>, true));
    expect(screen.getByTestId("mine")).toBeTruthy();
    expect(screen.getByTestId("one-card-row")).toBeTruthy();
  });
  it("draws the own children while presented when the own side is not empty", () => {
    render(card(viewOf([theirs]), <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.getByTestId("mine")).toBeTruthy();
  });
  it("draws the both-kept line after the own children and before addOwn, only for a both-kept group", () => {
    const kept = group([row("ann@example.test", "theirs")], { bothKept: true });
    render(card(viewOf([kept]), <CardGroup kind="email" title="Email" addOwn={<i data-testid="add" />}>{mine}</CardGroup>));
    const items = screen.getByTestId("card-group-items");
    expect([...items.children].map((c) => c.getAttribute("data-testid"))).toEqual(["one-card-row", "mine", "one-card-both-kept", "add"]);
  });
  it("draws no both-kept line when no group is both-kept", () => {
    render(card(viewOf([theirs]), <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.queryByTestId("one-card-both-kept")).toBeNull();
  });
  it("passes the view's marks to the rows: the chain link's words only with marks", () => {
    const { rerender } = render(card(viewOf([theirs]), <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.getByTestId("one-card-row").innerHTML).toContain("From their online card");
    rerender(card(viewOf([theirs], { marks: false }), <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.getByTestId("one-card-row").innerHTML).not.toContain("From their online card");
  });
  it("tells TheirRows when the card is being edited", () => {
    const shared = group([row("ann@example.test", "theirs", { rung: "public", rungWords: "everyone" })]);
    render(card(viewOf([shared]), <CardGroup kind="email" title="Email">{mine}</CardGroup>, true));
    expect(screen.getByTestId("one-card-row-why").textContent).toContain("only they can change this");
    cleanup();
    render(card(viewOf([shared]), <CardGroup kind="email" title="Email">{mine}</CardGroup>));
    expect(screen.getByTestId("one-card-row-why").textContent).not.toContain("only they can change this");
  });
});

describe("CardTopSlots", () => {
  it("draws nothing with no slots, or with only a nameAside", () => {
    expect(render(<CardTopSlots />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<CardTopSlots slots={{ nameAside: <b /> }} />).container.innerHTML).toBe("");
  });
  it("draws my note then where we met, each in its own slot", () => {
    render(<CardTopSlots slots={{ howWeMet: <b>met</b>, myNote: <i>note</i> }} />);
    const strip = screen.getByTestId("card-top-slots");
    expect([...strip.children].map((c) => c.getAttribute("data-card-slot"))).toEqual(["my-note", "how-we-met"]);
  });
  it("draws only the slot that is given", () => {
    render(<CardTopSlots slots={{ myNote: <i>note</i> }} />);
    const strip = screen.getByTestId("card-top-slots");
    expect([...strip.children].map((c) => c.getAttribute("data-card-slot"))).toEqual(["my-note"]);
  });
});
