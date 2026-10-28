// Cycle145 — THE END-RELATION READ-BACK GUARD WAS ASKING THE APEX, SO IT COULD NOT FAIL.
//
// `endRelation` deliberately does not trust the status code (DEF-6, 2026-08-16: the vault
// answered `201 changed:true` for a connection it never touched). Its guard (2) re-reads the
// relation and refuses to report success if the vault still holds it. That guard called
//
//     readRelationDoc(id)          // ← no `at`
//
// and `vaultOriginOf(null)` is `BASE_ORIGIN` — the apex. Since C144, Base resolves an id at the
// host the request NAMED and at no other (`src/read/entity-uri.ts`, Ann's 2026-07-19 ruling
// 3P.C.EveryEntityInNamedVault.Base), so that read 404s for EVERY vault-hosted relation. `after`
// is `null`, `null` reads as "gone", and the guard reports `verified: true` — always, without
// ever having looked at the vault that holds the connection.
//
// 🔴 A GUARD THAT CANNOT RETURN "NO" IS NOT A GUARD. This file is the falsifiable negative it
// was missing: a vault that answers the END with a truthful-looking 200 and changes nothing.
// At the parent commit the act returns `verified: true` and throws nothing; with the door
// corrected it raises `RelationSurvivedEndError`, which is what a person needs to be told.
//
// ⚠ WHY A NEW FILE RATHER THAN AN ARM ON `relationEnd.def6.test.ts`. That harness models the
// PRE-C144 server: its `resolveById` widens across hosts by id tail, so an apex read-back finds
// the relation there and the missing `at` is invisible. Base no longer does that, and the
// drift is precisely what let this ship. This fixture models the CURRENT server — one host,
// one URI, no widening — and is deliberately kept beside the older one rather than editing it.
//
// ⛔ `./relationWrite` (under change) and `./relationDoc` (the read-back path) are NOT mocked
// (RuleBasetestMockedModuleNoInstrument); a defect planted in either must redden this file.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...(await orig<Record<string, unknown>>()), readRecord: vi.fn(async () => null) }));

import { endRelation, RelationSurvivedEndError } from "./relationWrite";
import { setUp, tearDown } from "../test/support";

/** The vault that HOLDS the connection. Nothing answers anywhere else — the C144 disposition. */
const VAULT = "https://admin.platform.example.test/base";
const VAULT_ORIGIN = "https://admin.platform.example.test";
const REL_ID = "readbackdoor00000001";
const REL_URI = `${VAULT_ORIGIN}/base/r/${REL_ID}`;
const SRC = `${VAULT_ORIGIN}/base/e/rb-source`;
const TGT = `${VAULT_ORIGIN}/base/e/rb-target`;

/** The one relation the vault holds, and whether its role edges are still live. */
let roleEdgesLive = true;
/** When true the END answers 200 `changed:true` and changes nothing — the DEF-6 liar vault. */
let endIsALie = false;
let asked: { method: string; url: string }[] = [];

