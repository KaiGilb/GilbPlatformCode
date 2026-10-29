// @vitest-environment node
// Ported from records.inflight.m3f.test.ts (both tests). Round 5 joined reads of one record asked at the same
// moment; a later review removed the join (a write made through another transport did not end it). Every
// read is its own request, and a read after any write answers the record as it is after that write.
// Not ported: records.inflight.s117.agenttester.test.ts (both tests call deleteRecord, and one deleteStepRecord of processHooks).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { patchRecord, readRecord } from "./records";
import { setUp, tearDown } from "../test/support";

const AT = "https://kai.platform.example.test/vault/e/vsc-1";
let gets = 0;
let version = 1;
function serve() {
  gets = 0;
  version = 1;
  vi.stubGlobal("fetch", async (_url: string, init?: RequestInit) => {
    const m = (init?.method ?? "GET").toUpperCase();
    if (m === "GET") {
      gets++;
      const v = version;
      await new Promise((r) => setTimeout(r, 20));
      return new Response(JSON.stringify({ "@id": AT, "@type": "t:Person", name: `v${v}` }), { status: 200, headers: { etag: `"${v}"` } });
    }
    version++;
    return new Response("{}", { status: 200, headers: { etag: `"${version}"` } });
  });
}
beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("M3f r6 · readRecord: every read is its own request", () => {
  it("two reads at the same moment are two requests, each its own record", async () => {
    serve();
    const [a, b] = await Promise.all([readRecord("vsc-1", AT), readRecord("vsc-1", AT)]);
    expect(gets).toBe(2);
    expect(a).toEqual(b);
    expect(a).not.toBe(b);
  });
  it("a read asked after a write answers the record after it, even while an older read is still out", async () => {
    serve();
    const before = readRecord("vsc-1", AT);
    await patchRecord("vsc-1", { name: "x" }, AT);
    const after = await readRecord("vsc-1", AT);
    await before;
    expect(after!.facts.name).toBe("v2");
  });
});
