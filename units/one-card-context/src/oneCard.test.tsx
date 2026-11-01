// The one card's context and its pure helpers, pinned alone: no provider, a provider, each hook, the merge input, the placing of
// merged groups and the own field row. The merge is the real `mergeOneCard` of one-card-merge.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, renderHook, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { parseOnlineCard } from "@kaigilb/gilbplatformcode-online-card";
import type { OneCardField, OneCardGroup, OneCardRow } from "@kaigilb/gilbplatformcode-one-card-merge";
import {
  OneCardProvider,
  OwnFieldRow,
  foldedInto,
  oneCardOf,
  ownMarksOf,
  placeOneCard,
  useAddInPlace,
  useFoldedClaims,
  useOneCard,
  useOneCardGroup,
  useOneCardOwn,
  type OneCardView,
} from "./index";

afterEach(cleanup);

const row = (value: string, source: "theirs" | "yours", extra: Partial<OneCardRow> = {}): OneCardRow => ({
  field: "a:email",
  value,
  source,
  editable: source === "yours",
  ...extra,
});
const group = (field: string, rows: OneCardRow[], extra: Partial<OneCardGroup> = {}): OneCardGroup => ({
  field,
  term: `https://master.example/base/t/${field}`,
  label: field,
  known: true,
  many: true,
  bothKept: false,
  rows,
  ...extra,
});

const EMAIL_THEIRS = group("a:email", [row("ann@example.test", "theirs", { sameAsTheirs: true, claims: ["c1", "c2"] }), row("other@example.test", "yours")]);
const PHONE_THEIRS = group("a:phone", [row("+47 900 12 345", "theirs")], { bothKept: true });

const viewOf = (over: Partial<OneCardView> = {}): OneCardView => ({
  marks: true,
  byKind: new Map([
    ["email", { kind: "email", groups: [EMAIL_THEIRS] }],
    ["phone", { kind: "phone", groups: [PHONE_THEIRS] }],
  ]),
  own: [],
  rowLabel: () => null,
  valueText: (r) => r.value,
  ...over,
});
const wrapWith = (view: OneCardView | null) =>
  function Wrap({ children }: { children: ReactNode }) {
    return <OneCardProvider view={view}>{children}</OneCardProvider>;
  };

describe("the context", () => {
  it("answers null with no provider, for every hook", () => {
    expect(renderHook(() => useOneCard()).result.current).toBeNull();
    expect(renderHook(() => useOneCardGroup("email")).result.current).toBeNull();
    expect(renderHook(() => useOneCardOwn("email")).result.current).toBeNull();
    expect(renderHook(() => useAddInPlace(true)).result.current).toBe(false);
    expect(renderHook(() => useFoldedClaims("email")).result.current.size).toBe(0);
  });

  it("answers null inside a provider that is given null", () => {
    expect(renderHook(() => useOneCard(), { wrapper: wrapWith(null) }).result.current).toBeNull();
    expect(renderHook(() => useOneCardGroup("email"), { wrapper: wrapWith(null) }).result.current).toBeNull();
  });

  it("hands the provider's view to useOneCard, the same object", () => {
    const view = viewOf();
    expect(renderHook(() => useOneCard(), { wrapper: wrapWith(view) }).result.current).toBe(view);
  });

  it("gives a group's theirs rows, bothKept, own marks and marks from useOneCardGroup", () => {
    const email = renderHook(() => useOneCardGroup("email"), { wrapper: wrapWith(viewOf()) }).result.current;
    expect(email).toEqual({ groups: [EMAIL_THEIRS], theirs: true, bothKept: false, ownMarks: "rows", marks: true });
    const phone = renderHook(() => useOneCardGroup("phone"), { wrapper: wrapWith(viewOf({ marks: false })) }).result.current;
    expect(phone).toEqual({ groups: [PHONE_THEIRS], theirs: true, bothKept: true, ownMarks: "rows", marks: false });
  });

  it("gives an empty group list for a kind the view does not place", () => {
    const g = renderHook(() => useOneCardGroup("language"), { wrapper: wrapWith(viewOf()) }).result.current;
    expect(g).toEqual({ groups: [], theirs: false, bothKept: false, ownMarks: "block", marks: true });
  });

  it("says theirs only when a group holds a row of theirs", () => {
    const mine = group("a:email", [row("me@example.test", "yours")]);
    const view = viewOf({ byKind: new Map([["email", { kind: "email", groups: [mine] }]]) });
    expect(renderHook(() => useOneCardGroup("email"), { wrapper: wrapWith(view) }).result.current?.theirs).toBe(false);
  });
});

