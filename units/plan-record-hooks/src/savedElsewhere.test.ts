// @vitest-environment node
// The rule that tells "saved elsewhere" from "the card's own". Ported from savedElsewhere.test.ts (the keysSavedElsewhere block, all 5;
// the rebaseOnStored block is not taken).
import { describe, expect, it } from "vitest";
import { keysSavedElsewhere } from "./savedElsewhere";

describe("keysSavedElsewhere (case (a) is empty, case (b) is not)", () => {
  it("nothing changed: empty", () => {
    expect(keysSavedElsewhere({ body: "text" }, { body: "text" }, [{ body: "text" }])).toEqual([]);
  });
  it("the card's own save landed (its own save landed after the PUT went out): the stored value is what the card holds: empty", () => {
    expect(keysSavedElsewhere({ body: "edited", title: "Ann" }, { body: "text" }, [{ body: "edited" }, { body: "edited", title: "Ann" }])).toEqual([]);
  });
  it("another session's value: named", () => {
    expect(keysSavedElsewhere({ body: "theirs" }, { body: "text" }, [{ body: "text" }])).toEqual(["body"]);
  });
  it("a fact added elsewhere, and one removed elsewhere: both named", () => {
    expect(keysSavedElsewhere({ phone: "1" }, { body: "text" }, [{ body: "text" }])).toEqual(["body", "phone"]);
  });
  it("a name the card saved and the retype moves is the card's own", () => {
    expect(keysSavedElsewhere({ label: "Ann", status: "To Do" }, { label: "Ann", status: "To Do" }, [{ name: "Ann", status: "To Do" }])).toEqual([]);
  });
});
