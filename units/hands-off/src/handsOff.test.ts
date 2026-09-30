import { describe, expect, it } from "vitest";
import {
  HandsOffToUnknownAddressError,
  HandsOffToUnreadableError,
  addHandoffLink,
  handsOffToInputList,
  handsOffToUnchanged,
  handsOffToWireValue,
  isHandsOffAddressUnknown,
  planHandsOffToSave,
  readHandsOffTo,
  removeHandoffLink,
  resolveHandsOffToUri,
  servedHandsOffTo,
} from "./handsOff";

const HOST = { "@id": "https://example.test/base/e/holder" };
const LEFT = "https://example.test/base/e/left";
const RIGHT = "https://other.example.test/base/e/left";

describe("readHandsOffTo", () => {
  it("reads one object, an array, and a string, and counts an unreadable member", () => {
    expect(readHandsOffTo({ "@id": LEFT }).ids).toEqual([LEFT]);
    expect(readHandsOffTo([{ "@id": LEFT }, { "@id": LEFT }, "  "]).ids).toEqual([LEFT]);
    expect(readHandsOffTo([LEFT, 4]).unreadable).toBe(1);
    expect(readHandsOffTo(null)).toEqual({ ids: [], unreadable: 0 });
  });

  it("prefers the framed spelling", () => {
    expect(servedHandsOffTo({ handsOffTo: { "@id": LEFT }, "a:handsOffTo": { "@id": RIGHT } }).ids).toEqual([
      LEFT,
    ]);
    expect(servedHandsOffTo({ handsOffTo: null, "a:handsOffTo": { "@id": RIGHT } }).ids).toEqual([RIGHT]);
  });
});

describe("wire and input", () => {
  it("writes one object or an array, and null for none", () => {
    expect(handsOffToWireValue([])).toBeNull();
    expect(handsOffToWireValue([LEFT])).toEqual({ "@id": LEFT });
    expect(handsOffToWireValue([LEFT, RIGHT])).toEqual([{ "@id": LEFT }, { "@id": RIGHT }]);
  });

  it("trims and drops blanks, and a string is one entry", () => {
    expect(handsOffToInputList("  a  ")).toEqual(["a"]);
    expect(handsOffToInputList(["a", " a ", "", "b"])).toEqual(["a", "b"]);
  });
});

describe("identity", () => {
  it("treats a full address as known and a colon form or a slash form as unknown", () => {
    expect(isHandsOffAddressUnknown(LEFT)).toBe(false);
    expect(isHandsOffAddressUnknown("http://example.test/base/e/x")).toBe(false);
    expect(isHandsOffAddressUnknown("base:e/x")).toBe(true);
    expect(isHandsOffAddressUnknown("e/x")).toBe(true);
    expect(isHandsOffAddressUnknown("bare")).toBe(false);
  });

  it("resolves a bare id against the holder and leaves an unknown form unchanged", () => {
    expect(resolveHandsOffToUri(HOST, "other")).toBe("https://example.test/base/e/other");
    expect(resolveHandsOffToUri(HOST, LEFT)).toBe(LEFT);
    expect(resolveHandsOffToUri(HOST, "base:e/x")).toBe("base:e/x");
    expect(resolveHandsOffToUri({}, "other")).toBe("other");
  });

  it("does not treat the same tail on another host as the same link", () => {
    expect(removeHandoffLink(HOST["@id"], [LEFT, RIGHT], LEFT)).toEqual([RIGHT]);
  });
});

describe("planHandsOffToSave", () => {
  it("returns null when nothing changed, including a bare id that is the same link", () => {
    expect(planHandsOffToSave(HOST, { ids: [LEFT], unreadable: 0 }, [LEFT])).toBeNull();
    expect(planHandsOffToSave(HOST, { ids: ["left"], unreadable: 0 }, [LEFT])).toBeNull();
  });

  it("keeps a served link as stored and resolves an added bare id", () => {
    const plan = planHandsOffToSave(HOST, { ids: [LEFT], unreadable: 0 }, [LEFT, "other"]);
    expect(plan).toEqual({
      write: [LEFT, "https://example.test/base/e/other"],
      added: ["https://example.test/base/e/other"],
    });
  });

  it("refuses an unknown address and an unreadable member", () => {
    expect(() => planHandsOffToSave(HOST, { ids: [], unreadable: 0 }, ["base:e/x"])).toThrow(
      HandsOffToUnknownAddressError,
    );
    expect(() => planHandsOffToSave(HOST, { ids: [LEFT], unreadable: 1 }, [])).toThrow(
      HandsOffToUnreadableError,
    );
  });

  it("says unchanged only for the same order", () => {
    expect(handsOffToUnchanged(HOST, [LEFT, RIGHT], [RIGHT, LEFT])).toBe(false);
    expect(handsOffToUnchanged(HOST, [LEFT, RIGHT], [LEFT, RIGHT])).toBe(true);
  });
});

describe("editor list", () => {
  it("adds a missing link and keeps the typed draft", () => {
    expect(addHandoffLink(HOST["@id"], [LEFT], "other")).toEqual([LEFT, "other"]);
    expect(addHandoffLink(HOST["@id"], [LEFT], " left ")).toEqual([LEFT]);
  });
});