describe("ownMarksOf", () => {
  it("marks each row for the per-row editors, none for the two notes, one block for the rest", () => {
    for (const k of ["name", "record", "time-zone", "details", "email", "phone", "social", "skill"]) expect(ownMarksOf(k)).toBe("rows");
    for (const k of ["my-note", "how-we-met"]) expect(ownMarksOf(k)).toBe("none");
    for (const k of ["address", "employment", "language", ""]) expect(ownMarksOf(k)).toBe("block");
  });
});

describe("foldedInto", () => {
  it("is true when a theirs row is sameAsTheirs and no yours row has the value", () => {
    const g = [group("a:email", [row("ann@example.test", "theirs", { sameAsTheirs: true })])];
    expect(foldedInto(g, "ann@example.test")).toBe(true);
    expect(foldedInto(g, "  ann@example.test ")).toBe(true);
  });
  it("is false for an empty value", () => {
    const g = [group("a:email", [row("ann@example.test", "theirs", { sameAsTheirs: true })])];
    expect(foldedInto(g, "   ")).toBe(false);
  });
  it("is false when no row is sameAsTheirs", () => {
    expect(foldedInto([group("a:email", [row("ann@example.test", "theirs")])], "ann@example.test")).toBe(false);
  });
  it("is false when a yours row of its own holds the value", () => {
    const g = [group("a:email", [row("ann@example.test", "theirs", { sameAsTheirs: true }), row("ann@example.test", "yours")])];
    expect(foldedInto(g, "ann@example.test")).toBe(false);
  });
  it("is true for no groups only when nothing is sameAsTheirs: false", () => {
    expect(foldedInto([], "x")).toBe(false);
  });
});

describe("useOneCardOwn", () => {
  it("gives the marks and a folded() that reads the kind's groups", () => {
    const own = renderHook(() => useOneCardOwn("email"), { wrapper: wrapWith(viewOf()) }).result.current!;
    expect(own.marks).toBe(true);
    expect(own.folded("ann@example.test")).toBe(true);
    expect(own.folded("other@example.test")).toBe(false);
  });
  it("narrows the groups to a term when one is given", () => {
    const term = EMAIL_THEIRS.term;
    const hit = renderHook(() => useOneCardOwn("email", term), { wrapper: wrapWith(viewOf()) }).result.current!;
    expect(hit.folded("ann@example.test")).toBe(true);
    const miss = renderHook(() => useOneCardOwn("email", "https://master.example/base/t/other"), { wrapper: wrapWith(viewOf()) }).result.current!;
    expect(miss.folded("ann@example.test")).toBe(false);
  });
  it("treats an empty term as no term", () => {
    const own = renderHook(() => useOneCardOwn("email", ""), { wrapper: wrapWith(viewOf()) }).result.current!;
    expect(own.folded("ann@example.test")).toBe(true);
  });
});

describe("useFoldedClaims", () => {
  it("collects the claims of theirs rows that are sameAsTheirs, once each", () => {
    const g = group("a:email", [
      row("a@example.test", "theirs", { sameAsTheirs: true, claims: ["c1", "c2"] }),
      row("b@example.test", "theirs", { sameAsTheirs: true, claims: ["c2", "c3"] }),
      row("c@example.test", "theirs", { claims: ["c9"] }),
      row("d@example.test", "yours", { sameAsTheirs: true, claims: ["c8"] }),
    ]);
    const view = viewOf({ byKind: new Map([["email", { kind: "email", groups: [g] }]]) });
    const set = renderHook(() => useFoldedClaims("email"), { wrapper: wrapWith(view) }).result.current;
    expect([...set].sort()).toEqual(["c1", "c2", "c3"]);
  });
  it("is empty for an unplaced kind", () => {
    expect(renderHook(() => useFoldedClaims("nope"), { wrapper: wrapWith(viewOf()) }).result.current.size).toBe(0);
  });
});

describe("useAddInPlace", () => {
  const modeWrap = (view: OneCardView | null, editing: boolean) =>
    function Wrap({ children }: { children: ReactNode }) {
      return (
        <CardModeProvider canEdit startEditing={editing}>
          <OneCardProvider view={view}>{children}</OneCardProvider>
        </CardModeProvider>
      );
    };
  it("is true on a two-source card, presented, when the holder may write", () => {
    expect(renderHook(() => useAddInPlace(true), { wrapper: modeWrap(viewOf(), false) }).result.current).toBe(true);
  });
  it("is false when the holder may not write", () => {
    expect(renderHook(() => useAddInPlace(false), { wrapper: modeWrap(viewOf(), false) }).result.current).toBe(false);
  });
  it("is false while editing", () => {
    expect(renderHook(() => useAddInPlace(true), { wrapper: modeWrap(viewOf(), true) }).result.current).toBe(false);
  });
  it("is false on a one-source card (marks false)", () => {
    expect(renderHook(() => useAddInPlace(true), { wrapper: modeWrap(viewOf({ marks: false }), false) }).result.current).toBe(false);
  });
  it("is false outside a card mode (not managed)", () => {
    expect(renderHook(() => useAddInPlace(true), { wrapper: wrapWith(viewOf()) }).result.current).toBe(false);
  });
  it("is false outside the one card", () => {
    expect(renderHook(() => useAddInPlace(true), { wrapper: modeWrap(null, false) }).result.current).toBe(false);
  });
});

