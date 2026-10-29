// Every export is pinned here: the names, and the behaviour the ported tests do not reach.
import { describe, expect, it } from "vitest";
import * as unit from "./index";
import {
  contactRowsPatch,
  emailRowsPatch,
  hasWorkPrivate,
  mergeContactRows,
  nextContactKey,
  nextEmailKey,
  readContactRows,
  readEmailRows,
  type ContactKind,
  type ContactRow,
  type ContactValue,
  type EmailRow,
} from "./index";

const row = (key: string, value: string, label = ""): ContactRow => ({ key, label, value });

describe("the unit's exports", () => {
  it("offers exactly these functions", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["contactRowsPatch", "emailRowsPatch", "hasWorkPrivate", "mergeContactRows", "nextContactKey", "nextEmailKey", "readContactRows", "readEmailRows"].sort(),
    );
  });
  it("types the kinds, a row, a value and an email row", () => {
    const kinds: ContactKind[] = ["email", "phone", "social", "skill"];
    const v: ContactValue = { "@id": "https://example.test/base/t/X" };
    const e: EmailRow = { key: "email", label: "Work", value: "a@example.test" };
    expect(kinds).toHaveLength(4);
    expect(v["@id"]).toContain("example.test");
    expect(e.key).toBe("email");
  });
});

describe("hasWorkPrivate", () => {
  it("is true for email only", () => {
    expect(hasWorkPrivate("email")).toBe(true);
    expect(hasWorkPrivate("phone")).toBe(false);
    expect(hasWorkPrivate("social")).toBe(false);
    expect(hasWorkPrivate("skill")).toBe(false);
  });
});

describe("nextContactKey", () => {
  it("email goes email, emailPrivate, email2, email3 and fills a gap first", () => {
    expect(nextContactKey("email", [])).toBe("email");
    expect(nextContactKey("email", [{ key: "email" }])).toBe("emailPrivate");
    expect(nextContactKey("email", [{ key: "email" }, { key: "emailPrivate" }])).toBe("email2");
    expect(nextContactKey("email", [{ key: "email" }, { key: "emailPrivate" }, { key: "email2" }])).toBe("email3");
    expect(nextContactKey("email", [{ key: "emailPrivate" }])).toBe("email");
  });
  it("phone has no private key: it goes straight to phone2", () => {
    expect(nextContactKey("phone", [{ key: "phone" }, { key: "emailPrivate" }])).toBe("phone2");
  });
  it("nextEmailKey is the email case", () => {
    expect(nextEmailKey([])).toBe("email");
    expect(nextEmailKey([{ key: "email" }, { key: "emailPrivate" }])).toBe("email2");
  });
});

