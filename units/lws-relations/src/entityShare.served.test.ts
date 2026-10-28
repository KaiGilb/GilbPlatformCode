// Ported from the "Share this item" block of `src/lib/base/factsAsServed.c214gapp42.test.ts` (2 cases): the share act re-asserts a
// record's whole fact set, and it sends it as the vault served it. `readRecord`, `factsAsServed`, `storedSpellings` and `shareEntity`
// are all real (the first three are `lws-records`); only the network and the credential are stood in for.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetVaultContextCache } from "@kaigilb/gilbplatformcode-lws-records";
import { shareEntity } from "./entityShare";
import { SERVED_CONTEXT } from "../test/servedContext.fixture";
import { setUp, tearDown } from "../test/support";

const VAULT = "https://hv.platform.example.test";
const CTX = `${VAULT}/base/context.jsonld`;
const LWS = "https://www.w3.org/ns/lws/v1";
const VAULT_CTX = SERVED_CONTEXT["@context"] as Record<string, unknown>;
const AT = `${VAULT}/base/e/rec1`;
const LINK = { "@id": `${VAULT}/base/e/vsc-holder` };
const LIST = [{ "@id": `${VAULT}/base/e/ann` }, { "@id": `${VAULT}/base/e/bo` }];
const LANG = { "@value": "Hei", "@language": "nb" };

let fetchMock: ReturnType<typeof vi.fn>;
const asked = (prefix: string) => fetchMock.mock.calls.filter(([u]) => String(u).startsWith(prefix)).length;

beforeEach(() => {
  setUp();
  resetVaultContextCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("Share this item (grantDirect re-asserts the whole fact set)", () => {
  it("C214-42-N1-SHARE: sharing a record whose stater is a link sends the link and the list as served, ⛔ not their text", async () => {
    const posts: { url: string; body: Record<string, unknown> }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const u = String(url);
        if (u.includes("/lws/r/rec1") && (init?.method ?? "GET") === "GET") {
          return new Response(JSON.stringify({ "@id": AT, "@type": "t:Person", "a:name": "Ann", "a:statedBy": LINK, "a:memberOf": LIST, "a:jobTitle": LANG }), {
            status: 200,
            headers: { etag: '"sha256:3"' },
          });
        }
        if (init?.method === "POST" && typeof init.body === "string") {
          posts.push({ url: u, body: JSON.parse(init.body) });
          return new Response("{}", { status: 200 });
        }
        return new Response("{}", { status: 404 });
      }),
    );
    await shareEntity("rec1", "https://other.platform.example.test/base", "read", "hv", AT);
    const grant = posts.find((p) => /grant/.test(p.url));
    expect(grant, "the grant act was posted").toBeTruthy();
    const facts = grant!.body.facts as Record<string, unknown>;
    expect(facts["a:statedBy"]).toEqual(LINK);
    expect(facts["a:memberOf"]).toEqual(LIST);
    expect(facts["a:jobTitle"], "a value with no string form is sent, ⛔ not dropped").toEqual(LANG);
    expect(facts["a:name"]).toBe("Ann");
  });

  it("C214-42-F2-SHARE: the record served as GET /lws/r serves it (LWS context, fvParent a bare address): the share sends fvParent as a link and keeps a served empty value (Y14); www.w3.org is not asked", async () => {
    const posts: { url: string; body: Record<string, unknown> }[] = [];
    fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u === CTX) return new Response(JSON.stringify({ "@context": VAULT_CTX }), { status: 200 });
      if (u.includes("/lws/r/rec1") && (init?.method ?? "GET") === "GET") {
        return new Response(
          JSON.stringify({ "@context": LWS, "@id": AT, "@type": "t:Function", "a:name": "Fn", fvParent: `${VAULT}/base/e/fn-parent`, "a:description": "" }),
          { status: 200, headers: { etag: '"sha256:4"' } },
        );
      }
      if (init?.method === "POST" && typeof init.body === "string") {
        posts.push({ url: u, body: JSON.parse(init.body) });
        return new Response("{}", { status: 200 });
      }
      return new Response("{}", { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    await shareEntity("rec1", "https://other.platform.example.test/base", "read", "hv", AT);
    const grant = posts.find((p) => /grant/.test(p.url));
    expect(grant, "the grant act was posted").toBeTruthy();
    const facts = grant!.body.facts as Record<string, unknown>;
    const fvKey = Object.keys(facts).find((k) => /fvParent$/.test(k));
    expect(fvKey, "fvParent is sent").toBeTruthy();
    expect(facts[fvKey!], "a link, ⛔ not its text").toEqual({ "@id": `${VAULT}/base/e/fn-parent` });
    expect(facts["a:description"], "the served empty value is kept (Y14)").toBe("");
    expect(asked(LWS)).toBe(0);
  });
});
