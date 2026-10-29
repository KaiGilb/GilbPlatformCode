// The merge of the placed people and the local records into one list, one row per person.
import { describe, expect, it } from "vitest";
import {
  mergeStakeholderRows,
  type MergeRowsInput,
  type StakeholderRecordInput,
  type StakeholderRow,
} from "./index";
import {
  type AtomicPlacement,
  type ConnectedPerson,
} from "@kaigilb/gilbplatformcode-person-connections";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const PC: AtomicPlacement = { context: "personal", depth: "close-circle" };
const RP: AtomicPlacement = { context: "professional", depth: "first-degree" };
const RC: AtomicPlacement = { context: "professional", depth: "close-circle" };

const CORA = "https://id.example.test/p/cora";
const ANN = "https://id.example.test/p/ann";
const WALT = "https://id.example.test/p/walt";
const ELI = "https://id.example.test/p/eli";
const VAULT = "https://holder.example.test/base";
const OTHER_VAULT = "https://holder-work.example.test/base";
const OWN_CARD = `${VAULT}/e/vsc-abc123`;
const LEGACY_OWN_CARD = `${VAULT}/e/mnb-profile-cora`;

const identity = (p: string): string => p;
const person = (principal: string, ...placements: AtomicPlacement[]): ConnectedPerson => ({ principal, placements });
const record = (id: string, title: string | null, link: string | null = null, vaultId = VAULT): StakeholderRecordInput => ({
  recordId: `${vaultId}/e/${id}`,
  vaultId,
  title,
  link,
});
const input = (over: Partial<MergeRowsInput>): MergeRowsInput => ({
  people: [],
  records: [],
  self: { principal: CORA, cardIds: [] },
  canonical: identity,
  ...over,
});
/** The rows without the self row (most tests are about the others). */
const others = (rows: StakeholderRow[]): StakeholderRow[] => rows.filter((r) => r.kind !== "self");

