// A skill the profile app stored BEFORE the reference encoding keeps its catalogue link in the sidecar entry's `functionUri`,
// with the name as plain text. The profile app still reads that form (`profile.ts` `profileModelFromDoc`:
// `refIdOf(raw) ?? m.functionUri`) and its next save moves the link to the reference value `{"@id"}`. This code must do the
// same, or a Skills save deletes the link.
import { describe, expect, it } from "vitest";
import { contactRowsPatch, readContactRows } from "./contactRows";

const ALPHA = "https://example.test/base/t/Alpha";
const BETA = "https://example.test/base/t/Beta";

const oldForm = {
  values: "public speaking",
  meta: {
    skill: { type: "skill", order: 4, access: "public", functionUri: ALPHA },
    email: { type: "email", label: "Work", order: 2, access: "private", valueIndex: 0 },
  },
};

describe("the profile app's older skill (link in the sidecar's functionUri)", () => {
  it("reads as a linked skill: the text is its name, the functionUri its referent", () => {
    expect(readContactRows("skill", oldForm)).toEqual([{ key: "skill", label: "", value: "public speaking", ref: ALPHA }]);
  });

  it("after a save (another skill added), the profile app's current shape holds the reference; nothing is lost", () => {
    const rows = readContactRows("skill", oldForm);
    const p = contactRowsPatch("skill", [...rows, { key: "skill2", label: "", value: "beta", ref: BETA }], oldForm.meta);
    expect(p.values).toEqual([{ "@id": ALPHA }, { "@id": BETA }]);
    expect(p.meta.skill).toEqual({ type: "skill", label: "public speaking", order: 4, access: "public", valueIndex: 0 });
    expect(p.meta.email).toEqual(oldForm.meta.email);
    // Read back as the profile app would: the same two linked skills.
    expect(readContactRows("skill", { values: p.values, meta: p.meta })).toEqual([
      { key: "skill", label: "", value: "public speaking", ref: ALPHA },
      { key: "skill2", label: "", value: "beta", ref: BETA },
    ]);
  });

  it("only a skill entry's functionUri is read as a link (an email row with one stays text)", () => {
    const rows = readContactRows("email", {
      values: ["a@b.c"],
      meta: { email: { type: "email", label: "Work", order: 1, valueIndex: 0, functionUri: ALPHA } },
    });
    expect(rows).toEqual([{ key: "email", label: "Work", value: "a@b.c" }]);
  });
});