describe("readContactRows", () => {
  it("labels an email Work, or Private for the key emailPrivate, unless a label is stored", () => {
    expect(readContactRows("email", { values: ["a@example.test", "b@example.test"], meta: { email: { type: "email", order: 1, valueIndex: 0 }, emailPrivate: { type: "email", order: 2, valueIndex: 1 } } })).toEqual([
      row("email", "a@example.test", "Work"),
      row("emailPrivate", "b@example.test", "Private"),
    ]);
    expect(readContactRows("email", { values: ["a@example.test"], meta: { email: { type: "email", label: "Home", order: 1, valueIndex: 0 } } })).toEqual([row("email", "a@example.test", "Home")]);
  });
  it("labels the first unpaired email Work and the next Private; phone and social get no label", () => {
    expect(readContactRows("email", { values: ["a@example.test", "b@example.test"] })).toEqual([row("email", "a@example.test", "Work"), row("emailPrivate", "b@example.test", "Private")]);
    expect(readContactRows("phone", { values: ["1", "2"] })).toEqual([row("phone", "1"), row("phone2", "2")]);
  });
  it("reads a sidecar given as a JSON string, and treats text that is not a sidecar as none", () => {
    const meta = JSON.stringify({ phone: { type: "phone", label: "Home", order: 1, valueIndex: 0 } });
    expect(readContactRows("phone", { values: ["1"], meta })).toEqual([row("phone", "1", "Home")]);
    expect(readContactRows("phone", { values: ["1"], meta: "{not json" })).toEqual([row("phone", "1")]);
    expect(readContactRows("phone", { values: ["1"], meta: "plain" })).toEqual([row("phone", "1")]);
    expect(readContactRows("phone", { values: ["1"], meta: ["x"] })).toEqual([row("phone", "1")]);
    expect(readContactRows("phone", { values: ["1"], meta: null })).toEqual([row("phone", "1")]);
  });
  it("answers no rows for nothing served, and ignores a blank single string", () => {
    expect(readContactRows("email", {})).toEqual([]);
    expect(readContactRows("email", { values: "  " })).toEqual([]);
    expect(readContactRows("email", { values: null })).toEqual([]);
  });
  it("reads a legacy tel: prefix as the number for phone only", () => {
    expect(readContactRows("phone", { values: ["tel:+1"] })).toEqual([row("phone", "+1")]);
    expect(readContactRows("social", { values: ["tel:+1"] })).toEqual([row("account", "tel:+1")]);
    expect(readContactRows("email", { values: ["tel:+1"] })).toEqual([row("email", "tel:+1", "Work")]);
  });
  it("gives a social row with no address no label, even when one is stored", () => {
    expect(readContactRows("social", { values: [""], meta: { account: { type: "social", label: "X", order: 1, valueIndex: 0 } } })).toEqual([row("account", "", "")]);
    expect(readContactRows("social", { values: ["@a"], meta: { account: { type: "social", label: "X", order: 1, valueIndex: 0 } } })).toEqual([row("account", "@a", "X")]);
  });
  it("pairs by position when no entry has a valueIndex, and by valueIndex when one has", () => {
    const meta = { phone: { type: "phone", order: 1 }, phone2: { type: "phone", order: 2 } };
    expect(readContactRows("phone", { values: ["a", "b"], meta })).toEqual([row("phone", "a"), row("phone2", "b")]);
  });
  it("shows an entry with no value as an empty row", () => {
    expect(readContactRows("phone", { values: [], meta: { phone: { type: "phone", order: 1 } } })).toEqual([row("phone", "")]);
  });
  it("skips a null sidecar entry", () => {
    expect(readContactRows("phone", { values: ["a"], meta: { phone: null, phone2: { type: "phone", order: 1, valueIndex: 0 } } })).toEqual([row("phone2", "a")]);
  });
  it("reads a link in the sidecar's functionUri for a skill only", () => {
    const meta = { skill: { type: "skill", order: 1, functionUri: "https://example.test/base/t/A" } };
    expect(readContactRows("skill", { values: "typing", meta })).toEqual([{ key: "skill", label: "", value: "typing", ref: "https://example.test/base/t/A" }]);
  });
});

describe("readEmailRows and emailRowsPatch", () => {
  it("are the email case of the shared functions", () => {
    const served = { values: ["a@example.test"], meta: { email: { type: "email", label: "Work", order: 1, valueIndex: 0 } } };
    expect(readEmailRows(served)).toEqual(readContactRows("email", served));
    expect(emailRowsPatch([row("email", " a@example.test ", "Work")], served.meta)).toEqual(contactRowsPatch("email", [row("email", " a@example.test ", "Work")], served.meta));
  });
  it("an email row always carries its label, even an empty one", () => {
    const p = emailRowsPatch([row("email", "a@example.test", "")], undefined);
    expect(p.meta.email).toEqual({ type: "email", label: "", order: 0, access: "private", valueIndex: 0 });
    expect(p.values).toEqual(["a@example.test"]);
  });
});

