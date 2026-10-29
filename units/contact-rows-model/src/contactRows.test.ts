// ONE row mechanism for Email, Phone and Social, stored and read as the profile app stores them (its
// `src/model/profile.ts`: `FIELD_TYPE_META`, `nextKeyForType`, `profileModelToWriteBody` / `pushMulti`, `profileModelFromDoc`).
import { describe, it, expect } from "vitest";
import { contactRowsPatch, mergeContactRows, nextContactKey, readContactRows, readEmailRows, emailRowsPatch, nextEmailKey } from "./contactRows";
import * as it3 from "./__fixtures__/emailRowsIt3";

describe("phone rows, the profile app's way", () => {
  it("keys follow the profile app's nextKeyForType: phone, phone2, phone3", () => {
    expect(nextContactKey("phone", [])).toBe("phone");
    expect(nextContactKey("phone", [{ key: "phone" }])).toBe("phone2");
    expect(nextContactKey("phone", [{ key: "phone" }, { key: "phone2" }])).toBe("phone3");
    // a gap is filled first, as the profile app's walk does
    expect(nextContactKey("phone", [{ key: "phone2" }])).toBe("phone");
  });
  it("pairs rows by valueIndex, never by position, and reads only phone entries", () => {
    const rows = readContactRows("phone", {
      values: ["+47 900 00 000", "+1 555 0100"],
      meta: {
        phone2: { type: "phone", order: 5, access: "private", valueIndex: 0 },
        phone: { type: "phone", label: "Mobile", order: 4, access: "private", valueIndex: 1 },
        email: { type: "email", label: "Work", order: 2, valueIndex: 0 },
      },
    });
    expect(rows).toEqual([
      { key: "phone", label: "Mobile", value: "+1 555 0100" },
      { key: "phone2", label: "", value: "+47 900 00 000" },
    ]);
  });
  it("no Work / Private label unless stored; a legacy tel: value reads as the number (the profile app decodeValue)", () => {
    expect(readContactRows("phone", { values: ["tel:+4790000000", "+46 70"] })).toEqual([
      { key: "phone", label: "", value: "+4790000000" },
      { key: "phone2", label: "", value: "+46 70" },
    ]);
  });
  it("writes the list and one sidecar entry per row (no label when none), keeps other entries, nulls a removed row", () => {
    const served = {
      email: { type: "email", label: "Work", order: 2, access: "pro-connection", valueIndex: 0 },
      phone: { type: "phone", order: 3, access: "pp-inner", valueIndex: 0 },
      phone2: { type: "phone", label: "Cabin", order: 4, access: "private", valueIndex: 1 },
    };
    const p = contactRowsPatch(
      "phone",
      [
        { key: "phone", label: "", value: " +47 900 " },
        { key: "phone3", label: "", value: "" },
        { key: "phone4", label: "", value: "+1 555" },
      ],
      served,
    );
    expect(p.values).toEqual(["+47 900", "+1 555"]);
    expect(p.meta.email).toEqual(served.email);
    expect(p.meta.phone).toEqual({ type: "phone", order: 3, access: "pp-inner", valueIndex: 0 });
    expect(p.meta.phone3).toEqual({ type: "phone", order: 5, access: "private" });
    expect(p.meta.phone4).toEqual({ type: "phone", order: 6, access: "private", valueIndex: 1 });
    expect(p.meta.phone2).toBeNull();
    expect("label" in p.meta.phone!).toBe(false);
  });
  it("a stored label is kept on write", () => {
    const p = contactRowsPatch("phone", [{ key: "phone", label: "Mobile", value: "+47 1" }], undefined);
    expect(p.meta.phone).toEqual({ type: "phone", label: "Mobile", order: 0, access: "private", valueIndex: 0 });
  });
  it("removing every phone writes null for the term and null for each entry", () => {
    const p = contactRowsPatch("phone", [], { phone: { type: "phone", order: 1, access: "private", valueIndex: 0 } });
    expect(p.values).toBeNull();
    expect(p.meta.phone).toBeNull();
  });
  it("round trip: what is written reads back as the same rows", () => {
    const rows = [
      { key: "phone", label: "", value: "+47 900 00 000" },
      { key: "phone2", label: "Mobile", value: "+1 555 0100" },
    ];
    const p = contactRowsPatch("phone", rows, { email: { type: "email", label: "Work", order: 0, valueIndex: 0 } });
    expect(readContactRows("phone", { values: p.values, meta: p.meta })).toEqual(rows);
  });
});