describe("placeOneCard", () => {
  const card = {
    header: { name: null, nameSource: "none" as const, photo: null, photoSource: "none" as const, linked: true },
    marks: true,
    groups: [
      group("a:givenName", [row("Ann", "theirs", { field: "a:givenName" })]),
      group("a:familyName", [row("Lund", "theirs", { field: "a:familyName" })]),
      group("a:photo", [row("p", "theirs", { field: "a:photo" })]),
      group("a:hobby", [row("chess", "theirs", { field: "a:hobby" })]),
      group("a:motto", [row("mine only", "yours", { field: "a:motto" })]),
    ],
  };
  const groupOf = (g: OneCardGroup) => (g.field === "a:givenName" || g.field === "a:familyName" ? "name" : g.field === "a:photo" ? "photo" : null);

  it("places a group in its kind, in the merge's order", () => {
    const { byKind } = placeOneCard(card, groupOf);
    expect(byKind.get("name")?.groups.map((g) => g.field)).toEqual(["a:givenName", "a:familyName"]);
  });
  it("gives a field the card draws nowhere a group of its own, when it has a row of theirs", () => {
    const { byKind, own } = placeOneCard(card, groupOf);
    expect(own).toEqual(["theirs:a:hobby"]);
    expect(byKind.get("theirs:a:hobby")?.groups).toHaveLength(1);
  });
  it("leaves a group out that has no row of theirs and no place", () => {
    const { byKind } = placeOneCard(card, groupOf);
    expect(byKind.has("theirs:a:motto")).toBe(false);
  });
  it("skips the groups the body does not draw", () => {
    const { byKind } = placeOneCard(card, groupOf, (g) => g.field === "a:photo");
    expect(byKind.has("photo")).toBe(false);
  });
  it("sorts a kind's groups by the card's own order", () => {
    const order = (g: OneCardGroup) => (g.field === "a:givenName" ? 2 : 1);
    const { byKind } = placeOneCard(card, groupOf, undefined, order);
    expect(byKind.get("name")?.groups.map((g) => g.field)).toEqual(["a:familyName", "a:givenName"]);
  });
  it("lists a field of their own once, however many groups it has", () => {
    const twice = { ...card, groups: [group("a:hobby", [row("chess", "theirs")]), group("a:hobby", [row("go", "theirs")])] };
    const { own, byKind } = placeOneCard(twice, () => null);
    expect(own).toEqual(["theirs:a:hobby"]);
    expect(byKind.get("theirs:a:hobby")?.groups).toHaveLength(2);
  });
});

describe("oneCardOf", () => {
  const EMAIL: OneCardField = { term: "https://master.example/base/t/email", label: "Email", readKeys: ["a:email", "email"], writeKey: "a:email", many: true };
  const ADDR: OneCardField = { term: "https://master.example/base/t/postalAddress", label: "Address", readKeys: ["a:postalAddress", "postalAddress"], writeKey: "a:postalAddress", many: true };

  it("is one source with no marks when there is no online card", () => {
    const c = oneCardOf({ online: null, servedFacts: { "a:email": ["ann@example.test", "b@example.test"] }, fieldOrder: [EMAIL], skillPredicate: null });
    expect(c.marks).toBe(false);
    expect(c.groups.map((g) => g.rows.map((r) => [r.value, r.source]))).toEqual([[["ann@example.test", "yours"], ["b@example.test", "yours"]]]);
  });
  it("marks two sources and folds an equal value when an online card is linked", () => {
    const P = "https://ann.example.test/";
    const online = parseOnlineCard(P, { fields: [{ principal: P, field: "a:email", value: "Ann@example.test", rung: "public" }] });
    const c = oneCardOf({ online, servedFacts: { "a:email": "ann@example.test" }, fieldOrder: [EMAIL], skillPredicate: null });
    expect(c.marks).toBe(true);
    const rows = c.groups[0]!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "theirs", sameAsTheirs: true });
  });
  it("passes the served facts as they are, one value per entry", () => {
    const c = oneCardOf({ online: null, servedFacts: { "a:email": ["a@example.test", "b@example.test"] }, fieldOrder: [EMAIL], skillPredicate: null });
    expect(c.groups[0]!.rows).toHaveLength(2);
  });
  it("reads the held addresses only when the address predicate is named", () => {
    const addresses = [{ street: "Main St 1", city: "Oslo", entity: "e1" }];
    const without = oneCardOf({ online: null, servedFacts: {}, fieldOrder: [ADDR], skillPredicate: null, addresses });
    expect(without.groups).toHaveLength(0);
    const withName = oneCardOf({ online: null, servedFacts: {}, fieldOrder: [ADDR], skillPredicate: null, addressPredicate: "a:postalAddress", addresses });
    expect(withName.groups[0]!.rows[0]).toMatchObject({ value: "Main St 1, Oslo", source: "yours", claims: ["e1"] });
  });
  it("passes their addresses into the merge when the address field is named, and ignores them otherwise", () => {
    const P = "https://ann.example.test/";
    const card = parseOnlineCard(P, { fields: [{ principal: P, field: "a:email", value: "ann@example.test", rung: "public" }] });
    const theirAddresses = [{
      composite: "E1",
      label: "home",
      parts: { street: "Gladvollveien 38c", city: "Oslo", region: "Oslo", country: "Norway" },
      countryId: "norway",
      rungs: ["public"],
      unread: 0,
      gone: 0,
    }];
    const passed = oneCardOf({ online: card, servedFacts: {}, fieldOrder: [EMAIL, ADDR], skillPredicate: null, addressPredicate: "a:postalAddress", theirAddresses });
    expect(passed.groups.find((g) => g.field === "a:postalAddress")?.rows[0]).toMatchObject({
      source: "theirs",
      value: "Gladvollveien 38c, Oslo, Oslo, Norway",
      label: "home",
    });
    const ignored = oneCardOf({ online: card, servedFacts: {}, fieldOrder: [EMAIL, ADDR], skillPredicate: null, theirAddresses });
    const plain = oneCardOf({ online: card, servedFacts: {}, fieldOrder: [EMAIL, ADDR], skillPredicate: null });
    expect(ignored).toEqual(plain);
  });
});

