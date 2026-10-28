// ACCEPTANCE CHECK — clause 4: a type term resolves, and an UNREACHABLE term is never
// rendered as an UNDEFINED one. Pre-authored before the implementation.
//
// ── WHAT WAS MEASURED, AND WHY THIS EXISTS ──────────────────────────────────────────
// In Kai's own session on vault `c148` (2026-08-20), `/base/t/NoteDocument` returned 404
// FIVE times, while `/base/a/label`, `/base/a/title` and `/base/a/body` returned 200.
// Probing five types settled that it is systematic, not a missing term:
//
//     t/NoteDocument  apex=404  veda=200        a/title  apex=200
//     t/Person        apex=404  veda=200        a/label  apex=200
//     t/Task          apex=404  veda=200        a/body   apex=200
//     t/Vault           apex=404  veda=200        a/name   apex=200
//     t/Process       apex=404  veda=200
//
// The cause is the lookup KEY, not the crossing: `/base/a/:slug` looks a term up by SLUG
// (host-independent), while `/base/t/:Type` builds `typeIri(routedHost, Type)` and looks
// up by that HOST-QUALIFIED IRI. Asked at the apex it seeks `https://platform.example.test/base/t/X`,
// an IRI no term carries, so it 404s. Asked at `veda.platform.example.test` it seeks the veda-canonical
// IRI the term actually has, and answers.
//
// ⛔ THE SERVER IS NOT THE THING TO CHANGE. Serving the term under the apex IRI would mint
// a SECOND canonical IRI for one concept and create exactly the catch-all vocabulary
// `3P.C.EveryEntityInNamedVault` forbids (vocab.ts states this in terms). The client must ask
// the term's OWN canonical host — which is Kai's ruling: "like
// https://veda.platform.example.test/base/t/ControlMode if that is what is needed."
//
// ── THE SECOND DEFECT, WHICH IS THE WORSE ONE ───────────────────────────────────────
// `readTermDoes` returned `string | null`, collapsing "404 — could not reach it" and
// "reached it, it has no a:does" onto the SAME `null`. The UI then rendered
// "No definition on this term." — an ASSERTION THAT THE TERM HAS NO DEFINITION, when the
// truth was that the request never reached it. Kai saw this on screen: `authored-by`
// (a `/base/a/` predicate) rendered its full definition beside `t:Person` claiming none,
// while `t:Person` is fully defined at veda. A missing answer presented as a factual
// negative is the same failure class as an empty `@graph` served with 200. The three-state
// return below makes that conflation unrepresentable rather than merely discouraged.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { readTermDefinition } from "./termDefinition";
import { defaultOntologyHost } from "./ontologyBrowse";
import { resetBaseOrigin, resetLocalRigHosts, resetPublicCorpusOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

beforeEach(() => {
  setBaseOrigin("https://platform.example.test");
  setSystemVaultHosts(["veda.platform.example.test"]);
  setTermOrigin("https://veda.platform.example.test");
});
afterEach(() => {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  resetPublicCorpusOrigin();
  resetTermOrigin();
});


afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Capture the URLs asked, and answer each with a supplied response. */
function stubFetch(handler: (url: string) => Response | Promise<Response>) {
  const asked: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      asked.push(String(url));
      return handler(String(url));
    }),
  );
  return asked;
}

const jsonLd = (body: unknown) =>
  new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/ld+json" },
  });