describe("social rows (the term `account`), the profile app's way", () => {
  it("keys follow the profile app's keyPrefix `account`: account, account2, account3", () => {
    expect(nextContactKey("social", [])).toBe("account");
    expect(nextContactKey("social", [{ key: "account" }])).toBe("account2");
    expect(nextContactKey("social", [{ key: "account" }, { key: "account2" }])).toBe("account3");
  });
  it("sidecar entries carry the profile app's type `social`, paired by valueIndex", () => {
    const rows = readContactRows("social", {
      values: ["https://x.test/b", "https://x.test/a"],
      meta: {
        account: { type: "social", order: 1, valueIndex: 1 },
        account2: { type: "social", order: 2, valueIndex: 0 },
        phone: { type: "phone", order: 0, valueIndex: 0 },
      },
    });
    expect(rows).toEqual([
      { key: "account", label: "", value: "https://x.test/a" },
      { key: "account2", label: "", value: "https://x.test/b" },
    ]);
  });
  it("a value served as a plain string is one row; an unpaired value is shown, never dropped", () => {
    expect(readContactRows("social", { values: "@ann" })).toEqual([{ key: "account", label: "", value: "@ann" }]);
    const rows = readContactRows("social", {
      values: ["@ann", "@other"],
      meta: { account: { type: "social", order: 1, valueIndex: 0 } },
    });
    expect(rows.map((r) => [r.key, r.value])).toEqual([
      ["account", "@ann"],
      ["account2", "@other"],
    ]);
  });
  it("write, null for a removed row, and the round trip", () => {
    const served = {
      account: { type: "social", order: 1, access: "pers-connection", valueIndex: 0 },
      account2: { type: "social", order: 2, access: "pers-connection", valueIndex: 1 },
      phone: { type: "phone", order: 0, access: "private", valueIndex: 0 },
    };
    const rows = [{ key: "account2", label: "", value: "@b" }];
    const p = contactRowsPatch("social", rows, served);
    expect(p.values).toEqual(["@b"]);
    expect(p.meta.account).toBeNull();
    expect(p.meta.account2).toEqual({ type: "social", order: 2, access: "pers-connection", valueIndex: 0 });
    expect(p.meta.phone).toEqual(served.phone);
    expect(readContactRows("social", { values: p.values, meta: p.meta })).toEqual(rows);
  });
  it("one section's write leaves another section's entries alone (all three share the sidecar)", () => {
    const meta0 = {
      email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 },
      phone: { type: "phone", order: 3, access: "private", valueIndex: 0 },
    };
    const s = contactRowsPatch("social", [{ key: "account", label: "", value: "@k" }], meta0);
    expect(s.meta.email).toEqual(meta0.email);
    expect(s.meta.phone).toEqual(meta0.phone);
    expect(s.meta.account).toEqual({ type: "social", order: 4, access: "private", valueIndex: 0 });
    expect(readContactRows("email", { values: ["w@x.test"], meta: s.meta })).toEqual([{ key: "email", label: "Work", value: "w@x.test" }]);
  });
});

