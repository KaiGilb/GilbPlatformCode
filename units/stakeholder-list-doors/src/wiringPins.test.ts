// New. The person card wiring and the identity fetch pinned against the fake auth host: the platform origin read at the moment of the call,
// the holder's connections key and read, one canonicaliser per holder, the anchor share bound to a controller, and the 401 of the identity
// fetch.
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import { setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import {
  __resetPersonCardSession,
  anchorShareOf,
  bindAnchorShare,
  canonicaliserFor,
  connectionsKey,
  personCardPlatform,
  readHolderConnections,
  resolveRecordPersonCard,
  type AnchorShare,
} from "./personCard";
import { identityFetch } from "./onlineCardWiring";
import { ORIGIN, installPlatformHooks, setUp, tearDown } from "../test/support";

installPlatformHooks();
afterEach(() => {
  vi.unstubAllGlobals();
});

const HOLDER = "https://id.platform.example.test/base/p/holder";
const OWN = "https://holder.platform.example.test/vault";

describe("personCardPlatform", () => {
  it("is the identity node of the moment: the origin is read at each call, and the fetch is the identity fetch", () => {
    expect(personCardPlatform().origin).toBe(ORIGIN);
    setBaseOrigin("https://other.example.test");
    expect(personCardPlatform().origin).toBe("https://other.example.test");
    expect(personCardPlatform().fetch).toBe(identityFetch);
  });
});

describe("connectionsKey and readHolderConnections", () => {
  it("one key per holder and own vault", () => {
    expect(connectionsKey("h", "v")).toEqual(["person-card", "connections", "h", "v"]);
    expect(connectionsKey("h", "v")).not.toEqual(connectionsKey("h", "w"));
  });
  it("reads the connections at the own vault's node, naming the vault, with the DPoP pair", async () => {
    const seen: { url: string; headers: Record<string, string> }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, headers: init?.headers as Record<string, string> });
      return new Response(JSON.stringify({ holder: HOLDER, vaultId: OWN, sets: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    await expect(readHolderConnections(OWN)).resolves.toMatchObject({ holder: HOLDER });
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`https://holder.platform.example.test/base/connect/audience-rung/members?vaultId=${encodeURIComponent(OWN)}`);
    expect(seen[0]!.headers).toMatchObject({ authorization: "DPoP tok", dpop: "proof" });
  });
});

describe("canonicaliserFor", () => {
  it("is one per holder for the session, and a new session starts again", () => {
    __resetPersonCardSession();
    const a = canonicaliserFor("h1");
    expect(canonicaliserFor("h1")).toBe(a);
    expect(canonicaliserFor("h2")).not.toBe(a);
    __resetPersonCardSession();
    expect(canonicaliserFor("h1")).not.toBe(a);
  });
});

describe("the anchor share of an open card", () => {
  it("is found by the controller it was bound to; no controller, or one never bound, has none", () => {
    const controller = {};
    const share: AnchorShare = { answer: null };
    expect(anchorShareOf(controller)).toBeNull();
    bindAnchorShare(controller, share);
    expect(anchorShareOf(controller)).toBe(share);
    expect(anchorShareOf({})).toBeNull();
    expect(anchorShareOf(null)).toBeNull();
  });
});

describe("resolveRecordPersonCard", () => {
  it("resolves one held record's person card from the session's connections", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (url.includes("audience-rung/members")) return new Response(JSON.stringify({ holder: HOLDER, vaultId: OWN, sets: [] }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    });
    const card = await resolveRecordPersonCard(new QueryClient(), { recordUri: `${OWN}/e/rec`, link: { state: "none" }, holder: HOLDER, ownVaultId: OWN, share: null });
    expect(card).toBeTypeOf("object");
    expect(card).not.toBeNull();
  });
});

describe("identityFetch", () => {
  it("signs the request for its own url and method (GET by default, in capitals), keeping the caller's headers", async () => {
    const auth = setUp();
    const seen: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      seen.push({ url, init });
      return new Response("{}", { status: 200 });
    });
    await identityFetch(`${ORIGIN}/base/x`);
    await identityFetch(`${ORIGIN}/base/y`, { method: "post", headers: { "x-own": "1" } });
    expect(auth.dpopReadAuth.mock.calls.map((c) => [c[0], c[1]])).toEqual([["GET", `${ORIGIN}/base/x`], ["POST", `${ORIGIN}/base/y`]]);
    expect(seen[0]!.init.method).toBe("GET");
    expect(seen[1]!.init.method).toBe("POST");
    expect(seen[1]!.init.headers).toMatchObject({ "x-own": "1", authorization: "DPoP tok", dpop: "proof" });
    tearDown();
  });
  it("a 401 drops the held token and is still the answer (the controller reads it as 'sign in again'), never an exception", async () => {
    const auth = setUp();
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 401 }));
    const res = await identityFetch(`${ORIGIN}/base/x`);
    expect(res.status).toBe(401);
    expect(auth.invalidateDpop).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 500 }));
    await identityFetch(`${ORIGIN}/base/x`);
    expect(auth.invalidateDpop).toHaveBeenCalledTimes(1);
    tearDown();
  });
});
