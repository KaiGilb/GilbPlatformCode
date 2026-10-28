// @vitest-environment node
// platformFetch, pinned: the URL it hands on, the proof it signs with, the headers it sets, and what it leaves alone. A fake inner fetch and a fake session; no network.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, resetLocalRigHosts, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { atVaultOrigin } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { platformFetch, type TermFetch } from "./platformFetch";
import * as unit from "./index";

const ORIGIN = "https://platform.example.test";
const SUB = "https://u.platform.example.test";
const SESSION = { principal: `${ORIGIN}/base/p/ann`, vault: null, vaults: [] };

function fakeAuth() {
  const host = {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP t-bearer", dpop: "p-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-read", dpop: "p-read" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-write", dpop: "p-write" })),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: vi.fn(async () => SESSION), invalidate: vi.fn() },
  };
  return host satisfies LwsAuthHost;
}

function innerFetch() {
  const calls: { url: string; init: RequestInit & { headers: Headers } }[] = [];
  const answer = new Response("ok");
  const inner: TermFetch = async (url, init) => {
    calls.push({ url, init: init as RequestInit & { headers: Headers } });
    return answer;
  };
  return { inner, calls, answer };
}

let auth: ReturnType<typeof fakeAuth>;
beforeEach(() => {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts(["veda.platform.example.test"]);
  auth = fakeAuth();
  setLwsAuth(auth);
});
afterEach(() => {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
  vi.unstubAllGlobals();
});

describe("the method", () => {
  it("is GET when the init names none, and the signer is asked for GET", async () => {
    const { inner } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`);
    expect(auth.dpopWriteAuth).toHaveBeenCalledTimes(1);
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("GET", `${ORIGIN}/lws/r/x`);
    const again = innerFetch();
    await platformFetch(again.inner)(`${ORIGIN}/lws/r/x`, {});
    expect(auth.dpopWriteAuth).toHaveBeenLastCalledWith("GET", `${ORIGIN}/lws/r/x`);
  });

  it("is upper-cased for the signer, and the init's own method reaches inner as the caller wrote it", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/base/tag/masters`, { method: "post" });
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("POST", `${ORIGIN}/base/tag/masters`);
    expect(calls[0]!.init.method).toBe("post");
  });

  it("every request, a read included, is signed with the WRITE proof: the read proof and the bearer are never asked", async () => {
    const { inner } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`, { method: "GET" });
    expect(auth.dpopWriteAuth).toHaveBeenCalledTimes(1);
    expect(auth.dpopReadAuth).not.toHaveBeenCalled();
    expect(auth.bearerHeaderFor).not.toHaveBeenCalled();
  });
});

describe("the headers", () => {
  it("the signer's headers are set on the request; the caller's other headers are kept", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`, { headers: { "x-trace": "t1", accept: "application/json" } });
    const h = calls[0]!.init.headers;
    expect(h).toBeInstanceOf(Headers);
    expect(h.get("x-trace")).toBe("t1");
    expect(h.get("accept")).toBe("application/json");
    expect(h.get("authorization")).toBe("DPoP t-write");
    expect(h.get("dpop")).toBe("p-write");
  });

  it("a caller's header of the same name is overwritten by the signer's, whatever its case", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`, { headers: { Authorization: "Bearer stolen", DPoP: "forged" } });
    const h = calls[0]!.init.headers;
    expect(h.get("authorization")).toBe("DPoP t-write");
    expect(h.get("dpop")).toBe("p-write");
    expect([...h.keys()].filter((k) => k === "authorization")).toHaveLength(1);
  });

  it("the caller's headers may be a Headers or a list of pairs", async () => {
    const a = innerFetch();
    await platformFetch(a.inner)(`${ORIGIN}/lws/r/x`, { headers: new Headers({ "x-a": "1" }) });
    expect(a.calls[0]!.init.headers.get("x-a")).toBe("1");
    const b = innerFetch();
    await platformFetch(b.inner)(`${ORIGIN}/lws/r/x`, { headers: [["x-b", "2"]] });
    expect(b.calls[0]!.init.headers.get("x-b")).toBe("2");
  });

  it("with no init the request still carries the signer's headers", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`);
    expect(calls[0]!.init.headers.get("dpop")).toBe("p-write");
  });

  it("the caller's own init object is not changed", async () => {
    const { inner } = innerFetch();
    const init: RequestInit = { method: "POST", headers: { "x-trace": "t1" } };
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`, init);
    expect(init).toEqual({ method: "POST", headers: { "x-trace": "t1" } });
  });

  it("a fresh proof is asked for on every call", async () => {
    let n = 0;
    auth.dpopWriteAuth.mockImplementation(async () => ({ authorization: "DPoP t", dpop: `p-${++n}` }));
    const { inner, calls } = innerFetch();
    const f = platformFetch(inner);
    await f(`${ORIGIN}/lws/r/x`);
    await f(`${ORIGIN}/lws/r/x`);
    expect(calls.map((c) => c.init.headers.get("dpop"))).toEqual(["p-1", "p-2"]);
  });
});

describe("the URL", () => {
  it("is the platform-host rule's: a foreign host is moved to the platform origin, path and query kept, and the signer is asked for the moved URL", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)("https://evil.example/vault/e/x?y=1");
    expect(calls[0]!.url).toBe(`${ORIGIN}/vault/e/x?y=1`);
    expect(calls[0]!.url).toBe(atVaultOrigin("https://evil.example/vault/e/x?y=1"));
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("GET", `${ORIGIN}/vault/e/x?y=1`);
  });

  it("a host that joins the platform's name onto a foreign one is moved too", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)("https://platform.example.test.evil.example/ctx");
    expect(calls[0]!.url).toBe(`${ORIGIN}/ctx`);
  });

  it("a platform subdomain over https is kept at its own origin", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${SUB}/vault/e/x`);
    expect(calls[0]!.url).toBe(`${SUB}/vault/e/x`);
    expect(auth.dpopWriteAuth).toHaveBeenCalledWith("GET", `${SUB}/vault/e/x`);
  });

  it("the platform's own URL is kept, query included; a fragment is dropped (as `atVaultOrigin` drops it)", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x?a=1`);
    expect(calls[0]!.url).toBe(`${ORIGIN}/lws/r/x?a=1`);
    await platformFetch(inner)(`${ORIGIN}/lws/r/x#frag`);
    expect(calls[1]!.url).toBe(`${ORIGIN}/lws/r/x`);
  });
});