describe("mergeStakeholderRows", () => {
  describe("the three cases of the 2026-10-18c Status line", () => {
    // a placed person who is not a record is still a row.
    it("placed-only: Ann placed, no record -> one 'placed' row keyed to her principal, no record, no title", () => {
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PP, RP)] })));
      expect(rows).toEqual([
        { key: ANN, kind: "placed", principal: ANN, recordId: null, vaultId: null, placements: [PP, RP], title: null, recordType: null, alsoRecords: 0 },
      ]);
    });

    // every local record is a row.
    it("record-only: Ann as a local record with no link -> one 'record' row keyed to the record id", () => {
      const ann = record("ann", "Ann Lee");
      const rows = others(mergeStakeholderRows(input({ records: [ann] })));
      expect(rows).toEqual([
        { key: ann.recordId, kind: "record", principal: null, recordId: ann.recordId, vaultId: VAULT, placements: [], title: "Ann Lee", recordType: null, alsoRecords: 0 },
      ]);
    });

    // a record joins a placed person only through its resolved `a:sameAs`.
    it("both: Ann local, linked to her online card, and placed -> ONE 'both' row with the record and the placements", () => {
      const ann = record("ann", "Ann L.", ANN);
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PC)], records: [ann] })));
      expect(rows).toEqual([
        { key: ANN, kind: "both", principal: ANN, recordId: ann.recordId, vaultId: VAULT, placements: [PC], title: "Ann L.", recordType: null, alsoRecords: 0 },
      ]);
    });
  });

  describe("a record linked to a person the holder has not placed", () => {
    it("stays a 'record' row, keyed to the principal it links, with no placements", () => {
      const ann = record("ann", "Ann", ANN);
      const rows = others(mergeStakeholderRows(input({ people: [person(WALT, PP)], records: [ann] })));
      expect(rows.map((r) => [r.kind, r.key, r.principal, r.recordId])).toEqual([
        ["record", ANN, ANN, ann.recordId],
        ["placed", WALT, WALT, null],
      ]);
      expect(rows[0]!.placements).toEqual([]);
    });
  });

  describe("a record whose link names no person", () => {
    it("an organization or an unresolved link (null) stays its own 'record' row and joins nobody", () => {
      const org = record("acme", "Acme", null);
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [org] })));
      expect(rows.map((r) => [r.kind, r.key])).toEqual([
        ["record", org.recordId],
        ["placed", ANN],
      ]);
    });
  });

  describe("two records linking one person", () => {
    // two records linked to one person: one row, "also N more records". Nothing merged on disk.
    it("one row; the other record counts in alsoRecords", () => {
      const a = record("walt-1", "Walt", WALT);
      const b = record("walt-2", "Walt Hale", WALT, OTHER_VAULT);
      const rows = others(mergeStakeholderRows(input({ people: [person(WALT, RP)], records: [b, a] })));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key: WALT, kind: "both", principal: WALT, placements: [RP], alsoRecords: 1 });
    });

    it("the row's record is the same whichever order the records arrive in", () => {
      const a = record("walt-1", "Walt", WALT);
      const b = record("walt-2", "Walt Hale", WALT, OTHER_VAULT);
      const c = record("walt-3", "T.", WALT);
      const one = others(mergeStakeholderRows(input({ records: [a, b, c] })));
      const two = others(mergeStakeholderRows(input({ records: [c, b, a] })));
      expect(one).toEqual(two);
      expect(one[0]).toMatchObject({ kind: "record", principal: WALT, alsoRecords: 2 });
    });

    it("the same record listed twice is one record, not 'also 1 more'", () => {
      const a = record("walt-1", "Walt", WALT);
      const rows = others(mergeStakeholderRows(input({ records: [a, { ...a }] })));
      expect(rows).toHaveLength(1);
      expect(rows[0]!.alsoRecords).toBe(0);
    });
  });

  describe("never by name (List.NeverByName = 0)", () => {
    // the same name on two different people gives two rows.
    it("a record titled like a placed person, with no link, does NOT join them", () => {
      const ann = record("ann", ANN, null); // even a title that spells her principal joins nothing
      const named = record("ann-2", "Ann Lee", null);
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [ann, named] })));
      expect(rows).toHaveLength(3);
      expect(rows.find((r) => r.kind === "placed")).toMatchObject({ key: ANN, recordId: null });
    });

    it("two records with the same title linking two different people are two rows", () => {
      const a = record("ann-1", "Ann", ANN);
      const b = record("ann-2", "Ann", ELI);
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PP), person(ELI, RP)], records: [a, b] })));
      expect(rows.map((r) => [r.kind, r.key])).toEqual([
        ["both", ANN],
        ["both", ELI],
      ]);
    });

    it("two records with the same title and no link are two rows", () => {
      const rows = others(mergeStakeholderRows(input({ records: [record("x1", "Same"), record("x2", "Same")] })));
      expect(rows).toHaveLength(2);
    });
  });

  describe("group members in the sets", () => {
    // a group vault in the sets is passed through; the person ruling comes from the name read.
    it("a group vault the holder placed is passed through as a 'placed' row (never judged by URL shape here)", () => {
      const GROUP = "https://family.example.test/base";
      const rows = others(mergeStakeholderRows(input({ people: [person(GROUP, PP), person(ANN, PP)] })));
      expect(rows.map((r) => [r.kind, r.key])).toEqual([
        ["placed", GROUP], // "https://family…" < "https://id…" in code-unit order
        ["placed", ANN],
      ]);
    });
  });

  describe("legacy and re-minted spellings (canonical compare, injected)", () => {
    const LEGACY_WALT = "https://walt.example.test/i";
    const canonical = (p: string): string => (p === LEGACY_WALT ? WALT : p);

    // compared in canonical form (createPrincipalCanonicaliser), never by rewriting a string here.
    it("a record linked to today's principal joins the person placed under the legacy spelling", () => {
      const walt = record("walt", "Walt", WALT);
      const rows = others(mergeStakeholderRows(input({ people: [person(LEGACY_WALT, RP)], records: [walt], canonical })));
      expect(rows).toEqual([
        { key: WALT, kind: "both", principal: WALT, recordId: walt.recordId, vaultId: VAULT, placements: [RP], title: "Walt", recordType: null, alsoRecords: 0 },
      ]);
    });

    it("a record linked by the legacy spelling joins the person placed under today's principal", () => {
      const walt = record("walt", "Walt", LEGACY_WALT);
      const rows = others(mergeStakeholderRows(input({ people: [person(WALT, PP)], records: [walt], canonical })));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key: WALT, kind: "both", principal: WALT });
    });

    it("one person placed under two spellings is one row with the union of placements, in display order", () => {
      const rows = others(mergeStakeholderRows(input({ people: [person(LEGACY_WALT, RC), person(WALT, PP)], canonical })));
      expect(rows).toEqual([
        { key: WALT, kind: "placed", principal: WALT, recordId: null, vaultId: null, placements: [PP, RC], title: null, recordType: null, alsoRecords: 0 },
      ]);
    });

    it("without the canonicaliser's answer the two spellings stay two rows (exact compare, no URL munging)", () => {
      const rows = others(mergeStakeholderRows(input({ people: [person(LEGACY_WALT, RC), person(WALT, PP)] })));
      expect(rows.map((r) => r.key)).toEqual([WALT, LEGACY_WALT].sort());
    });

    it("a canonicaliser that answers nothing ('') falls back to the stored string", () => {
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [record("a", "Ann", ANN)], canonical: () => "" })));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ key: ANN, kind: "both" });
    });
  });

  describe("the holder's own card", () => {
    // your own card is one row, first, kind "self".
    it("is first, kind 'self', keyed to the holder's principal, and is the card findOwnCard named", () => {
      const own = { recordId: OWN_CARD, vaultId: VAULT, title: "Cora Hale", link: null };
      const rows = mergeStakeholderRows(
        input({ people: [person(ANN, PP)], records: [record("ann", "Ann", ANN), own], self: { principal: CORA, cardIds: [OWN_CARD] } }),
      );
      expect(rows[0]).toEqual({
        key: CORA,
        kind: "self",
        principal: CORA,
        recordId: OWN_CARD,
        vaultId: VAULT,
        placements: [],
        title: "Cora Hale",
        recordType: null,
        alsoRecords: 0,
      });
      expect(rows.filter((r) => r.recordId === OWN_CARD)).toHaveLength(1);
    });

    it("is never listed as a contact: a second owner card joins the self row as 'also 1 more card'", () => {
      const own = { recordId: OWN_CARD, vaultId: VAULT, title: "Cora Hale", link: null };
      const legacy = { recordId: LEGACY_OWN_CARD, vaultId: VAULT, title: "Cora Hale", link: null };
      const rows = mergeStakeholderRows(input({ records: [legacy, own], self: { principal: CORA, cardIds: [OWN_CARD, LEGACY_OWN_CARD] } }));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "self", recordId: OWN_CARD, alsoRecords: 1 });
    });

    it("is there even when no card is found yet (recordId null), and a record linking the holder joins it", () => {
      const linkedToMe = record("me", "Me", CORA);
      const rows = mergeStakeholderRows(input({ records: [linkedToMe], self: { principal: CORA, cardIds: [] } }));
      expect(rows).toEqual([
        { key: CORA, kind: "self", principal: CORA, recordId: linkedToMe.recordId, vaultId: VAULT, placements: [], title: "Me", recordType: null, alsoRecords: 0 },
      ]);
      const none = mergeStakeholderRows(input({}));
      expect(none).toEqual([
        { key: CORA, kind: "self", principal: CORA, recordId: null, vaultId: null, placements: [], title: null, recordType: null, alsoRecords: 0 },
      ]);
    });

    it("the card findOwnCard named is the self row's record even when it is not on the records page", () => {
      const rows = mergeStakeholderRows(input({ self: { principal: CORA, cardIds: [OWN_CARD] } }));
      expect(rows[0]).toMatchObject({ kind: "self", recordId: OWN_CARD, vaultId: null, title: null, alsoRecords: 0 });
    });

    it("the holder placed under a legacy spelling folds into the self row, not a second row", () => {
      const LEGACY_CORA = "https://holder.example.test/i";
      const rows = mergeStakeholderRows(
        input({ people: [person(LEGACY_CORA, PP)], self: { principal: CORA, cardIds: [] }, canonical: (p) => (p === LEGACY_CORA ? CORA : p) }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "self", key: CORA, placements: [PP] });
    });

    it("an owner card that links someone else still belongs to the self row (owner card id wins)", () => {
      const own = { recordId: OWN_CARD, vaultId: VAULT, title: "Cora Hale", link: ANN };
      const rows = mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [own], self: { principal: CORA, cardIds: [OWN_CARD] } }));
      expect(rows.map((r) => [r.kind, r.recordId])).toEqual([
        ["self", OWN_CARD],
        ["placed", null],
      ]);
    });
  });

  describe("stable order", () => {
    // self, then people in both, then records, then placed-only, stable by key. A name sort comes later.
    it("self, then both, then records, then placed-only; within a group by key, never by title", () => {
      const rows = mergeStakeholderRows(
        input({
          people: [person(WALT, PP), person(ELI, RP), person(ANN, PC)],
          records: [record("z", "Abe", null), record("b", "Zed", null), record("t", "Walt", WALT), record("a", "Ann", ANN)],
          self: { principal: CORA, cardIds: [OWN_CARD] },
        }),
      );
      expect(rows.map((r) => [r.kind, r.key])).toEqual([
        ["self", CORA],
        ["both", ANN],
        ["both", WALT],
        ["record", `${VAULT}/e/b`],
        ["record", `${VAULT}/e/z`],
        ["placed", ELI],
      ]);
    });

    it("the same input in any order gives the same rows", () => {
      const people = [person(WALT, PP), person(ELI, RP), person(ANN, PC)];
      const records = [record("z", "Abe", null), record("t", "Walt", WALT), record("a", "Ann", ANN), record("t2", "Walt 2", WALT)];
      const a = mergeStakeholderRows(input({ people, records }));
      const b = mergeStakeholderRows(input({ people: [...people].reverse(), records: [...records].reverse() }));
      expect(b).toEqual(a);
    });

    it("does not change its inputs", () => {
      const people = [person(WALT, RC, PP)];
      const records = [record("t", "Walt", WALT)];
      const before = JSON.stringify({ people, records });
      mergeStakeholderRows(input({ people, records }));
      expect(JSON.stringify({ people, records })).toBe(before);
    });
  });

  describe("performance", () => {
    // Value: the merge is not the cost of a list render — 1,000 placed + 1,000 records merge in < 50 ms (meter: wall clock).
    it("merges 1,000 placed people and 1,000 records in under 50 ms", () => {
      const people = Array.from({ length: 1000 }, (_, i) => person(`https://id.example.test/p/u${i}`, i % 2 ? PP : RC));
      const records = Array.from({ length: 1000 }, (_, i) =>
        record(`r${i}`, `Person ${i}`, i % 3 === 0 ? `https://id.example.test/p/u${i}` : i % 3 === 1 ? `https://id.example.test/p/x${i % 50}` : null),
      );
      const canonical = (p: string): string => p.trim();
      mergeStakeholderRows(input({ people, records, canonical })); // warm
      const start = performance.now();
      const rows = mergeStakeholderRows(input({ people, records, canonical }));
      const ms = performance.now() - start;
      expect(ms).toBeLessThan(50);
      // 1 self + 334 both + 666 placed-only + 50 linked-unplaced + 333 unlinked records
      expect(rows).toHaveLength(1 + 334 + 666 + 50 + 333);
    });
  });
});
