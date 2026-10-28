// @vitest-environment node
// The term read must ask the origin when told to revalidate, bust only on request, and share one request between concurrent readers.
// Ported from ontologyReadRevalidate.c161.test.ts (the blocks that do not go through `loadOntologyFocus`, which is not taken). The app's
// `invalidateOntologyTermCache` is the test seam `__resetOntologyTermsForTest` here.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setTermOrigin, resetTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { __resetOntologyTermsForTest, fetchOntologyTerm, fetchTermAtRef } from "./ontologyTerms";

const TERM_IRI = "https://ontology.platform.example.test/base/t/SafetyImpact";

/** Verbatim shape of the term-plane document (a:-prefixed keys), trimmed to what docFromRaw reads. */
const SAFETY_IMPACT_TERM = {
  "@id": TERM_IRI,
  "a:label": "Safety Impact",
  "a:ontologyStatus": "Suggested",
  "a:does": "Safety Impact is the % deviation from target levels (targets = 0% level).",
};

/** Every (url, cache-mode) pair the client asked for — what network panel would show. */
let calls: Array<{ url: string; cache: string | undefined }> = [];

function installWire() {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      calls.push({ url: String(input), cache: init?.cache });
      return new Response(JSON.stringify(SAFETY_IMPACT_TERM), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }),
  );
}

beforeEach(() => {
  installWire();
  setTermOrigin("https://ontology.platform.example.test");
  __resetOntologyTermsForTest();
});

afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
  __resetOntologyTermsForTest();
});

describe("D2 — the focus-term read must ASK the origin, not trust max-age=3600", () => {
  it("🔴 revalidate ⇒ cache:'no-cache' — the mode that makes the refresh truthful", async () => {
    await fetchOntologyTerm(TERM_IRI, { revalidate: true });

    expect(calls).toHaveLength(1);
    // THE ASSERTION THE DEFECT FAILS. Before the fix this branch passed no options at all and
    // the mode was "default" — the browser served the hour-old body without asking.
    expect(calls[0].cache).toBe("no-cache");
    // ⛔ "no-store" would also be "fresh", but it throws the cache away and pays for the body on
    // every term open. Revalidation is the point: keep the cache, verify it.
    expect(calls[0].cache).not.toBe("no-store");
  });

  it("🔴 revalidate must NOT append a cache-buster — a unique URL can never match an ETag", async () => {
    await fetchOntologyTerm(TERM_IRI, { revalidate: true });

    // `?_=<ts>` is what `bust` does. On the revalidate path it would defeat the 304: a URL the
    // cache has never seen has no stored ETag to send, so every read would pay full body.
    expect(calls[0].url).toBe(TERM_IRI);
    expect(calls[0].url).not.toContain("_=");
  });

  it("bust is UNCHANGED — still no-store + cache-buster (the post-save hammer)", async () => {
    await fetchOntologyTerm(TERM_IRI, { bust: true });

    expect(calls[0].cache).toBe("no-store");
    expect(calls[0].url).toContain("_=");
  });

  it("a plain read is UNCHANGED — 'default' (proves the fix did not silently widen)", async () => {
    await fetchOntologyTerm(TERM_IRI);

        // If this ever flips to no-cache it is a deliberate widening and must be argued on latency, not drifted into.
    expect(calls[0].cache).toBe("default");
  });

  it("fetchTermAtRef threads revalidate through to the term plane", async () => {
    await fetchTermAtRef(TERM_IRI, { revalidate: true });

    expect(calls[0].cache).toBe("no-cache");
  });


  it("🔴 two concurrent revalidating readers share ONE request — the doubling measured", async () => {
        // Without coalescing this url went from 1 request to 2: `revalidate` deletes the shared termDocCache entry, so a pane and the
        // focus loader could no longer share a result. This pins the repair.
    const [a, b] = await Promise.all([
      fetchOntologyTerm(TERM_IRI, { revalidate: true }),
      fetchOntologyTerm(TERM_IRI, { revalidate: true }),
    ]);

    expect(calls).toHaveLength(1);
    expect(calls[0].cache).toBe("no-cache");
    // Both callers get the answer; coalescing must not starve the second one.
    expect(a?.label).toBe("Safety Impact");
    expect(b?.label).toBe("Safety Impact");
  });

  it("coalescing does NOT outlive the request — a later read still revalidates", async () => {
    await fetchOntologyTerm(TERM_IRI, { revalidate: true });
    expect(calls).toHaveLength(1);

    // The in-flight entry must be released on settle, or a stale answer would be pinned
    // forever and this fix would have replaced an hour-long cache with a permanent one.
    await fetchOntologyTerm(TERM_IRI, { revalidate: true });
    expect(calls).toHaveLength(2);
  });

  it("revalidate bypasses the in-memory termDocCache — a warm entry must not shadow the origin", async () => {
    // Warm the in-memory cache the way an ordinary read would.
    await fetchOntologyTerm(TERM_IRI);
    expect(calls).toHaveLength(1);

    // A second plain read is served from memory — no second request.
    await fetchOntologyTerm(TERM_IRI);
    expect(calls).toHaveLength(1);

    // Revalidate must go to the wire anyway, or the refresh would still show the stale doc
    // whenever the in-memory entry is still inside its 5-minute TTL.
    await fetchOntologyTerm(TERM_IRI, { revalidate: true });
    expect(calls).toHaveLength(2);
    expect(calls[1].cache).toBe("no-cache");
  });
});