describe("OwnFieldRow", () => {
  const withMode = (view: OneCardView | null, editing: boolean, node: ReactNode) =>
    render(
      <CardModeProvider canEdit startEditing={editing}>
        <OneCardProvider view={view}>{node}</OneCardProvider>
      </CardModeProvider>,
    );
  const editor = <input data-testid="editor" defaultValue="x" />;

  it("is the editor alone outside the one card", () => {
    const { container } = render(
      <OwnFieldRow kind="email" value="v">
        {editor}
      </OwnFieldRow>,
    );
    expect(container.querySelector('[data-source="yours"]')).toBeNull();
    expect(screen.getByTestId("editor")).toBeTruthy();
  });
  it("wraps the editor in a yours box on a two-source card", () => {
    const { container } = withMode(
      viewOf(),
      true,
      <OwnFieldRow kind="email" value="v">
        {editor}
      </OwnFieldRow>,
    );
    expect(container.querySelector('[data-source="yours"] [data-testid="editor"]')).not.toBeNull();
  });
  it("is the editor alone on a one-source card (no marks)", () => {
    const { container } = withMode(
      viewOf({ marks: false }),
      true,
      <OwnFieldRow kind="email" value="v">
        {editor}
      </OwnFieldRow>,
    );
    expect(container.querySelector('[data-source="yours"]')).toBeNull();
    expect(screen.getByTestId("editor")).toBeTruthy();
  });
  it("draws nothing while presented when the merge folded the value into a row of theirs", () => {
    const { container } = withMode(
      viewOf(),
      false,
      <OwnFieldRow kind="email" value="ann@example.test">
        {editor}
      </OwnFieldRow>,
    );
    expect(container.querySelector('[data-testid="editor"]')).toBeNull();
  });
  it("still draws a folded value while editing", () => {
    withMode(
      viewOf(),
      true,
      <OwnFieldRow kind="email" value="ann@example.test">
        {editor}
      </OwnFieldRow>,
    );
    expect(screen.getByTestId("editor")).toBeTruthy();
  });
  it("draws a folded value while presented when fold is false", () => {
    withMode(
      viewOf(),
      false,
      <OwnFieldRow kind="email" value="ann@example.test" fold={false}>
        {editor}
      </OwnFieldRow>,
    );
    expect(screen.getByTestId("editor")).toBeTruthy();
  });
  it("draws an empty value bare while presented: no mark", () => {
    const { container } = withMode(
      viewOf(),
      false,
      <OwnFieldRow kind="email" value="   ">
        {editor}
      </OwnFieldRow>,
    );
    expect(container.querySelector('[data-source="yours"]')).toBeNull();
    expect(screen.getByTestId("editor")).toBeTruthy();
  });
  it("marks a value that is not folded while presented", () => {
    const { container } = withMode(
      viewOf(),
      false,
      <OwnFieldRow kind="email" value="other@example.test">
        {editor}
      </OwnFieldRow>,
    );
    expect(container.querySelector('[data-source="yours"] [data-testid="editor"]')).not.toBeNull();
  });
});