describe("the credentialed fetch asks only a platform host (ported from the app's credential-host test)", () => {
  // The package builds its URLs as text; for a non-http IRI such as an `@context` of `urn:.evil.example/ctx` the glued host is the data's.
  const GLUED: [what: string, url: string, at: string][] = [
    ["a glued look-alike host", "https://u.platform.example.test.evil.example/ctx", `${ORIGIN}/ctx`],
    ["a glued host with no dot", "https://u.platform.example.testevil.example/ctx", `${ORIGIN}/ctx`],
    ["apex-origin glue", "https://platform.example.test.evil.example/ctx", `${ORIGIN}/ctx`],
    ["a foreign host", "https://evil.example/lws/r/x?y=1", `${ORIGIN}/lws/r/x?y=1`],
    ["protocol-relative", "//evil.example/lws/r/x", `${ORIGIN}/lws/r/x`],
    ["CONTROL: a platform vault host is kept", `${SUB}/lws/r/x`, `${SUB}/lws/r/x`],
  ];
  for (const [what, url, at] of GLUED) {
    it(`${what}: ${url} goes to ${at}, the proof signed for it`, async () => {
      const { inner, calls } = innerFetch();
      await platformFetch(inner)(url, { method: "PUT" });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.url).toBe(at);
      expect(auth.dpopWriteAuth).toHaveBeenCalledWith("PUT", at);
      expect(calls[0]!.init.headers.get("authorization")).toBe("DPoP t-write");
    });
  }
});

describe("what it leaves alone", () => {
  it("the init's other fields reach inner unchanged, and inner's answer is the answer", async () => {
    const { inner, calls, answer } = innerFetch();
    const signal = new AbortController().signal;
    const body = JSON.stringify({ vault: SUB });
    const res = await platformFetch(inner)(`${ORIGIN}/base/tag/masters`, { method: "POST", body, signal, cache: "no-store", credentials: "omit" });
    expect(res).toBe(answer);
    const init = calls[0]!.init;
    expect([init.method, init.body, init.signal, init.cache, init.credentials]).toEqual(["POST", body, signal, "no-store", "omit"]);
    expect(calls).toHaveLength(1);
  });

  it("inner is called once, with the URL as a string and an init", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)(`${ORIGIN}/lws/r/x`);
    expect(calls).toHaveLength(1);
    expect(typeof calls[0]!.url).toBe("string");
  });

  it("a failure of inner is the caller's", async () => {
    const f = platformFetch(async () => { throw new TypeError("offline"); });
    await expect(f(`${ORIGIN}/lws/r/x`)).rejects.toThrow("offline");
  });
});

describe("a URL the session bridge will not sign for", () => {
  it("is sent unsigned, not refused: the bridge answers no headers for a URL outside the platform, and the host is never asked", async () => {
    const { inner, calls } = innerFetch();
    await platformFetch(inner)("ftp://files.example.test/a", { headers: { "x-trace": "t1" } });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe("ftp://files.example.test/a");
    expect(auth.dpopWriteAuth).not.toHaveBeenCalled();
    const h = calls[0]!.init.headers;
    expect(h.get("x-trace")).toBe("t1");
    expect(h.has("authorization")).toBe(false);
    expect(h.has("dpop")).toBe(false);
  });
});

describe("before the session is set", () => {
  it("the call throws a sentence naming setLwsAuth, and inner is never called", async () => {
    resetLwsAuth();
    const { inner, calls } = innerFetch();
    await expect(platformFetch(inner)(`${ORIGIN}/lws/r/x`)).rejects.toThrow(/setLwsAuth/);
    expect(calls).toHaveLength(0);
  });

  it("a signer that fails stops the request: inner is never called", async () => {
    auth.dpopWriteAuth.mockRejectedValueOnce(new Error("no sign-in"));
    const { inner, calls } = innerFetch();
    await expect(platformFetch(inner)(`${ORIGIN}/lws/r/x`)).rejects.toThrow("no sign-in");
    expect(calls).toHaveLength(0);
  });
});

describe("the default inner fetch", () => {
  it("is the global fetch, looked up when the request is made, called with the moved URL and the init", async () => {
    const f = platformFetch();
    const seen: { url: string; init: RequestInit | undefined }[] = [];
    vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
      seen.push({ url, init });
      return new Response("global");
    });
    const res = await f("https://evil.example/lws/r/x", { method: "put" });
    expect(await res.text()).toBe("global");
    expect(seen).toHaveLength(1);
    expect(seen[0]!.url).toBe(`${ORIGIN}/lws/r/x`);
    expect(seen[0]!.init?.method).toBe("put");
    expect((seen[0]!.init?.headers as Headers).get("dpop")).toBe("p-write");
  });
});

describe("the unit's export list", () => {
  it("is platformFetch alone (TermFetch is a type)", () => {
    expect(Object.keys(unit).sort()).toEqual(["platformFetch"]);
  });
});
