// Merge labels.
//
// Rule 1: values that fold into one row (equal under the field's compare rule) keep the UNION of their labels, in the order first
//   met ("Work · Private"); one is never dropped. The same on the holder's own side. A theirs row the holder's equal value is folded
//   into ("same") shows THEIR label(s); the holder's own labels stay reachable on it (`ownLabels`), as his notes do.
// Rule 2: only a known purpose becomes a label (one app's email slots; `<kind>-<purpose>` with a purpose in `SLOT_PURPOSES`). An
//   unknown slot gives no label, never a guessed word ("email-long" is not "Long").
import { describe, expect, it } from "vitest";
import { mergeOneCard, slotLabel, SLOT_PURPOSES, type OneCardField } from "./index";
import { parseOnlineCard, type OnlineCard } from "@kaigilb/gilbplatformcode-online-card";

const field = (slug: string, label: string, many: boolean): OneCardField => ({
  term: `https://master.example/base/t/${slug}`,
  label,
  readKeys: [`a:${slug}`, slug],
  writeKey: `a:${slug}`,
  many,
});
const EMAIL = field("email", "Email", true);
const PHONE = field("phone", "Phone", true);
const ADDRESS = field("postalAddress", "Postal Address", true);
const ORDER = [EMAIL, PHONE, ADDRESS];
const P = "https://ann.example.test/";
const RUNG = "t:EitherContextFirstDegreeGrantee";
type Served = { field: string; value: string; rung?: string; slot?: string; kind?: string };
const card = (fields: Served[]): OnlineCard => parseOnlineCard(P, { fields: fields.map((f) => ({ principal: P, rung: RUNG, ...f })) });
const em = (value: string, slot?: string): Served => ({ field: "a:email", value, slot, kind: "email" });
const rowsOf = (out: ReturnType<typeof mergeOneCard>, f: OneCardField) => out.groups.find((g) => g.term === f.term)?.rows ?? [];

