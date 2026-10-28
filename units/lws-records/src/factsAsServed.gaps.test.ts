// Cycle214 GAPP214.42 F2/B1 re-gate (VATester, independent QA of 5058f46) — gap tests.
//
// My mutation round at 5058f46 left four arms of the vault-context read with no test red:
//   Z2  a failed fetch (network error, CORS refusal) or a 200 whose body is not JSON counted as an
//       ANSWERED empty context → fvParent sent back as text. The shipped code refuses (measured on
//       my rig: context request refused → "nothing was changed", store unchanged); no test said so.
//   Z4  two writes at once each asked for the context (no shared in-flight read).
//   Z5  the request was not aborted at the 5 s limit (it stayed open).
//   Z14 a failed read kept 1 s instead of a minute.
//   Z6  text with a space and a colon ("Note: see …") counted as address-shaped → a context read,
//       and a refusal when the context cannot be read, for a fact that cannot be a link.
// Each test below is red under its arm and green at 5058f46.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { factsAsServed, ServedLinkUnreadableError, type ServedDocument } from "./records";
import { resetVaultContextCache } from "./vaultContext";
import { SERVED_CONTEXT } from "../test/servedContext.fixture";
import { setUp, tearDown } from "../test/support";

const VAULT = "https://hv.platform.example.test";
const CTX = `${VAULT}/base/context.jsonld`;
const LWS = "https://www.w3.org/ns/lws/v1";
const AT = `${VAULT}/base/e/rec1`;
const PARENT = `${VAULT}/base/e/fn-parent`;
const VAULT_CTX = SERVED_CONTEXT["@context"] as Record<string, unknown>;
const doc = (facts: Record<string, unknown>): ServedDocument => ({ facts, context: LWS, etag: '"sha256:0"' });

let fetchMock: ReturnType<typeof vi.fn>;
const asked = () => fetchMock.mock.calls.filter(([u]) => String(u) === CTX).length;

beforeEach(() => {
  setUp();
  resetVaultContextCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("VATester 5058f46 gaps: the vault-context read", () => {
  it("VQ-F2-NET: the context request fails at the network (fetch rejects, as a CORS refusal or a closed port does): the write is REFUSED, fvParent is never sent as text, and the failure is kept (one request)", async () => {
    fetchMock = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetchMock);
    await expect(factsAsServed(doc({ name: "Fn", fvParent: PARENT }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
    await expect(factsAsServed(doc({ name: "Fn", fvParent: PARENT }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
    expect(asked()).toBe(1);
  });

  it("VQ-F2-NOTJSON: the context answers 200 with a body that is not JSON (an HTML error page): the write is REFUSED", async () => {
    fetchMock = vi.fn(async () => new Response("<html>gateway</html>", { status: 200, headers: { "content-type": "text/html" } }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(factsAsServed(doc({ fvParent: PARENT }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
  });

  it("VQ-F2-ATONCE: two writes at the same moment share ONE request for the vault's context", async () => {
    let release: (r: Response) => void = () => {};
    fetchMock = vi.fn(() => new Promise<Response>((res) => (release = res)));
    vi.stubGlobal("fetch", fetchMock);
    const a = factsAsServed(doc({ fvParent: PARENT }), AT);
    const b = factsAsServed(doc({ fvParent: PARENT }), AT);
    await Promise.resolve();
    release(new Response(JSON.stringify({ "@context": VAULT_CTX }), { status: 200 }));
    const [fa, fb] = await Promise.all([a, b]);
    expect(fa.facts.fvParent).toEqual({ "@id": PARENT });
    expect(fb.facts.fvParent).toEqual({ "@id": PARENT });
    expect(fetchMock.mock.calls.length).toBe(1);
  });

  it("VQ-F2-MINUTE: a failed read is kept for the whole minute: 59 s later the next write is refused without asking again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      fetchMock = vi.fn(async () => new Response("{}", { status: 503 }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(factsAsServed(doc({ fvParent: PARENT }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
      vi.setSystemTime(Date.now() + 59_000);
      await expect(factsAsServed(doc({ fvParent: PARENT }), AT)).rejects.toBeInstanceOf(ServedLinkUnreadableError);
      expect(asked()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("VQ-F2-ABORT: at the 5 s limit the context request itself is cancelled, not left open", async () => {
    vi.useFakeTimers();
    try {
      let signal: AbortSignal | undefined;
      fetchMock = vi.fn((_u: string, init?: RequestInit) => {
        signal = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      });
      vi.stubGlobal("fetch", fetchMock);
      const p = factsAsServed(doc({ fvParent: PARENT }), AT).catch((e) => e);
      await vi.advanceTimersByTimeAsync(5_100);
      expect(await p).toBeInstanceOf(ServedLinkUnreadableError);
      expect(signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("VQ-F2-PROSE: text with a space and a colon (\"Note: see https://…\") cannot be a link: no context read, and nothing refused when the context cannot be read", async () => {
    fetchMock = vi.fn(async () => new Response("{}", { status: 500 }));
    vi.stubGlobal("fetch", fetchMock);
    const { facts } = await factsAsServed(doc({ name: "Note: see https://example.test/a" }), AT);
    expect(facts).toEqual({ name: "Note: see https://example.test/a" });
    expect(fetchMock.mock.calls.length).toBe(0);
  });
});