describe("contactRowsPatch", () => {
  it("keeps the stored order and access of a row, gives a new row the next order and private access", () => {
    const served = { phone: { type: "phone", order: 7, access: "public", valueIndex: 0 }, other: { type: "x", order: 9 } };
    const p = contactRowsPatch("phone", [row("phone", "1"), row("phone2", "2")], served);
    expect(p.meta.phone).toEqual({ type: "phone", order: 7, access: "public", valueIndex: 0 });
    expect(p.meta.phone2).toEqual({ type: "phone", order: 10, access: "private", valueIndex: 1 });
    expect(p.meta.other).toEqual({ type: "x", order: 9 });
  });
  it("writes null for the term and for every removed entry when no row is left", () => {
    const p = contactRowsPatch("social", [], { account: { type: "social", order: 1, valueIndex: 0 }, account2: { type: "social", order: 2, valueIndex: 1 } });
    expect(p.values).toBeNull();
    expect(p.meta.account).toBeNull();
    expect(p.meta.account2).toBeNull();
  });
  it("reads a sidecar given as a JSON string", () => {
    const p = contactRowsPatch("phone", [row("phone", "1")], JSON.stringify({ email: { type: "email", order: 4 } }));
    expect(p.meta.email).toEqual({ type: "email", order: 4 });
    expect(p.meta.phone).toMatchObject({ order: 5 });
  });
  it("writes a picked skill as a reference with the trimmed name cached as the label", () => {
    const p = contactRowsPatch("skill", [{ key: "skill", label: "", value: " nursing ", ref: "https://example.test/base/t/N" }], undefined);
    expect(p.values).toEqual([{ "@id": "https://example.test/base/t/N" }]);
    expect(p.meta.skill).toEqual({ type: "skill", label: "nursing", order: 0, access: "private", valueIndex: 0 });
  });
  it("keeps an empty row in the sidecar with no valueIndex", () => {
    const p = contactRowsPatch("phone", [row("phone", "  ")], undefined);
    expect(p.values).toBeNull();
    expect(p.meta.phone).toEqual({ type: "phone", order: 0, access: "private" });
  });
});

describe("mergeContactRows, every branch", () => {
  it("keeps a fresh row nobody on this side touched", () => {
    expect(mergeContactRows("phone", [], [], [row("phone", "9")])).toEqual([row("phone", "9")]);
  });
  it("takes the person's version of a changed label as well as a changed value", () => {
    const base = [row("phone", "1", "")];
    expect(mergeContactRows("phone", base, [row("phone", "1", "Home")], [row("phone", "1", "")])).toEqual([row("phone", "1", "Home")]);
  });
  it("treats a changed reference as a change", () => {
    const a: ContactRow = { key: "skill", label: "", value: "n", ref: "https://example.test/base/t/A" };
    const b: ContactRow = { ...a, ref: "https://example.test/base/t/B" };
    expect(mergeContactRows("skill", [a], [b], [a])).toEqual([b]);
    expect(mergeContactRows("skill", [a], [{ ...a }], [b])).toEqual([b]);
  });
  it("appends a row the person added under its own key when the key is free", () => {
    expect(mergeContactRows("phone", [row("phone", "1")], [row("phone", "1"), row("phone2", "2")], [row("phone", "1")])).toEqual([row("phone", "1"), row("phone2", "2")]);
  });
  it("drops a row someone else removed when the person did not change it, and keeps it when the person did", () => {
    const base = [row("phone", "1")];
    expect(mergeContactRows("phone", base, base, [])).toEqual([]);
    expect(mergeContactRows("phone", base, [row("phone", "2")], [])).toEqual([row("phone", "2")]);
  });
  it("does not mutate its inputs", () => {
    const base = [row("phone", "1")];
    const mine = [row("phone", "2")];
    const fresh = [row("phone", "1")];
    const copy = JSON.stringify([base, mine, fresh]);
    mergeContactRows("phone", base, mine, fresh);
    expect(JSON.stringify([base, mine, fresh])).toBe(copy);
  });
});
