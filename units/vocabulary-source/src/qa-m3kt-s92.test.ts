// Ported from `gilb-stakeholders` `test/qa-c214-m3kt-s92.test.ts` at 27fe0cef: 3 of its 31 tests (the others call symbols that are not in this unit).
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { masterSource } from "./source";
import { MasterTimeoutError } from "./terms";
import { withDeadline } from "./deadline";

const T0 = 1_000_000_000_000;

const unhandled: unknown[] = [];
const onUnhandled = (e: unknown) => void unhandled.push(e);
process.on("unhandledRejection", onUnhandled);
afterEach(() => {
  vi.useRealTimers();
});

// ── Display and write at once against a hanging master ────────────────────────────────────────────────────────────────

describe("S92 concurrent display + write against a hanging master", () => {

  it("S92-C3 no unhandled rejection reached the process in this file so far", () => {
    expect(unhandled).toEqual([]);
  });
});

// ── The wire: a real HTTP server that sends its headers, then stalls the body ─────────────────────────────────────────

describe("S92 wire (real fetch, real HTTP, 127.0.0.1, OS-assigned port)", () => {
  let server: Server;
  let base = "";
  const opened: { url: string; closedAt: number | null; at: number }[] = [];
  beforeEach(async () => {
    opened.length = 0;
    server = createServer((req, res) => {
      const rec = { url: req.url ?? "", closedAt: null as number | null, at: Date.now() };
      opened.push(rec);
      res.on("close", () => (rec.closedAt = Date.now()));
      res.writeHead(200, { "content-type": "application/json" });
      res.write('{"@id": "x", "children": ['); // headers and a first chunk, then nothing
    });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });
  afterEach(async () => {
    server.closeAllConnections();
    await new Promise<void>((r) => server.close(() => r()));
  });

  it("S92-X1 injected 300 ms: a term read rejects MasterTimeoutError in 300-1,000 ms and the server sees its connection closed (the abort reached the wire)", async () => {
    const src = masterSource({ vedaOrigin: base, timeoutMs: 300 });
    const t0 = Date.now();
    let err: unknown;
    try {
      await src.term(src.termIri("t/Stakeholder"));
    } catch (e) {
      err = e;
    }
    const took = Date.now() - t0;
    expect(err).toBeInstanceOf(MasterTimeoutError);
    expect(took).toBeGreaterThanOrEqual(299);
    expect(took).toBeLessThan(1_000);
    await new Promise((r) => setTimeout(r, 200));
    expect(opened.length).toBe(1);
    expect(opened[0]!.closedAt).not.toBeNull();
    console.log(`S92-X1 rejected after ${took} ms; server saw close ${opened[0]!.closedAt! - opened[0]!.at} ms after the request`);
  });
});

// ── Gap tests for the two mutants the suite above left alive (N3, N18) ──────────────────────────────────────────────────

describe("S92 gaps", () => {
  it("S92-G1 withDeadline removes every listener it put on a parent signal, however the work ends (answer, refusal, deadline)", async () => {
    vi.useFakeTimers({ now: T0 });
    const ac = new AbortController();
    let added = 0;
    let removed = 0;
    const add0 = ac.signal.addEventListener.bind(ac.signal);
    const rem0 = ac.signal.removeEventListener.bind(ac.signal);
    ac.signal.addEventListener = ((...a: Parameters<typeof add0>) => (added++, add0(...a))) as typeof add0;
    ac.signal.removeEventListener = ((...a: Parameters<typeof rem0>) => (removed++, rem0(...a))) as typeof rem0;
    const opts = { ms: 1_000, parents: [ac.signal], timeoutError: () => new Error("t"), abortError: () => new Error("a") };
    await withDeadline(async () => 1, opts);
    await withDeadline(async () => Promise.reject(new Error("no")), opts).catch(() => {});
    const late = withDeadline(() => new Promise(() => {}), opts).catch(() => {});
    await vi.advanceTimersByTimeAsync(1_000);
    await late;
    expect(added).toBe(3);
    expect(removed).toBe(3);
    expect(vi.getTimerCount()).toBe(0);
  });
});
