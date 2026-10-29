// The pure rules of the kind-of-contact chips. Every expected value is a literal.
import { describe, expect, it } from "vitest";
import { chipText, notYetChosen, offeredFor, orderEntries, toneOfCircleLabel, type CatalogueEntry } from "./contactKindModel";

const P = "https://ontology.example.test/base/t/Person";
const O = "https://ontology.example.test/base/t/Organization";
const e = (id: string, label: string, order: number | null, playableBy: string[] = [], own = false): CatalogueEntry => ({
  id,
  label,
  order,
  playableBy,
  axis: "relationshipKind",
  own,
});

describe("orderEntries", () => {
  it("orders by labelOrder, the entries without one after them by name (a holder's own kind goes last)", () => {
    const out = orderEntries([e("c", "Colleague", 7), e("z", "Zebra keeper", null, [], true), e("a", "Advisor", 8), e("f", "Friend", 5), e("b", "Boss", null, [], true)]);
    expect(out.map((x) => x.label)).toEqual(["Friend", "Colleague", "Advisor", "Boss", "Zebra keeper"]);
  });
  it("does not change its input", () => {
    const input = [e("b", "B", 2), e("a", "A", 1)];
    orderEntries(input);
    expect(input.map((x) => x.id)).toEqual(["b", "a"]);
  });
});

describe("offeredFor — a kind that does not fit the record's type is not offered", () => {
  const friend = e("friend", "Friend", 5, [P]);
  const competitor = e("competitor", "Competitor", 9, [O]);
  const customer = e("customer", "Customer", 1, [P, O]);
  const anywhere = e("mine", "Mine", null, [], true);
  it("a person gets the person kinds, the shared kinds and the kinds with no declared type", () => {
    expect(offeredFor([friend, competitor, customer, anywhere], new Set([P])).map((x) => x.id)).toEqual(["friend", "customer", "mine"]);
  });
  it("an organization gets the organization kinds, the shared kinds and the kinds with no declared type", () => {
    expect(offeredFor([friend, competitor, customer, anywhere], new Set([O])).map((x) => x.id)).toEqual(["competitor", "customer", "mine"]);
  });
  it("a type that descends from Person is offered the person kinds (the caller passes the type and every type above it)", () => {
    const passenger = "https://ontology.example.test/base/t/Passenger";
    expect(offeredFor([friend, competitor], new Set([passenger, P])).map((x) => x.id)).toEqual(["friend"]);
  });
  it("no type known offers only the kinds with no declared type (never a guess)", () => {
    expect(offeredFor([friend, customer, anywhere], new Set()).map((x) => x.id)).toEqual(["mine"]);
  });
});

describe("notYetChosen — a label appears at most once on a contact", () => {
  it("drops the entries already chosen", () => {
    expect(notYetChosen([e("a", "A", 1), e("b", "B", 2)], new Set(["a"])).map((x) => x.id)).toEqual(["b"]);
  });
});

describe("toneOfCircleLabel — the colour is only a look: Personal green, Professional blue, anything else neutral", () => {
  it("reads the context word of the label", () => {
    expect(toneOfCircleLabel("Personal · 1st Connection")).toBe("personal");
    expect(toneOfCircleLabel("Professional · Inner Circle")).toBe("professional");
    expect(toneOfCircleLabel("Friend")).toBe("neutral");
  });
});

describe("chipText — the chip words", () => {
  it("drops the middle dot", () => {
    expect(chipText("Professional · Inner Circle")).toBe("Professional Inner Circle");
    expect(chipText("Customer")).toBe("Customer");
  });
});
