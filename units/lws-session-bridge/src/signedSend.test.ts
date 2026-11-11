// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resetBaseOrigin, resetSystemVaultHosts, setBaseOrigin, setSystemVaultHosts } from "@kaigilb/gilbplatformcode-base-origin";
import { NotSignedInError } from "./errors";
import { resetLwsAuth, setLwsAuth, type LwsAuthHost } from "./lwsAuth";
import { signedSend } from "./signedSend";

const ORIGIN = "https://platform.example.test";

function host(): LwsAuthHost & { read: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn> } {
  const read = vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "read-proof" }));
  const write = vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "write-proof" }));
  return {
    read,
    write,
    bearerHeaderFor: async () => ({}),
    dpopReadAuth: read,
    dpopWriteAuth: write,
    invalidateDpop: () => undefined,
    tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate: () => undefined },
  } as never;
}

beforeEach(() => {
  setBaseOrigin(ORIGIN);
  setSystemVaultHosts([]);
});
afterEach(() => {
  resetLwsAuth();
  resetBaseOrigin();
  resetSystemVaultHosts();
});

describe("signedSend", () => {
  it("signs a GET as a read and sends the pair with no cookies", async () => {
    const h = host();
    setLwsAuth(h);
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
    await signedSend(f as never)("GET", `${ORIGIN}/lws/vaults`);
    expect(h.read).toHaveBeenCalledWith("GET", `${ORIGIN}/lws/vaults`);
    expect(h.write).not.toHaveBeenCalled();
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${ORIGIN}/lws/vaults`);
    expect(init!.method).toBe("GET");
    expect(init!.credentials).toBe("omit");
    const headers = init!.headers as Headers;
    expect(headers.get("authorization")).toBe("DPoP tok");
    expect(headers.get("dpop")).toBe("read-proof");
  });
  it("signs POST, PUT, PATCH and DELETE as writes, with the method for which the proof is made, and keeps the caller's headers and body", async () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      const h = host();
      setLwsAuth(h);
      const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
      await signedSend(f as never)(method, `${ORIGIN}/lws/r/x`, { body: "b", headers: { "content-type": "application/json", authorization: "caller" } });
      expect(h.write).toHaveBeenCalledWith(method, `${ORIGIN}/lws/r/x`);
      expect(h.read).not.toHaveBeenCalled();
      const init = f.mock.calls[0]![1]!;
      expect(init.body).toBe("b");
      const headers = init.headers as Headers;
      expect(headers.get("content-type")).toBe("application/json");
      expect(headers.get("authorization")).toBe("DPoP tok");
      expect(headers.get("dpop")).toBe("write-proof");
    }
  });
  it("a lower-case method is sent upper-case and signed once per request, so each proof is fresh", async () => {
    const h = host();
    setLwsAuth(h);
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
    const send = signedSend(f as never);
    await send("get", `${ORIGIN}/a`);
    await send("get", `${ORIGIN}/a`);
    expect(h.read).toHaveBeenCalledTimes(2);
    expect(h.read).toHaveBeenNthCalledWith(1, "GET", `${ORIGIN}/a`);
    expect(f.mock.calls[0]![1]!.method).toBe("GET");
  });
  it("a URL outside the platform is sent with no credential and the host is not asked", async () => {
    const h = host();
    setLwsAuth(h);
    const f = vi.fn(async (_u: string, _i?: RequestInit) => new Response("ok"));
    await signedSend(f as never)("GET", "https://elsewhere.example.org/x");
    expect(h.read).not.toHaveBeenCalled();
    expect((f.mock.calls[0]![1]!.headers as Headers).get("authorization")).toBeNull();
  });
  it("when signing fails it rejects with NotSignedInError and sends nothing", async () => {
    const h = host();
    h.read.mockRejectedValue(new NotSignedInError());
    setLwsAuth(h);
    const f = vi.fn(async () => new Response("ok"));
    await expect(signedSend(f as never)("GET", `${ORIGIN}/x`)).rejects.toBeInstanceOf(NotSignedInError);
    expect(f).not.toHaveBeenCalled();
  });
  it("uses the global fetch, looked up at call time, when none is given", async () => {
    setLwsAuth(host());
    const f = vi.fn(async () => new Response("ok"));
    vi.stubGlobal("fetch", f);
    try {
      const send = signedSend();
      await send("GET", `${ORIGIN}/x`);
      expect(f).toHaveBeenCalledTimes(1);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
