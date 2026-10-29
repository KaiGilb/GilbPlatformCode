// The merge: a canonicaliser that throws, owner card ids in either form, one record id given twice.
import { describe, expect, it } from "vitest";
import {
  mergeStakeholderRows,
  entityKey,
  type MergeRowsInput,
  type StakeholderRecordInput,
  type StakeholderRow,
} from "./index";
import {
  type AtomicPlacement,
  type ConnectedPerson,
} from "@kaigilb/gilbplatformcode-person-connections";

const PP: AtomicPlacement = { context: "personal", depth: "first-degree" };
const CORA = "https://id.example.test/p/cora";
const ANN = "https://id.example.test/p/ann";
const WALT = "https://id.example.test/p/walt";
const VAULT = "https://holder.example.test/vault";

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
  canonical: (p) => p,
  ...over,
});
const others = (rows: StakeholderRow[]): StakeholderRow[] => rows.filter((r) => r.kind !== "self");

describe("mergeStakeholderRows advisories", () => {
  describe("a title never joins (the core rule guarded in the package)", () => {
    // Spec: List.NeverByName — a title equal to a JOINED record's title joins nothing.
    it("a record whose title equals another, joined record's title stays its own row", () => {
      const linked = record("r1", "Ann Lee", ANN);
      const sameTitle = record("r2", "Ann Lee");
      const rows = others(mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [linked, sameTitle] })));
      expect(rows).toHaveLength(2);
      const ann = rows.find((r) => r.key === ANN)!;
      expect(ann).toMatchObject({ kind: "both", recordId: linked.recordId, alsoRecords: 0 });
      expect(rows.find((r) => r.key === sameTitle.recordId)).toMatchObject({ kind: "record", principal: null, title: "Ann Lee" });
    });

    it("a record whose title equals a placed-only person's joined title stays apart, whatever the order", () => {
      const a = record("a", "Walt Hale", WALT);
      const b = record("b", "Walt Hale");
      const c = record("c", "Walt Hale");
      for (const records of [[a, b, c], [c, b, a], [b, a, c]]) {
        const rows = others(mergeStakeholderRows(input({ people: [person(WALT, PP)], records })));
        expect(rows.map((r) => [r.key, r.kind, r.alsoRecords])).toEqual([
          [WALT, "both", 0],
          [b.recordId, "record", 0],
          [c.recordId, "record", 0],
        ]);
      }
    });
  });

  describe("a canonicaliser that throws does not throw the whole merge", () => {
    it("the member it threw on is read as unresolved (its own string); every other row is kept", () => {
      const legacyAnn = "https://ann.example.test/i";
      const canonical = (p: string): string => {
        if (p === WALT) throw new Error("boom");
        return p === legacyAnn ? ANN : p;
      };
      const rows = mergeStakeholderRows(
        input({ people: [person(WALT, PP), person(legacyAnn, PP)], records: [record("r1", "Ann", ANN), record("r2", "Walt", WALT)], canonical }),
      );
      expect(rows[0]!.kind).toBe("self");
      // Ann still joins through the canonicaliser; Walt is compared by his exact string, so his own exact link still joins.
      expect(others(rows).map((r) => [r.key, r.kind])).toEqual([
        [ANN, "both"],
        [WALT, "both"],
      ]);
    });

    it("a canonicaliser that throws on the holder still gives a first self row", () => {
      const rows = mergeStakeholderRows(
        input({
          canonical: () => {
            throw new Error("down");
          },
          people: [person(ANN, PP)],
        }),
      );
      expect(rows.map((r) => [r.kind, r.key])).toEqual([
        ["self", CORA],
        ["placed", ANN],
      ]);
    });
  });

  describe("the same record id twice with different links is deterministic", () => {
    // The rule: copies of one record id that name DIFFERENT people are contradictory (one entity, one single-valued link).
    // No person is chosen for it, exactly as `readLink` answers `ambiguous` for two references: the record stays an
    // unlinked record row. Copies that agree (or a copy with no link beside one with a link) give the one link.
    it("[r1 -> Ann, r1 -> Walt] and [r1 -> Walt, r1 -> Ann] give the same rows: r1 joins nobody", () => {
      const toAnn = record("r1", "R", ANN);
      const toWalt = record("r1", "R", WALT);
      const people = [person(ANN, PP), person(WALT, PP)];
      const one = mergeStakeholderRows(input({ people, records: [toAnn, toWalt] }));
      const two = mergeStakeholderRows(input({ people, records: [toWalt, toAnn] }));
      expect(two).toEqual(one);
      expect(others(one).map((r) => [r.key, r.kind])).toEqual([
        [toAnn.recordId, "record"],
        [ANN, "placed"],
        [WALT, "placed"],
      ]);
    });

    it("a copy with no link beside a copy with a link gives the link, in either order", () => {
      const linked = record("r1", "R", ANN);
      const bare = record("r1", "R");
      const a = mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [bare, linked] }));
      const b = mergeStakeholderRows(input({ people: [person(ANN, PP)], records: [linked, bare] }));
      expect(a).toEqual(b);
      expect(others(a)).toHaveLength(1);
      expect(others(a)[0]).toMatchObject({ key: ANN, kind: "both", recordId: linked.recordId });
    });

    it("copies that differ only in title give the same row in either order", () => {
      const x = record("r1", "Old title", ANN);
      const y = record("r1", "New title", ANN);
      expect(mergeStakeholderRows(input({ records: [x, y] }))).toEqual(mergeStakeholderRows(input({ records: [y, x] })));
    });
  });

  describe("the own card is recognised in either address form", () => {
    const own = record("vsc-abc", "Cora Hale");
    const lwsForm = "https://holder.example.test/lws/r/vsc-abc";

    it("a `/lws/r/` card id still names the self row's record, and the card is never a contact row", () => {
      const rows = mergeStakeholderRows(input({ records: [own, record("x", "Ann")], self: { principal: CORA, cardIds: [lwsForm] } }));
      expect(rows[0]).toMatchObject({ kind: "self", recordId: own.recordId, vaultId: VAULT, title: "Cora Hale", alsoRecords: 0 });
      expect(others(rows).map((r) => r.recordId)).toEqual([`${VAULT}/e/x`]);
    });

    it("a second owner card given in `/lws/r/` form joins the self row", () => {
      const legacy = record("mnb-profile-cora", "Cora");
      const rows = mergeStakeholderRows(
        input({ records: [own, legacy], self: { principal: CORA, cardIds: [own.recordId, "https://holder.example.test/lws/r/mnb-profile-cora"] } }),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ kind: "self", recordId: own.recordId, alsoRecords: 1 });
    });

    it("a card on another host with the same id is NOT the own card", () => {
      const rows = mergeStakeholderRows(input({ records: [own], self: { principal: CORA, cardIds: ["https://someone.example.test/lws/r/vsc-abc"] } }));
      expect(others(rows).map((r) => r.recordId)).toEqual([own.recordId]);
    });

    it("entityKey: both forms of one card give one key; other hosts, other ids and non-addresses do not", () => {
      expect(entityKey(lwsForm)).toBe(entityKey(own.recordId));
      expect(entityKey("https://holder.example.test/base/e/vsc-abc")).toBe(entityKey(own.recordId));
      expect(entityKey("https://other.example.test/vault/e/vsc-abc")).not.toBe(entityKey(own.recordId));
      expect(entityKey("https://holder.example.test/vault/e/vsc-abd")).not.toBe(entityKey(own.recordId));
      expect(entityKey("not an address")).toBe("not an address");
    });
  });
});
