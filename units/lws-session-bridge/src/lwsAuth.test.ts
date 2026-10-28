// @vitest-environment node
// The seam: every member delegates to the host set with setLwsAuth, the same arguments in the same order; a header-forming member
// answers {} for a URL outside the platform without asking the host; and using the seam before it is set throws a sentence naming setLwsAuth.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  resetBaseOrigin,
  resetLocalRigHosts,
  resetSystemVaultHosts,
  setBaseOrigin,
  setLocalRigHosts,
  setSystemVaultHosts,
} from "@kaigilb/gilbplatformcode-base-origin";
import {
  bearerHeaderFor,
  dpopBoundMs,
  dpopReadAuth,
  dpopWriteAuth,
  invalidateDpop,
  resetLwsAuth,
  setLwsAuth,
  tokenManager,
  type LwsAuthHost,
  type LwsSession,
} from "./lwsAuth";

const ORIGIN = "https://platform.example.test";
const SYSTEM_HOSTS = ["veda.platform.example.test", "geo.platform.example.test", "life.platform.example.test", "id.platform.example.test", "kaizen.platform.example.test"];
const SESSION: LwsSession = { principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [{ vaultId: "https://kai.platform.example.test/base", modes: ["read", "write"] }] };

function fakeHost() {
  const host = {
    bearerHeaderFor: vi.fn(async (_url: string, _method?: string) => ({ authorization: "DPoP t-bearer", dpop: "p-bearer" })),
    dpopReadAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-read", dpop: "p-read" })),
    dpopWriteAuth: vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP t-write", dpop: "p-write" })),
    invalidateDpop: vi.fn(),
    tokenManager: { getSession: vi.fn(async () => SESSION), invalidate: vi.fn() },
  };
  return host satisfies LwsAuthHost;
}

function configure(origin: string) {
  setBaseOrigin(origin);
  setSystemVaultHosts(SYSTEM_HOSTS);
}

beforeEach(() => configure(ORIGIN));
afterEach(() => {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetLocalRigHosts();
});

describe("before setLwsAuth", () => {
  it("every member throws a sentence that names setLwsAuth", async () => {
    await expect(bearerHeaderFor(`${ORIGIN}/lws/r/x`)).rejects.toThrow(/setLwsAuth/);
    await expect(dpopReadAuth("GET", `${ORIGIN}/lws/r/x`)).rejects.toThrow(/setLwsAuth/);
    await expect(dpopWriteAuth("POST", `${ORIGIN}/lws/r/x`)).rejects.toThrow(/setLwsAuth/);
    expect(() => invalidateDpop()).toThrow(/setLwsAuth/);
    expect(() => tokenManager.invalidate()).toThrow(/setLwsAuth/);
    expect(() => tokenManager.getSession()).toThrow(/setLwsAuth/);
  });
  it("a foreign URL is not a way past the check: the unset seam is loud for it too", async () => {
    await expect(bearerHeaderFor("https://evil.example/x")).rejects.toThrow(/setLwsAuth/);
  });
  it("after resetLwsAuth the seam is unset again", async () => {
    setLwsAuth(fakeHost());
    await expect(bearerHeaderFor(`${ORIGIN}/lws/r/x`)).resolves.toHaveProperty("authorization");
    resetLwsAuth();
    await expect(bearerHeaderFor(`${ORIGIN}/lws/r/x`)).rejects.toThrow(/setLwsAuth/);
  });
});

