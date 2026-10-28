// @vitest-environment node
// Ported from records.test.ts (the deleteRecord and retypeRecord blocks) and records.deleteIfMatch.v38.test.ts. The app's token and DPoP mocks
// are a fake host set with setLwsAuth. The ported retype blocks reached the function with a dynamic import; here it is imported at the top.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RecordConflictError, deleteRecord, retypeRecord } from "./records";
import { resp, setUp, tearDown } from "../test/support";

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

/** Extracts the [url, init] of the last fetch call. */
function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit];
}

describe("deleteRecord (DELETE /lws/r/:id)", () => {
  it("succeeds on 204 and is idempotent on 404", async () => {
    fetchMock.mockResolvedValue(resp(204));
    await expect(deleteRecord("id", null)).resolves.toBeUndefined();
    fetchMock.mockResolvedValue(resp(404));
    await expect(deleteRecord("id", null)).resolves.toBeUndefined();
  });
});

describe("deleteRecord with a precondition", () => {
  it("sends If-Match", async () => {
    fetchMock.mockResolvedValue(resp(204));
    await deleteRecord("id", null, { ifMatch: '"sha256:aa"' });
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect((init.headers as Record<string, string>)["if-match"]).toBe('"sha256:aa"');
  });
  it("a 404 is an error with status 404 (not success)", async () => {
    fetchMock.mockResolvedValue(resp(404));
    const e = await deleteRecord("id", null, { ifMatch: '"sha256:aa"' }).then(() => null, (x: unknown) => x);
    expect((e as { status?: number } | null)?.status).toBe(404);
  });
  it("a 412 is a RecordConflictError", async () => {
    fetchMock.mockResolvedValue(resp(412));
    await expect(deleteRecord("id", null, { ifMatch: '"sha256:aa"' })).rejects.toBeInstanceOf(RecordConflictError);
  });
  it("without a precondition nothing changed: no If-Match, 404 is still idempotent", async () => {
    fetchMock.mockResolvedValue(resp(404));
    await expect(deleteRecord("id", null)).resolves.toBeUndefined();
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)["if-match"]).toBeUndefined();
  });
});

describe("retypeRecord (W-RETYPE PUT /lws/r/:id)", () => {
  // Same <ID>, new <TYPE>, PUT only. ⛔ Not merge-from-rendered-read of every fact.
  it("W-RETYPE PUT is id + type + If-Match, not a rendered-read merge", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"sha256:new"' } }));
    const out = await retypeRecord("id-1", "Task", '"sha256:old"', null, { title: "Named" });
    expect(out).toEqual({ etag: '"sha256:new"' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = lastCall();
    expect(init.method).toBe("PUT");
    expect(String(url)).toMatch(/\/lws\/r\/id-1$/);
    expect((init.headers as Record<string, string>)["if-match"]).toBe('"sha256:old"');
    const body = JSON.parse(init.body as string) as { type: string; facts: Record<string, unknown> };
    // the CURIE, which GilbPlatform's write door accepts; a bare "Task" is
    // refused with 400. Changed from "Task" for that reason.
    expect(body.type).toBe("t:Task");
    expect(body.facts).toEqual({ "a:title": "Named" });
    expect(body.facts["a:directReader"]).toBeUndefined();
  });

  it("an empty type is refused before anything is sent", async () => {
    fetchMock.mockClear();
    await expect(retypeRecord("id-1", " t: ", '"sha256:old"', null, { title: "Named" })).rejects.toThrow(/nothing was sent/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("W-RETYPE does not GET before PUT", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"sha256:new"' } }));
    await retypeRecord("id-1", "Task", '"sha256:old"', null, { title: "Named" });
    const methods = fetchMock.mock.calls.map((c) => (c[1] as RequestInit | undefined)?.method);
    expect(methods).toEqual(["PUT"]);
    expect(methods).not.toContain("GET");
  });
});
