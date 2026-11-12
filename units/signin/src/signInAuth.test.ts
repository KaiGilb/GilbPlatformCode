import { describe, expect, it } from "vitest";
import { makeSignInAuth } from "./session";
import type { Transport, TransportRequest } from "./transport";

const ORIGIN = "https://id.example.test";

type Sent = { url: string; req: TransportRequest };

function rig(answers: Record<string, { status: number; body: unknown }> = {}) {
  const sent: Sent[] = [];
  const transport: Transport = async (url, req) => {
    sent.push({ url, req });
    const path = new URL(url).pathname;
    const a = answers[path] ?? { status: 200, body: {} };
    return { status: a.status, json: async () => a.body };
  };
  const verifies: unknown[][] = [];
  const credential = {
    signInWithCode: async (...args: unknown[]) => {
      verifies.push(args);
      return { needsVaultName: true, suggestedName: "annhouseplants" } as never;
    },
  };
  return { sent, transport, credential, verifies };
}

describe("makeSignInAuth", () => {
  it("requestCode posts the email to the origin, with the product name in refusals", async () => {
    const r = rig();
    const auth = makeSignInAuth({ credential: r.credential, origin: ORIGIN, productName: "PictureRecords", transport: r.transport });
    await auth.requestCode(" ann@example.test ", "https://app.example.test/");
    expect(r.sent).toHaveLength(1);
    expect(r.sent[0].url).toBe(`${ORIGIN}/base/auth/email/request-code`);
    expect(JSON.parse(r.sent[0].req.body as string)).toEqual({ email: "ann@example.test", return_to: "https://app.example.test/" });
  });

  it("a refused request-code names the product", async () => {
    const r = rig({ "/base/auth/email/request-code": { status: 429, body: {} } });
    const auth = makeSignInAuth({ credential: r.credential, origin: ORIGIN, productName: "PictureRecords", transport: r.transport });
    await expect(auth.requestCode("a@example.test")).rejects.toThrow(/PictureRecords refused the sign-in \(HTTP 429\)/);
  });

  it("verifyCode goes through the credential with origin and product name and maps the answer", async () => {
    const r = rig();
    const auth = makeSignInAuth({ credential: r.credential, origin: ORIGIN, productName: "PictureRecords", transport: r.transport });
    const out = await auth.verifyCode("a@example.test", "123456", "ann");
    expect(r.verifies).toEqual([[ORIGIN, "a@example.test", "123456", "ann", "PictureRecords"]]);
    expect(out).toEqual({ needsVaultName: true, suggestedName: "annhouseplants" });
    expect(r.sent).toHaveLength(0);
  });

  it("prepareName and checkName use the injected transport", async () => {
    const r = rig({
      "/onboard/api/name-prep": { status: 200, body: { isReturning: true, suggestedName: "ann" } },
      "/onboard/api/check-name": { status: 200, body: { available: true, reserved: false, name: "ann" } },
    });
    const auth = makeSignInAuth({ credential: r.credential, origin: ORIGIN, productName: "P", transport: r.transport });
    expect((await auth.prepareName("a@example.test")).isReturning).toBe(true);
    expect((await auth.checkName("ann")).available).toBe(true);
    expect(r.sent.map((s) => new URL(s.url).origin)).toEqual([ORIGIN, ORIGIN]);
  });

  it("completeNamedVault rejects with the sentence by default and resolves when createsVault is true", async () => {
    const r = rig();
    const no = makeSignInAuth({ credential: r.credential, origin: ORIGIN, productName: "PictureRecords" });
    await expect(no.completeNamedVault("x")).rejects.toThrow(
      "Creating a new vault is not part of PictureRecords. Sign in with an account that already has a vault.",
    );
    const yes = makeSignInAuth({ credential: r.credential, origin: ORIGIN, productName: "PictureRecords", createsVault: true });
    await expect(yes.completeNamedVault("x")).resolves.toBeUndefined();
  });
});