function json(status: number, payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * The vault, modelled on Base as it stands at `600ed04`.
 *
 * 🔴 THE ONE RULE THAT MATTERS: an id resolves at the host the request NAMED and at no other.
 * Every `/base/r/…` call to any other origin — the apex included — is a 404, exactly as
 * `resolveEntityUriById` produces one. No cross-host widening.
 */
function vault(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : String(input);
  const method = (init?.method ?? "GET").toUpperCase();
  asked.push({ method, url });
  const u = new URL(url, "https://platform.example.test");
  const atVault = u.origin === VAULT_ORIGIN;

  if (method === "POST" && /\/base\/r\/[^/]+\/end$/.test(u.pathname)) {
    if (!atVault) return Promise.resolve(json(404, { error: "NotFound" }));
    // The vault reports success either way. That is the whole point: the status code is not the
    // outcome, which is why guard (2) exists at all.
    if (!endIsALie) roleEdgesLive = false;
    return Promise.resolve(json(200, { relation: REL_URI, changed: true }));
  }

  if (method === "GET" && /\/base\/r\/[^/?#]+$/.test(u.pathname)) {
    if (!atVault) return Promise.resolve(json(404, { error: "NotFound" }));
    return Promise.resolve(
      json(200, {
        "@id": REL_URI,
        "@type": "t:PartOf",
        ...(roleEdgesLive
          ? { "role:source": { "@id": SRC }, "role:target": { "@id": TGT } }
          : { "a:relationLifecycleState": "ended" }),
      }),
    );
  }

  return Promise.resolve(json(404, { error: "NotFound", url }));
}

const readBacks = () => asked.filter((c) => c.method === "GET" && /\/base\/r\//.test(c.url));

beforeEach(() => {
  setUp();
  asked = [];
  roleEdgesLive = true;
  endIsALie = false;
  vi.stubGlobal("fetch", vi.fn(vault));
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

describe("C145 — endRelation's read-back guard asks the vault that holds the connection", () => {
  it("🔴 REFUSES to report success when the vault still holds the connection", async () => {
    // The vault answers the END with `200 changed:true` and leaves both role edges live — the
    // measured DEF-6 shape. Asked at the apex the read-back 404s and this passes silently.
    endIsALie = true;
    await expect(endRelation(REL_URI, VAULT)).rejects.toBeInstanceOf(RelationSurvivedEndError);
    await expect(endRelation(REL_URI, VAULT)).rejects.toThrow(/still holds this connection/i);
  });

  it("🔴 the read-back names the relation's own vault — never the apex", async () => {
    endIsALie = true;
    await endRelation(REL_URI, VAULT).catch(() => undefined);
    expect(readBacks().length).toBeGreaterThan(0);
    expect(readBacks().every((c) => c.url.startsWith(VAULT_ORIGIN))).toBe(true);
  });

  it("a BARE id still reaches the vault, because the caller named it", async () => {
    // An old share-link carries no host. The vault is still named on the act, and that is an
    // address the vault itself gave us — never a guess and never a widening scan.
    endIsALie = true;
    await expect(endRelation(REL_ID, VAULT)).rejects.toBeInstanceOf(RelationSurvivedEndError);
    expect(readBacks().every((c) => c.url.startsWith(VAULT_ORIGIN))).toBe(true);
  });

  it("🔴 the relation's OWN URI outranks the named vault — they are not the same address", async () => {
    // ⚠ VATester F5: with `VAULT` and `REL_URI` on one origin, "own URI wins" and "the named vault
    // wins" are indistinguishable and `includes("://")` is dead code the file cannot see. Name
    // a DIFFERENT vault on the act: the relation still resolves at its own host, because its URI
    // is an address and the vault argument is only the fallback for an id that has none.
    endIsALie = true;
    // The act AND the read-back both reach the relation's own host — ⛔ never the named vault,
    // which holds nothing. The refusal that comes back is guard (2)'s ("still holds"), which is
    // only reachable if the read-back went to the right door: at the named vault it would 404 and
    // the act would report a clean end.
    await expect(
      endRelation(REL_URI, "https://someone-else.platform.example.test/base"),
    ).rejects.toBeInstanceOf(RelationSurvivedEndError);
    expect(asked.some((c) => c.method === "POST" && c.url.startsWith(VAULT_ORIGIN))).toBe(true);
    expect(readBacks().every((c) => c.url.startsWith(VAULT_ORIGIN))).toBe(true);
    expect(asked.some((c) => c.url.includes("someone-else.platform.example.test"))).toBe(false);
  });

  it("🔴 a 404 on the END is NOT a verified end — it may just be the wrong vault", async () => {
    // ⚠ The 404 branch used to return `verified: true` on the reading "the route 404s only
    // after the write predicate passed, so this is an honest nothing-to-end". Since C144 that
    // reading is unsound: an id resolves ONLY at the host the request named, so a connection
    // held elsewhere 404s here while existing perfectly well. `verified` must therefore be
    // `null` — the confirming read did not run — and `changed` false is what says nothing
    // happened. ⛔ `true` is a claim about a store nobody looked at.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => json(404, { error: "NotFound" })),
    );
    const res = await endRelation(REL_URI, VAULT);
    expect(res.changed).toBe(false);
    expect(res.verified).toBeNull();
    expect(res.verified).not.toBe(true);
  });

  it("POSITIVE CONTROL — a connection the vault really ended verifies clean", async () => {
    // ⛔ The fix must not turn every end into a refusal. When the vault actually drops the role
    // edges, the same read-back at the same door confirms it and the act returns verified.
    const res = await endRelation(REL_URI, VAULT);
    expect(res.verified).toBe(true);
    expect(res.changed).toBe(true);
    expect(roleEdgesLive).toBe(false);
  });
});