describe("the type term is asked of its OWN canonical host", () => {
  it("addresses veda, not the app's own origin", async () => {
    const asked = stubFetch(() => jsonLd({ "a:does": "identifies a human being" }));
    await readTermDefinition("Person");

    expect(asked).toHaveLength(1);
    expect(asked[0]).toBe(`https://${defaultOntologyHost()}/base/t/Person`);
    // The measured defect: asking the APEX 404s, because no term carries an apex IRI.
    // Compare origins, not substrings — `https://veda.platform.example.test` legitimately contains
    // `platform.example.test`, so a substring check here would reject the correct answer.
    expect(new URL(asked[0]!).origin).toBe(`https://${defaultOntologyHost()}`);
    expect(new URL(asked[0]!).origin).not.toBe("https://platform.example.test");
  });

  it("percent-encodes the term name", async () => {
    const asked = stubFetch(() => jsonLd({ "a:does": "x" }));
    await readTermDefinition("Note Document");
    expect(asked[0]).toBe(`https://${defaultOntologyHost()}/base/t/Note%20Document`);
  });

  it("accepts a t: CURIE and strips the prefix", async () => {
    const asked = stubFetch(() => jsonLd({ "a:does": "x" }));
    await readTermDefinition("t:Person");
    expect(asked[0]).toBe(`https://${defaultOntologyHost()}/base/t/Person`);
  });
});

describe("DEFINED — the definition is returned", () => {
  it("reads a:does as a plain string", async () => {
    stubFetch(() => jsonLd({ "a:does": "  identifies a human being  " }));
    expect(await readTermDefinition("Person")).toEqual({
      state: "defined",
      does: "identifies a human being",
    });
  });

  it("reads a:does in expanded @value form", async () => {
    stubFetch(() => jsonLd({ "a:does": { "@value": "identifies a human being" } }));
    expect(await readTermDefinition("Person")).toEqual({
      state: "defined",
      does: "identifies a human being",
    });
  });

  it("reads the bare `does` alias", async () => {
    stubFetch(() => jsonLd({ does: "identifies a human being" }));
    expect(await readTermDefinition("Person")).toEqual({
      state: "defined",
      does: "identifies a human being",
    });
  });
});

describe("NONE — reached the term, and it genuinely has no definition", () => {
  it("returns state:none for a 200 carrying no a:does", async () => {
    stubFetch(() => jsonLd({ "a:label": "Person" }));
    expect(await readTermDefinition("Person")).toEqual({ state: "none" });
  });

  it("returns state:none for an empty-string a:does", async () => {
    stubFetch(() => jsonLd({ "a:does": "   " }));
    expect(await readTermDefinition("Person")).toEqual({ state: "none" });
  });
});

describe("🔴 UNREACHABLE — never reported as 'no definition'", () => {
  it("a 404 is UNREACHABLE, not none", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const r = await readTermDefinition("Person");
    expect(r.state).toBe("unreachable");
    // The whole point: an unreachable term must not be describable as undefined.
    expect(r.state).not.toBe("none");
  });

  it("a 5xx is UNREACHABLE", async () => {
    stubFetch(() => new Response("", { status: 503 }));
    expect((await readTermDefinition("Person")).state).toBe("unreachable");
  });

  it("a network throw is UNREACHABLE", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    expect((await readTermDefinition("Person")).state).toBe("unreachable");
  });

  it("unparseable JSON is UNREACHABLE, not none", async () => {
    stubFetch(
      () => new Response("<html>not json</html>", { status: 200, headers: { "content-type": "text/html" } }),
    );
    expect((await readTermDefinition("Person")).state).toBe("unreachable");
  });

  it("carries a reason a person can act on", async () => {
    stubFetch(() => new Response("", { status: 404 }));
    const r = await readTermDefinition("Person");
    if (r.state !== "unreachable") throw new Error("expected unreachable");
    expect(r.reason).toContain(defaultOntologyHost());
  });
});

describe("no authorization header — the corpus is public and Bearer empties it", () => {
  it("sends accept only", async () => {
    let sawAuth = true;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init?: RequestInit) => {
        const h = (init?.headers ?? {}) as Record<string, string>;
        sawAuth = Object.keys(h).some((k) => k.toLowerCase() === "authorization");
        return jsonLd({ "a:does": "x" });
      }),
    );
    await readTermDefinition("Person");
    // Measured defect referenced in termSearch.ts: a Bearer on the cross-origin corpus
    // request yields an EMPTY catalog. veda answers `access-control-allow-headers:
    // accept, if-none-match` — an authorization header would fail preflight outright.
    expect(sawAuth).toBe(false);
  });
});