describe("delegation to the host", () => {
  it("bearerHeaderFor(url) asks the host with the URL alone, and returns its answer", async () => {
    const host = fakeHost();
    setLwsAuth(host);
    const url = `${ORIGIN}/lws/r/abc`;
    expect(await bearerHeaderFor(url)).toEqual({ authorization: "DPoP t-bearer", dpop: "p-bearer" });
    expect(host.bearerHeaderFor).toHaveBeenCalledTimes(1);
    expect(host.bearerHeaderFor.mock.calls[0]).toEqual([url]);
  });
  it("bearerHeaderFor(url, method) passes the method on", async () => {
    const host = fakeHost();
    setLwsAuth(host);
    const url = `${ORIGIN}/lws/r/abc`;
    await bearerHeaderFor(url, "PATCH");
    expect(host.bearerHeaderFor.mock.calls[0]).toEqual([url, "PATCH"]);
  });
  it("dpopReadAuth and dpopWriteAuth pass (method, url) in that order and answer the host's headers", async () => {
    const host = fakeHost();
    setLwsAuth(host);
    const url = `${ORIGIN}/lws/vault/v/c`;
    expect(await dpopReadAuth("GET", url)).toEqual({ authorization: "DPoP t-read", dpop: "p-read" });
    expect(await dpopWriteAuth("POST", url)).toEqual({ authorization: "DPoP t-write", dpop: "p-write" });
    expect(host.dpopReadAuth.mock.calls).toEqual([["GET", url]]);
    expect(host.dpopWriteAuth.mock.calls).toEqual([["POST", url]]);
  });
  it("invalidateDpop and tokenManager.invalidate reach their own host member", () => {
    const host = fakeHost();
    setLwsAuth(host);
    invalidateDpop();
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
    expect(host.tokenManager.invalidate).not.toHaveBeenCalled();
    tokenManager.invalidate();
    expect(host.tokenManager.invalidate).toHaveBeenCalledTimes(1);
  });
  it("tokenManager.getSession answers the host's session", async () => {
    setLwsAuth(fakeHost());
    expect(await tokenManager.getSession()).toBe(SESSION);
  });
  it("a spy on tokenManager works the way the app's tests spy on theirs", async () => {
    setLwsAuth(fakeHost());
    const spy = vi.spyOn(tokenManager, "invalidate");
    tokenManager.invalidate();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
  it("a second setLwsAuth replaces the host", async () => {
    const first = fakeHost();
    const second = fakeHost();
    setLwsAuth(first);
    setLwsAuth(second);
    await dpopReadAuth("GET", `${ORIGIN}/lws/r/x`);
    expect(first.dpopReadAuth).not.toHaveBeenCalled();
    expect(second.dpopReadAuth).toHaveBeenCalledTimes(1);
  });
  it("an error the host throws reaches the caller as it is", async () => {
    const host = fakeHost();
    const boom = new Error("mint failed");
    host.dpopWriteAuth.mockRejectedValueOnce(boom);
    setLwsAuth(host);
    await expect(dpopWriteAuth("POST", `${ORIGIN}/lws/r/x`)).rejects.toBe(boom);
  });
  it("dpopBoundMs is 10 seconds", () => {
    expect(dpopBoundMs()).toBe(10_000);
  });
});

const FOREIGN = [
  "https://evil.example/lws/r/x",
  "https://platform.example.test.evil.example/lws/r/x",
  "https://evil.example/@platform.example.test/lws/r/x",
  "https://kai.platform.example.test:8443/lws/r/x",
  "http://kai.platform.example.test/lws/r/x",
  "https://[::1]/lws/r/x",
  "ftp://kai.platform.example.test/lws/r/x",
  "//evil.example/lws/r/x",
  "https://",
];

describe("the platform-host gate: a URL outside the platform gets NO header and the host is not asked", () => {
  for (const url of FOREIGN) {
    it(`${url}`, async () => {
      const host = fakeHost();
      setLwsAuth(host);
      expect(await bearerHeaderFor(url)).toEqual({});
      expect(await bearerHeaderFor(url, "PATCH")).toEqual({});
      expect(await dpopReadAuth("GET", url)).toEqual({});
      expect(await dpopWriteAuth("POST", url)).toEqual({});
      expect(host.bearerHeaderFor).not.toHaveBeenCalled();
      expect(host.dpopReadAuth).not.toHaveBeenCalled();
      expect(host.dpopWriteAuth).not.toHaveBeenCalled();
    });
  }

  it("CONTROL: the platform origin and a platform subdomain are asked", async () => {
    const host = fakeHost();
    setLwsAuth(host);
    for (const url of [`${ORIGIN}/lws/r/x`, "https://kai.platform.example.test/lws/r/x", "/lws/vaults"]) {
      expect(await dpopReadAuth("GET", url), url).toEqual({ authorization: "DPoP t-read", dpop: "p-read" });
    }
    expect(host.dpopReadAuth).toHaveBeenCalledTimes(3);
  });

  it("a gate that is off would send the credential: the host answer is what a foreign URL would have got", async () => {
    // Mutation guard in prose: with the gate removed the host is called and its headers returned for the foreign URL.
    const host = fakeHost();
    setLwsAuth(host);
    const direct = await host.dpopReadAuth("GET", "https://evil.example/x");
    expect(direct).toHaveProperty("authorization");
    expect(await dpopReadAuth("GET", "https://evil.example/x")).toEqual({});
  });

  it("with no platform origin set no URL may carry a credential", async () => {
    resetBaseOrigin();
    const host = fakeHost();
    setLwsAuth(host);
    expect(await dpopReadAuth("GET", `${ORIGIN}/lws/r/x`)).toEqual({});
    expect(host.dpopReadAuth).not.toHaveBeenCalled();
  });
});

describe("F-3 (ported): a system host outside the build's own family gets no credential; inside it, it does", () => {
  const SYSTEM: [what: string, entity: string][] = [
    ["GilbVeda", "https://veda.platform.example.test/base/e/06gtermx"],
    ["GilbGeo", "https://geo.platform.example.test/base/e/osm-r-1"],
    ["the life tree vault", "https://life.platform.example.test/base/e/salmo"],
    ["GilbID", "https://id.platform.example.test/base/e/06gvault"],
    ["the Kai-Zen vault", "https://kaizen.platform.example.test/base/e/06gstd"],
  ];
  const members: [string, (url: string) => Promise<Record<string, string>>][] = [
    ["bearerHeaderFor", (u) => bearerHeaderFor(u)],
    ["dpopReadAuth", (u) => dpopReadAuth("GET", u)],
    ["dpopWriteAuth", (u) => dpopWriteAuth("POST", u)],
  ];

  for (const [member, call] of members) {
    for (const [what, entity] of SYSTEM) {
      it(`DEV rig: ${member}, ${what}: no credential`, async () => {
        configure("http://localhost:8787");
        setLocalRigHosts(["localhost"]);
        const host = fakeHost();
        setLwsAuth(host);
        expect(await call(entity)).toEqual({});
        expect(host.bearerHeaderFor).not.toHaveBeenCalled();
        expect(host.dpopReadAuth).not.toHaveBeenCalled();
        expect(host.dpopWriteAuth).not.toHaveBeenCalled();
      });
      it(`PROD: ${member}, ${what}: the credential`, async () => {
        setLwsAuth(fakeHost());
        expect(Object.keys(await call(entity)).sort()).toEqual(["authorization", "dpop"]);
      });
    }
  }

  it("DEV control: a request to the rig's own origin carries the credential", async () => {
    configure("http://localhost:8787");
    setLocalRigHosts(["localhost"]);
    setLwsAuth(fakeHost());
    expect(await dpopReadAuth("GET", "http://localhost:8787/lws/r/x")).toHaveProperty("authorization");
  });
});