describe("email still behaves exactly as the first version did", () => {
  const servedCases: { values?: unknown; meta?: unknown }[] = [
    { values: "a@x.test" },
    { values: ["a@x.test", "b@x.test", "c@x.test"] },
    { values: ["w@x.test", "p@x.test"], meta: { emailPrivate: { type: "email", label: "Private", order: 3, valueIndex: 1 }, email: { type: "email", label: "Work", order: 2, valueIndex: 0 } } },
    { values: ["w@x.test", "other@x.test"], meta: { email: { type: "email", label: "Work", order: 2, valueIndex: 0 } } },
    { values: ["a@x.test"], meta: { email: { type: "email", order: 1 }, emailPrivate: { type: "email", order: 2 } } },
    { values: ["a@x.test"], meta: JSON.stringify({ email: { type: "email", label: "Work", order: 1, valueIndex: 0 } }) },
    { values: ["mailto:a@x.test"], meta: { email: { type: "email", label: "", order: 1, valueIndex: 0 }, phone: { type: "phone", order: 0, valueIndex: 0 } } },
    { values: [], meta: { email: { type: "email", label: "Work", order: 1 } } },
    {},
  ];
  it("reads every case as the first version read it", () => {
    for (const c of servedCases) expect(readEmailRows(c)).toEqual(it3.readEmailRows(c));
  });
  it("keys every case as the first version keyed it", () => {
    const keySets = [[], ["email"], ["emailPrivate"], ["email", "emailPrivate"], ["email", "emailPrivate", "email2"], ["email", "email2"]];
    for (const ks of keySets) {
      const rows = ks.map((key) => ({ key }));
      expect(nextEmailKey(rows)).toBe(it3.nextEmailKey(rows));
    }
  });
  it("writes every case as the first version wrote it", () => {
    const rowsCases = [
      [],
      [{ key: "email", label: "Work", value: " w@x.test " }],
      [
        { key: "email", label: "Work", value: "w@x.test" },
        { key: "email2", label: "Private", value: "q@x.test" },
        { key: "email3", label: "Work", value: "" },
      ],
    ];
    for (const rows of rowsCases)
      for (const c of servedCases) expect(emailRowsPatch(rows, c.meta)).toEqual(it3.emailRowsPatch(rows, c.meta));
  });
});

describe("the 412 merge and the order tie-break", () => {
  const row = (key: string, value: string, label = "") => ({ key, label, value });

  it("equal orders are broken by key, as the profile app's reader sorts", () => {
    const meta = { account2: { type: "social", order: 1 }, account: { type: "social", order: 1 } };
    expect(readContactRows("social", { values: ["s1", "s2"], meta })).toEqual([row("account", "s1"), row("account2", "s2")]);
  });

  it("keeps a row added elsewhere, applies the person's edit, drops the row the person removed", () => {
    const base = [row("phone", "+47 111"), row("phone2", "+47 5")];
    const mine = [row("phone", "+47 222")];
    const fresh = [row("phone", "+47 111"), row("phone2", "+47 5"), row("phone3", "+47 333", "Home")];
    expect(mergeContactRows("phone", base, mine, fresh)).toEqual([row("phone", "+47 222"), row("phone3", "+47 333", "Home")]);
  });

  it("an unchanged row takes the stored value; a row the person added is re-keyed if its key was taken elsewhere", () => {
    const base = [row("account", "@a")];
    const mine = [row("account", "@a"), row("account2", "@mine")];
    const fresh = [row("account", "@a-new"), row("account2", "@theirs")];
    expect(mergeContactRows("social", base, mine, fresh)).toEqual([
      row("account", "@a-new"),
      row("account2", "@theirs"),
      row("account3", "@mine"),
    ]);
  });

  it("a row removed elsewhere is dropped unless the person changed it", () => {
    const base = [row("phone", "1"), row("phone2", "2")];
    expect(mergeContactRows("phone", base, base, [row("phone", "1")])).toEqual([row("phone", "1")]);
    expect(mergeContactRows("phone", base, [row("phone", "1"), row("phone2", "22")], [row("phone", "1")])).toEqual([
      row("phone", "1"),
      row("phone2", "22"),
    ]);
  });
});