describe("mergeOneCard labels", () => {
  describe("rule 1: folded values keep the union of their labels", () => {
    it("keeps Work on case twins at one rung (email-work + email-other)", () => {
      const out = mergeOneCard({ online: card([em("ann@example.test", "email-work"), em("ANN@example.test", "email-other")]), own: {}, fieldOrder: ORDER });
      const rows = rowsOf(out, EMAIL);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ value: "ann@example.test", source: "theirs", label: "Work", labels: ["Work"] });
    });

    it("keeps a label that only the second twin carries", () => {
      const out = mergeOneCard({ online: card([em("ann@example.test"), em("ANN@example.test", "email-work")]), own: {}, fieldOrder: ORDER });
      expect(rowsOf(out, EMAIL)).toEqual([expect.objectContaining({ value: "ann@example.test", label: "Work", labels: ["Work"] })]);
    });

    it("joins two labels as 'Work · Private', in the order served, and the reverse order reverses them", () => {
      const a = mergeOneCard({ online: card([em("j@example.test", "email"), em("J@EXAMPLE.test", "emailPrivate")]), own: {}, fieldOrder: ORDER });
      expect(rowsOf(a, EMAIL)).toEqual([expect.objectContaining({ value: "j@example.test", label: "Work · Private", labels: ["Work", "Private"] })]);
      const b = mergeOneCard({ online: card([em("J@EXAMPLE.test", "emailPrivate"), em("j@example.test", "email")]), own: {}, fieldOrder: ORDER });
      expect(rowsOf(b, EMAIL)).toEqual([expect.objectContaining({ value: "J@EXAMPLE.test", label: "Private · Work", labels: ["Private", "Work"] })]);
    });

    it("is stable: the same input gives the same order every time, and a repeated label is shown once", () => {
      const online = card([em("j@example.test", "email-work"), em("J@example.test", "email-home"), em("j@EXAMPLE.test", "email-work"), em(" j@example.test ", "emailPrivate")]);
      const runs = Array.from({ length: 5 }, () => rowsOf(mergeOneCard({ online, own: {}, fieldOrder: ORDER }), EMAIL)[0]!.labels);
      for (const r of runs) expect(r).toEqual(["Work", "Home", "Private"]);
      expect(rowsOf(mergeOneCard({ online, own: {}, fieldOrder: ORDER }), EMAIL)[0]!.label).toBe("Work · Home · Private");
    });

    it("folds phone twins in two forms with both labels", () => {
      const online = card([
        { field: "a:phone", value: "+47 900 12 345", slot: "phone-mobile", kind: "phone" },
        { field: "a:phone", value: "+4790012345", slot: "phone-home", kind: "phone" },
      ]);
      expect(rowsOf(mergeOneCard({ online, own: {}, fieldOrder: ORDER }), PHONE)).toEqual([
        expect.objectContaining({ value: "+47 900 12 345", label: "Mobile · Home", labels: ["Mobile", "Home"] }),
      ]);
    });

    it("keeps values at two rungs as two rows, each with its own labels", () => {
      const online = card([
        { ...em("j@example.test", "email-work"), rung: "public" },
        { ...em("J@example.test", "emailPrivate"), rung: RUNG },
      ]);
      const rows = rowsOf(mergeOneCard({ online, own: {}, fieldOrder: ORDER }), EMAIL);
      expect(rows.map((r) => [r.rung, r.label])).toEqual([
        ["public", "Work"],
        [RUNG, "Private"],
      ]);
    });

    it("gives no label and no labels when no folded value states a purpose", () => {
      const rows = rowsOf(mergeOneCard({ online: card([em("j@example.test"), em("J@example.test", "default")]), own: {}, fieldOrder: ORDER }), EMAIL);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.label).toBeUndefined();
      expect(rows[0]!.labels).toBeUndefined();
    });
  });

  describe("rule 1 on the holder's own side", () => {
    it("folds two equal held values into one row of yours with the union of their labels", () => {
      const out = mergeOneCard({
        online: null,
        own: {
          heldClaims: [
            { predicate: "a:email", value: "k@example.test", slot: "email-work", kind: "email", entity: "c1" },
            { predicate: "a:email", value: "K@EXAMPLE.test", slot: "emailPrivate", kind: "email", entity: "c2" },
          ],
        },
        fieldOrder: ORDER,
      });
      expect(rowsOf(out, EMAIL)).toEqual([
        expect.objectContaining({ value: "k@example.test", source: "yours", label: "Work · Private", labels: ["Work", "Private"], claims: ["c1", "c2"] }),
      ]);
    });

    it("labels a held address from its slot, and an unknown slot gives none", () => {
      const out = mergeOneCard({
        online: null,
        own: { addresses: [{ street: "Storgata 1", city: "Oslo", slot: "address-home", kind: "address" }, { street: "Kirkeveien 2", slot: "address-long", kind: "address" }] },
        fieldOrder: ORDER,
        addressPredicate: "a:postalAddress",
      });
      const rows = rowsOf(out, ADDRESS);
      expect(rows.map((r) => r.label)).toEqual(["Home", undefined]);
    });

    it("a fact of the record carries no slot, so its row has no label (unchanged)", () => {
      const rows = rowsOf(mergeOneCard({ online: null, own: { facts: { email: "k@example.test" } }, fieldOrder: ORDER }), EMAIL);
      expect(rows[0]!.label).toBeUndefined();
      expect(rows[0]!.labels).toBeUndefined();
    });
  });

  describe("rule 1 for theirs equal to yours", () => {
    it("the 'same' row shows their labels; the holder's own labels stay reachable as ownLabels", () => {
      const out = mergeOneCard({
        online: card([em("j@example.test", "email-work"), em("J@example.test", "emailPrivate")]),
        own: { facts: { email: "J@EXAMPLE.TEST" }, heldClaims: [{ predicate: "a:email", value: "j@example.test ", slot: "email-home", kind: "email", entity: "c9" }] },
        fieldOrder: ORDER,
      });
      const rows = rowsOf(out, EMAIL);
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ source: "theirs", sameAsTheirs: true, label: "Work · Private", labels: ["Work", "Private"], ownLabels: ["Home"], claims: ["c9"] });
    });

    it("a 'same' row with no labels of theirs takes none of yours as its label", () => {
      const out = mergeOneCard({
        online: card([em("j@example.test")]),
        own: { heldClaims: [{ predicate: "a:email", value: "J@example.test", slot: "email-work", kind: "email" }] },
        fieldOrder: ORDER,
      });
      const row = rowsOf(out, EMAIL)[0]!;
      expect(row).toMatchObject({ sameAsTheirs: true, ownLabels: ["Work"] });
      expect(row.label).toBeUndefined();
    });
  });

  describe("rule 2: only a known purpose becomes a label", () => {
    it("gives no label for an unknown slot (email-long, social-li)", () => {
      expect(slotLabel("email-long", "email")).toBeNull();
      expect(slotLabel("social-li", "social")).toBeNull();
      expect(slotLabel("email-other", "email")).toBeNull();
      expect(slotLabel("phone-x", "phone")).toBeNull();
      const out = mergeOneCard({
        online: card([em("a@x.no", "email-long"), { field: "a:account", value: "https://linkedin.com/in/j", slot: "social-li", kind: "social" }]),
        own: {},
        fieldOrder: ORDER,
      });
      for (const g of out.groups) for (const r of g.rows) expect(r.label).toBeUndefined();
    });

    it("reads every known purpose, as <kind>-<purpose> for the value's own kind", () => {
      expect(slotLabel("email-work", "email")).toBe("Work");
      expect(slotLabel("email-private", "email")).toBe("Private");
      expect(slotLabel("email-personal", "email")).toBe("Personal");
      expect(slotLabel("email-home", "email")).toBe("Home");
      expect(slotLabel("phone-mobile", "phone")).toBe("Mobile");
      expect(slotLabel("phone-work", "phone")).toBe("Work");
      expect(slotLabel("address-home", "address")).toBe("Home");
      expect(slotLabel("address-work", "address")).toBe("Work");
      // the prefix must be the value's own kind (3662d836), unchanged
      expect(slotLabel("email-work", "phone")).toBeNull();
      expect(slotLabel("job-title", "job-title")).toBeNull();
    });

    it("reads one app's own email slots as that app does", () => {
      expect(slotLabel("email")).toBe("Work");
      expect(slotLabel("hasEmail")).toBe("Work");
      expect(slotLabel("emailPrivate")).toBe("Private");
      expect(slotLabel("hasEmailPrivate")).toBe("Private");
      // That app's other slot keys state no purpose
      for (const s of ["phone", "phone2", "postalAddress", "account", "account2", "default", "photo"]) expect(slotLabel(s, "phone")).toBeNull();
    });

    it("names the known purposes in one exported table", () => {
      expect(Object.keys(SLOT_PURPOSES).sort()).toEqual(["home", "mobile", "personal", "private", "work"]);
      expect(Object.isFrozen(SLOT_PURPOSES)).toBe(true);
    });
  });
});
