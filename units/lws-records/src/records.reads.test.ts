// @vitest-environment node
// New. Pins the reads and helpers of records.ts that the app's tests reach only through other modules: the type marker, the facts
// flattening, the served spellings kept, the create's id, the status mapping of the id-keyed calls, and the address each read goes to.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { typeUri } from "@kaigilb/gilbplatformcode-record-types";
import {
  createRecord,
  hasSubstitutedType,
  isFactStringFaithful,
  patchRecord,
  readRecord,
  recordFromServed,
  RecordConflictError,
  RecordForbiddenError,
} from "./records";
import { ORIGIN, resp, setUp, tearDown, type FakeHost } from "../test/support";

let host: FakeHost;
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  host = setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("hasSubstitutedType", () => {
  it("is true only for the unknown marker that was put there because the document named no type", () => {
    expect(hasSubstitutedType({ typeUri: typeUri("Resource"), typeSubstituted: true })).toBe(true);
  });
  it("a real Resource record (marked nothing) is not substituted", () => {
    expect(hasSubstitutedType({ typeUri: typeUri("Resource") })).toBe(false);
  });
  it("a marker on a record that has another type is not substituted", () => {
    expect(hasSubstitutedType({ typeUri: typeUri("Task"), typeSubstituted: true })).toBe(false);
  });
  it("the marker is compared in its normal form: t:Resource and the absolute address are the same type", () => {
    expect(hasSubstitutedType({ typeUri: "t:Resource", typeSubstituted: true })).toBe(true);
  });
});

describe("recordFromServed", () => {
  it("flattens each fact to the string the editor holds, keeps the facts as served, and records the opaque ones", () => {
    const doc = {
      "@context": "ctx",
      "@id": `${ORIGIN}/base/e/r1`,
      "@type": "t:Task",
      title: "T",
      count: 3,
      done: false,
      owner: { "@id": `${ORIGIN}/base/e/p1` },
      tags: ["a", "b"],
      scale: { low: 1, high: 5 },
      mixed: ["a", { low: 1 }],
      empty: null,
    };
    const rec = recordFromServed("r1", doc, '"e"');
    expect(rec.facts).toEqual({
      title: "T",
      count: "3",
      done: "false",
      owner: `${ORIGIN}/base/e/p1`,
      tags: "a, b",
      scale: "",
      mixed: "a, ",
      empty: "",
    });
    expect([...rec.opaqueFacts].sort()).toEqual(["mixed", "scale"]);
    expect(rec.served?.facts.owner).toEqual({ "@id": `${ORIGIN}/base/e/p1` });
    expect(rec.servedKeys).toEqual(Object.keys(rec.facts));
    expect(rec.etag).toBe('"e"');
    expect(rec.typeUri).toBe(typeUri("Task"));
    expect(rec.typeSubstituted).toBeUndefined();
  });
  it("a fact served as a:<slug> is held under the bare slug and remembered as prefixed", () => {
    const rec = recordFromServed("r1", { "@id": `${ORIGIN}/base/e/r1`, "@type": "t:Task", "a:title": "T", name: "N" }, null);
    expect(rec.facts).toEqual({ title: "T", name: "N" });
    expect(rec.served?.prefixedKeys).toEqual(["title"]);
  });
  it("the framing keys are not facts", () => {
    const rec = recordFromServed("r1", { "@context": "c", "@id": `${ORIGIN}/base/e/r1`, "@type": "t:Task" }, null);
    expect(rec.facts).toEqual({});
    expect(rec.servedKeys).toEqual([]);
  });
  it("a document that names no type, or a list with an empty first member, is marked substituted", () => {
    for (const doc of [{ "@id": "x" }, { "@id": "x", "@type": "" }, { "@id": "x", "@type": [] }]) {
      const rec = recordFromServed("r1", doc, null);
      expect(rec.typeUri).toBe(typeUri("Resource"));
      expect(rec.typeSubstituted).toBe(true);
    }
  });
  it("a list of types is read by its first member", () => {
    expect(recordFromServed("r1", { "@id": "x", "@type": ["t:Task", "t:Note"] }, null).typeUri).toBe(typeUri("Task"));
  });
});

describe("isFactStringFaithful", () => {
  it.each([
    ["null", null, true],
    ["undefined", undefined, true],
    ["a string", "x", true],
    ["a number", 0, true],
    ["a boolean", false, true],
    ["an edge", { "@id": "x" }, true],
    ["an empty list", [], true],
    ["a list of strings", ["a", "b"], true],
    ["an object with no @id", { low: 1 }, false],
    ["a list holding one such object", ["a", { low: 1 }], false],
    ["a list of edges", [{ "@id": "x" }], true],
  ])("%s", (_name, value, faithful) => {
    expect(isFactStringFaithful(value)).toBe(faithful);
  });
});

