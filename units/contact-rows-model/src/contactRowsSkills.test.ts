// A person's Skills rows, stored as the profile app stores skills (its `src/model/profile.ts`:
// `FIELD_TYPE_META.skill` keyPrefix "skill", `nextKeyForType`, the writer's skill branch — a catalogue-picked skill is the
// REFERENCE `{"@id": referent}` on the skill term and the sidecar entry caches its name as `label` — and `profileModelFromDoc`).
import { describe, expect, it } from "vitest";
import { contactRowsPatch, mergeContactRows, nextContactKey, readContactRows, type ContactRow } from "./contactRows";

const NURSING = "https://example.test/base/t/Nursing";
const SELL = "https://example.test/base/t/SellProducts";
const pick = (key: string, name: string, ref: string): ContactRow => ({ key, label: "", value: name, ref });

describe("skill rows, the profile app's way", () => {
  it("keys follow the profile app's nextKeyForType for `skill`: skill, skill2, skill3", () => {
    expect(nextContactKey("skill", [])).toBe("skill");
    expect(nextContactKey("skill", [{ key: "skill" }])).toBe("skill2");
    expect(nextContactKey("skill", [{ key: "skill" }, { key: "skill2" }])).toBe("skill3");
  });

  it("a catalogue pick is written as a reference value, the name is the entry's label, valueIndex pairs it", () => {
    const served = { email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 } };
    const p = contactRowsPatch("skill", [pick("skill", "nursing", NURSING), pick("skill2", "sell products", SELL)], served);
    expect(p.values).toEqual([{ "@id": NURSING }, { "@id": SELL }]);
    expect(p.meta.skill).toEqual({ type: "skill", label: "nursing", order: 3, access: "private", valueIndex: 0 });
    expect(p.meta.skill2).toEqual({ type: "skill", label: "sell products", order: 4, access: "private", valueIndex: 1 });
    expect(p.meta.email).toEqual(served.email);
  });

  it("reads a reference value: the name from the entry's label, the referent kept, no sub-label", () => {
    const rows = readContactRows("skill", {
      values: [{ "@id": SELL }, { "@id": NURSING }],
      meta: {
        skill2: { type: "skill", label: "nursing", order: 5, access: "public", valueIndex: 1 },
        skill: { type: "skill", label: "sell products", order: 4, access: "public", valueIndex: 0 },
        email: { type: "email", label: "Work", order: 2, valueIndex: 0 },
      },
    });
    expect(rows).toEqual([pick("skill", "sell products", SELL), pick("skill2", "nursing", NURSING)]);
  });

  it("one reference served on its own (not a list) is one row; a free-text skill is a text row", () => {
    expect(readContactRows("skill", { values: { "@id": NURSING }, meta: { skill: { type: "skill", label: "nursing", order: 1, valueIndex: 0 } } })).toEqual([
      pick("skill", "nursing", NURSING),
    ]);
    expect(readContactRows("skill", { values: ["improv comedy"], meta: { skill: { type: "skill", order: 1, valueIndex: 0 } } })).toEqual([
      { key: "skill", label: "", value: "improv comedy" },
    ]);
  });

  it("a reference no entry speaks for is shown as its own row (by its referent), never dropped", () => {
    expect(readContactRows("skill", { values: [{ "@id": NURSING }], meta: undefined })).toEqual([{ key: "skill", label: "", value: "", ref: NURSING }]);
  });

  it("round trip: what is written reads back as the same rows; a removed skill is null", () => {
    const rows = [pick("skill", "nursing", NURSING), { key: "skill2", label: "", value: "improv comedy" }, pick("skill3", "sell products", SELL)];
    const p = contactRowsPatch("skill", rows, {});
    expect(readContactRows("skill", { values: p.values, meta: p.meta })).toEqual(rows);
    const removed = contactRowsPatch("skill", [rows[2]!], p.meta);
    expect(removed.values).toEqual([{ "@id": SELL }]);
    expect(removed.meta.skill).toBeNull();
    expect(removed.meta.skill2).toBeNull();
    expect(removed.meta.skill3).toMatchObject({ valueIndex: 0, label: "sell products" });
  });

  it("email, phone and social still read literals only (a reference is not theirs)", () => {
    expect(readContactRows("phone", { values: [{ "@id": NURSING }, "+47 1"], meta: undefined }).map((r) => r.value)).toEqual(["+47 1"]);
  });

  it("a 412 merge keeps a skill added elsewhere and the one the person picked", () => {
    const base = [pick("skill", "nursing", NURSING)];
    const mine = [...base, pick("skill2", "sell products", SELL)];
    const fresh = [...base, pick("skill2", "speak in public", "https://example.test/base/t/SpeakInPublic")];
    expect(mergeContactRows("skill", base, mine, fresh).map((r) => [r.key, r.ref])).toEqual([
      ["skill", NURSING],
      ["skill2", "https://example.test/base/t/SpeakInPublic"],
      ["skill3", SELL],
    ]);
  });
});
