// @vitest-environment node
// The signed sender a host hands to the file calls is lws-session-bridge's `signedSend` (this unit does not depend on it; only this test does).
import { afterEach, describe, expect, test, vi } from "vitest";
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetLwsAuth, setLwsAuth, signedSend } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { listVaultFiles, type Send } from "./index";

const ORIGIN = "https://platform.example.test";

afterEach(() => {
  resetLwsAuth();
  resetBaseOrigin();
  vi.unstubAllGlobals();
});

describe("signedSend as picture-set's Send", () => {
  test("listVaultFiles signs its GET as a read, one fresh proof per page", async () => {
    setBaseOrigin(ORIGIN);
    const read = vi.fn(async (_m: string, _u: string) => ({ authorization: "DPoP tok", dpop: "proof" }));
    setLwsAuth({
      bearerHeaderFor: async () => ({}),
      dpopReadAuth: read,
      dpopWriteAuth: async () => ({}),
      invalidateDpop: () => undefined,
      tokenManager: { getSession: async () => ({ principal: "p", vault: null, vaults: [] }), invalidate: () => undefined },
    });
    const f = vi.fn(async () => new Response(JSON.stringify({ count: 1, files: [{ entity: `${ORIGIN}/vault/e/f1`, fileName: "a.jpg" }] }), { status: 200 }));
    vi.stubGlobal("fetch", f);
    const send: Send = signedSend();
    const files = await listVaultFiles("https://platform.example.test/vault", { origin: ORIGIN, send });
    expect(files.map((x) => x.fileName)).toEqual(["a.jpg"]);
    expect(read).toHaveBeenCalledTimes(1);
    expect(read.mock.calls[0]![0]).toBe("GET");
    expect(read.mock.calls[0]![1]).toContain("/lws/vault/");
  });
});
