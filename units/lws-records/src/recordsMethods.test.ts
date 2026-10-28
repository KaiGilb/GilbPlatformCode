// @vitest-environment node
// New tests for the three functions added in 0.3.0: `withTypeUri`, and the method each write hands to the credential seam.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { deleteRecord, retypeRecord, withTypeUri, type BaseRecord } from "./records";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

const base: BaseRecord = { id: "r1", typeUri: "t:Note", facts: { title: "A" }, opaqueFacts: [], etag: '"e1"' } as unknown as BaseRecord;

beforeEach(() => {
  setUp();
});
afterEach(() => tearDown());

describe("withTypeUri", () => {
  it("replaces the type and keeps every other member", () => {
    const out = withTypeUri(base, "t:Task");
    expect(out.typeUri).toBe("t:Task");
    expect(out.facts).toEqual({ title: "A" });
    expect(out.etag).toBe('"e1"');
    expect(base.typeUri).toBe("t:Note");
  });
  it("drops the substituted mark when the new type is a real one", () => {
    const marked = { ...base, typeSubstituted: true as const };
    expect("typeSubstituted" in withTypeUri(marked, "t:Task")).toBe(false);
  });
  it("keeps the substituted mark only while the new type is the unknown marker (t:Resource)", () => {
    const marked = { ...base, typeSubstituted: true as const };
    expect(withTypeUri(marked, "t:Resource").typeSubstituted).toBe(true);
    expect(withTypeUri(marked, "t:Resource").typeUri).toBe("t:Resource");
  });
  it("does not add the mark to a record that had none", () => {
    expect("typeSubstituted" in withTypeUri(base, "t:Task")).toBe(false);
  });
});

describe("the method the write hands to the credential seam", () => {
  let host: FakeHost;
  let fetchMock: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    host = setUp();
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  it("retypeRecord asks for a PUT credential for the record's own address", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"n"' } }));
    await retypeRecord("id-1", "Task", '"o"', "https://h.platform.example.test/base/e/id-1", {});
    const [url, method] = host.bearerHeaderFor.mock.calls[0]!;
    expect(String(url)).toMatch(/\/lws\/r\/id-1$/);
    expect(method).toBe("PUT");
  });
  it("deleteRecord asks for a DELETE credential", async () => {
    fetchMock.mockResolvedValue(resp(204));
    await deleteRecord("id-1", null);
    expect(host.bearerHeaderFor.mock.calls[0]![1]).toBe("DELETE");
  });
  it("retypeRecord sends the facts it was given and the optional source", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"n"' } }));
    await retypeRecord("id-1", "t:Task", '"o"', null, { title: "X" });
    const body = JSON.parse((fetchMock.mock.calls[0]![1] as RequestInit).body as string);
    expect(body.type).toBe("t:Task");
    expect(body.facts).toEqual({ "a:title": "X" });
  });
  it("a 412 on retype is a RecordConflictError", async () => {
    fetchMock.mockResolvedValue(resp(412));
    await expect(retypeRecord("id-1", "Task", '"o"', null, {})).rejects.toMatchObject({ name: "RecordConflictError" });
  });
});
