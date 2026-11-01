// Their addresses as rows of theirs in the address field. Beyond the source (Kai, 2026-11-01).
import { describe, expect, it } from "vitest";
import { mergeOneCard, type OneCardField, type OwnAddress, type TheirAddressInput } from "./index";
import { parseOnlineCard } from "@kaigilb/gilbplatformcode-online-card";

const field = (slug: string, label: string, many: boolean): OneCardField => ({
  term: `https://master.example/base/t/${slug}`,
  label,
  readKeys: [`a:${slug}`, slug],
  writeKey: `a:${slug}`,
  many,
});
const EMAIL = field("email", "Email", true);
const ADDRESS = field("postalAddress", "Postal Address", true);
const ORDER = [EMAIL, ADDRESS];
const P = "https://ann.example.test/";
const LINE = "Gladvollveien 38c, Oslo, Oslo, Norway";
const PARTS: OwnAddress = { street: "Gladvollveien 38c", city: "Oslo", region: "Oslo", country: "Norway" };

const online = parseOnlineCard(P, {
  fields: [{ principal: P, field: "a:email", value: "ann@example.test", rung: "public" }],
});

const home = (over: Partial<TheirAddressInput> = {}): TheirAddressInput => ({
  composite: "E1",
  label: "home",
  parts: PARTS,
  countryId: "norway",
  rungs: ["public"],
  unread: 0,
  gone: 0,
  ...over,
});

const addr = (out: ReturnType<typeof mergeOneCard>) => out.groups.find((g) => g.field === "a:postalAddress");

describe("their addresses as rows of theirs", () => {
  it('their address is one theirs row under addressPredicate with value "Gladvollveien 38c, Oslo, Oslo, Norway", label "home", address.countryId norway', () => {
    const out = mergeOneCard({ online, own: {}, fieldOrder: ORDER, addressPredicate: "a:postalAddress", theirAddresses: [home()] });
    const g = addr(out);
    expect(g?.rows).toHaveLength(1);
    expect(g?.rows[0]).toMatchObject({
      source: "theirs",
      field: "a:postalAddress",
      value: LINE,
      label: "home",
      labels: ["home"],
      editable: false,
      address: { composite: "E1", parts: PARTS, countryId: "norway", unread: 0, gone: 0 },
    });
  });

  it("without addressPredicate, theirAddresses is ignored", () => {
    const withThem = mergeOneCard({ online, own: { facts: { email: "other@example.test" } }, fieldOrder: ORDER, theirAddresses: [home()] });
    const without = mergeOneCard({ online, own: { facts: { email: "other@example.test" } }, fieldOrder: ORDER });
    expect(withThem).toEqual(without);
  });

  it("an own address equal to theirs folds: one theirs row sameAsTheirs, its claims kept", () => {
    const out = mergeOneCard({
      online,
      own: { addresses: [{ ...PARTS, entity: "https://h.example/e/a1" }] },
      fieldOrder: ORDER,
      addressPredicate: "a:postalAddress",
      theirAddresses: [home()],
    });
    const rows = addr(out)!.rows;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "theirs", value: LINE, sameAsTheirs: true, claims: ["https://h.example/e/a1"] });
  });

  it("a partial address (unread 1) never folds: theirs row without sameAsTheirs, and the own row stays", () => {
    const out = mergeOneCard({
      online,
      own: { addresses: [{ ...PARTS, entity: "https://h.example/e/a1" }] },
      fieldOrder: ORDER,
      addressPredicate: "a:postalAddress",
      theirAddresses: [home({ unread: 1 })],
    });
    const rows = addr(out)!.rows;
    expect(rows.map((r) => [r.source, r.value, r.sameAsTheirs ?? false])).toEqual([
      ["theirs", LINE, false],
      ["yours", LINE, false],
    ]);
    expect(rows[1]!.claims).toEqual(["https://h.example/e/a1"]);
  });

  it("two their addresses with the same line stay two rows", () => {
    const out = mergeOneCard({
      online,
      own: {},
      fieldOrder: ORDER,
      addressPredicate: "a:postalAddress",
      theirAddresses: [home({ composite: "E1", label: "home" }), home({ composite: "E2", label: "work" })],
    });
    const rows = addr(out)!.rows;
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => [r.value, r.label, r.address?.composite])).toEqual([
      [LINE, "home", "E1"],
      [LINE, "work", "E2"],
    ]);
  });

  it('rung words: parts at "public" and "connections" → rungWords is both words joined " · "', () => {
    const out = mergeOneCard({
      online,
      own: {},
      fieldOrder: ORDER,
      addressPredicate: "a:postalAddress",
      theirAddresses: [home({ rungs: ["public", "connections"] })],
    });
    expect(addr(out)!.rows[0]).toMatchObject({ rung: "public · connections", rungWords: "Public · connections" });
  });

  it('label only (no parts served) → row value "home", label "home"', () => {
    const out = mergeOneCard({
      online,
      own: {},
      fieldOrder: ORDER,
      addressPredicate: "a:postalAddress",
      theirAddresses: [home({ parts: {}, countryId: null, rungs: [] })],
    });
    expect(addr(out)!.rows).toHaveLength(1);
    expect(addr(out)!.rows[0]).toMatchObject({ value: "home", label: "home", labels: ["home"], address: { composite: "E1", countryId: null } });
  });
});