describe("addresses and statuses", () => {
  it("readRecord with the record's own entity URI asks that URI's platform host", async () => {
    fetchMock.mockResolvedValue(resp(404, { body: {} }));
    await readRecord("r1", "https://hytta.platform.example.test/base/e/r1");
    expect(fetchMock.mock.calls[0]![0]).toBe("https://hytta.platform.example.test/lws/r/r1");
  });
  it("readRecord with null asks the platform origin", async () => {
    fetchMock.mockResolvedValue(resp(404, { body: {} }));
    await readRecord("r1", null);
    expect(fetchMock.mock.calls[0]![0]).toBe(`${ORIGIN}/lws/r/r1`);
  });
  it("412 and 428 are a RecordConflictError; 403 a RecordForbiddenError carrying the sentence; others the server's sentence", async () => {
    fetchMock.mockResolvedValueOnce(resp(412, { body: "" })).mockResolvedValueOnce(resp(428, { body: "" }));
    await expect(patchRecord("r1", { a: "b" }, null)).rejects.toBeInstanceOf(RecordConflictError);
    await expect(patchRecord("r1", { a: "b" }, null)).rejects.toBeInstanceOf(RecordConflictError);
    fetchMock.mockResolvedValueOnce(resp(403, { body: { message: "not yours to change" } }));
    const forbidden = (await patchRecord("r1", { a: "b" }, null).catch((e) => e)) as RecordForbiddenError;
    expect(forbidden).toBeInstanceOf(RecordForbiddenError);
    expect(forbidden.message).toBe("You do not have write access to this record. not yours to change");
    fetchMock.mockResolvedValueOnce(resp(500, { body: "" }));
    const other = (await readRecord("r1", null).catch((e) => e)) as Error;
    expect(other.message).toBe("LWS request failed (HTTP 500) — no reason was sent — copy this line if you report it");
  });
  it("the errors keep their names", () => {
    expect(new RecordConflictError().name).toBe("RecordConflictError");
    expect(new RecordForbiddenError().name).toBe("RecordForbiddenError");
    expect(new RecordConflictError().message).toBe("This record changed elsewhere since you opened it — reloaded the latest.");
  });
});

describe("createRecord", () => {
  it("takes the id from the Location header, else from the @id of the body", async () => {
    fetchMock.mockResolvedValueOnce(resp(201, { headers: { location: `${ORIGIN}/lws/r/abc` }, body: {} }));
    expect((await createRecord("https://v.platform.example.test/base", typeUri("Note"), { title: "x" })).id).toBe("abc");
    fetchMock.mockResolvedValueOnce(resp(201, { body: { "@id": `${ORIGIN}/lws/r/def` } }));
    expect((await createRecord("https://v.platform.example.test/base", typeUri("Note"), { title: "x" })).id).toBe("def");
  });
  it("sends no Slug when the hint has no usable character; shortens and cleans a long one", async () => {
    fetchMock.mockResolvedValue(resp(201, { headers: { location: `${ORIGIN}/lws/r/abc` }, body: {} }));
    await createRecord("https://v.platform.example.test/base", typeUri("Note"), { title: "x" }, "!!!");
    expect((fetchMock.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>).not.toHaveProperty("slug");
    await createRecord("https://v.platform.example.test/base", typeUri("Note"), { title: "x" }, "  Hello, World — a very long name that goes on and on ");
    expect(((fetchMock.mock.calls.at(-1)![1] as RequestInit).headers as Record<string, string>).slug).toBe("hello-world-a-very-long-name-tha");
  });
  it("carries structured values (an edge object, a number) to the wire unchanged, and omits empty strings but not 0 or false", async () => {
    fetchMock.mockResolvedValue(resp(201, { headers: { location: `${ORIGIN}/lws/r/abc` }, body: {} }));
    await createRecord("https://v.platform.example.test/base", typeUri("Note"), { processOf: { "@id": "https://p.platform.example.test/base/e/p" }, stepOrder: 0, flag: false, empty: "" });
    const body = JSON.parse((fetchMock.mock.calls.at(-1)![1] as RequestInit).body as string) as { facts: Record<string, unknown> };
    expect(body.facts).toEqual({ "a:processOf": { "@id": "https://p.platform.example.test/base/e/p" }, "a:stepOrder": 0, "a:flag": false });
  });
  it("is sent with keepalive, so a write that races a page unload is not dropped", async () => {
    fetchMock.mockResolvedValue(resp(201, { headers: { location: `${ORIGIN}/lws/r/abc` }, body: {} }));
    await createRecord("https://v.platform.example.test/base", typeUri("Note"), { title: "x" });
    expect((fetchMock.mock.calls.at(-1)![1] as RequestInit).keepalive).toBe(true);
    expect(host.dpopWriteAuth).toHaveBeenCalledTimes(1);
  });
});
