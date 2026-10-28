// @vitest-environment node
// Ported from records.test.ts (the createRecord, readRecord, patchRecord and "auth handling" blocks), the "SWEPT SITE 4" block of
// serverErrorRelaySites.test.ts and the readRecord block of credentialHost.d10.test.ts. The app's token and DPoP mocks are a fake
// host set with setLwsAuth. Not ported: the replaceRecord, deleteRecord and retypeRecord blocks (those functions are not taken).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotSignedInError, lwsAuthFromSession, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { typeUri } from "@kaigilb/gilbplatformcode-record-types";
import { createRecord, patchRecord, readRecord, RecordConflictError, RecordForbiddenError } from "./records";
import { ORIGIN, resp, setUp, tearDown, type FakeHost } from "../test/support";

const NOTE_URI = () => typeUri("Note");
const KAIZEN_VAULT = "https://kaizen.platform.example.test/base/pkaizen";

let host: FakeHost;
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  host = setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

/** Extracts the [url, init] of the last fetch call. */
function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit];
}

describe("createRecord (POST /lws/vault/:vaultId/c — Cycle053 VDS-4 FIX-1)", () => {
  it("POSTs to the VIEWED vault with the DPoP credential + a:-prefixed facts + a Slug hint", async () => {
    fetchMock.mockResolvedValue(
      resp(201, { headers: { location: `${ORIGIN}/lws/r/note-abc123`, etag: '"sha256:aa"' }, body: { "@id": "x" } }),
    );
    const out = await createRecord(KAIZEN_VAULT, NOTE_URI(), { title: "Hello", body: "" }, "Hello");
    expect(out).toEqual({ id: "note-abc123", etag: '"sha256:aa"' });

    const [url, init] = lastCall();
    // THE fix: the create names the VIEWED vault's namespace as the path segment, so a record
    // made while viewing another vault lands in THAT vault — never the sign-in vault. The vault
    // NAMESPACE (itself an https URI) is percent-encoded into the single path segment.
    expect(url).toBe(`https://kaizen.platform.example.test/lws/vault/${encodeURIComponent(KAIZEN_VAULT)}/c`);
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    // Authorized with the sender-constrained DPoP credential, NOT a plain Bearer.
    expect(headers.authorization).toBe("DPoP tok-dpop");
    expect(headers.dpop).toBe("proof-xyz");
    expect(host.dpopWriteAuth).toHaveBeenCalledWith("POST", url);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    expect(headers.slug).toBe("hello");
    const body = JSON.parse(init.body as string);
    expect(body.type).toBe(NOTE_URI());
    // The empty `body` field is omitted; the title rides as `a:title`.
    expect(body.facts).toEqual({ "a:title": "Hello" });
  });

  it("maps 403 (no write grant on the target vault) → RecordForbiddenError, fail-closed", async () => {
    fetchMock.mockResolvedValue(resp(403, { body: { error: "Forbidden" } }));
    await expect(createRecord(KAIZEN_VAULT, NOTE_URI(), { title: "x" })).rejects.toBeInstanceOf(RecordForbiddenError);
  });

  it("a 401 drops the DPoP credential (not the Bearer) + throws NotSignedInError", async () => {
    fetchMock.mockResolvedValue(resp(401, { body: "no session" }));
    await expect(createRecord(KAIZEN_VAULT, NOTE_URI(), { title: "x" })).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalled();
    expect(host.tokenManager.invalidate).not.toHaveBeenCalled();
  });

  it("a 400 (the server could name no vault it will write to) carries the status and the server's sentence, and nothing is retried", async () => {
    fetchMock.mockResolvedValue(resp(400, { body: { error: "BadRequest", message: "no vault named" } }));
    const err = (await createRecord(KAIZEN_VAULT, NOTE_URI(), { title: "x" }).catch((e) => e)) as Error & { status?: number };
    expect(err.status).toBe(400);
    expect(err.message).toBe("no vault named");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("readRecord (GET /lws/r/:id)", () => {
  it("parses the framed doc → bare-slug facts + resolves the type + ETag", async () => {
    fetchMock.mockResolvedValue(
      resp(200, {
        headers: { etag: '"sha256:bb"' },
        body: { "@context": "https://www.w3.org/ns/lws/v1", "@id": `${ORIGIN}/base/e/note-abc123`, "@type": "t:Note", title: "Hello", body: "Hi there" },
      }),
    );
    const rec = await readRecord("note-abc123", null);
    // `toEqual` is kept deliberately: an exact pin is what catches a drift, and a stray extra key must go red.
    expect(rec).toEqual({
      id: "note-abc123",
      entityUri: `${ORIGIN}/base/e/note-abc123`,
      typeUri: NOTE_URI(),
      facts: { title: "Hello", body: "Hi there" },
      opaqueFacts: [],
      servedKeys: ["title", "body"],
      etag: '"sha256:bb"',
      served: { facts: { title: "Hello", body: "Hi there" }, context: "https://www.w3.org/ns/lws/v1", etag: '"sha256:bb"' },
    });
    const [url, init] = lastCall();
    expect(url).toBe(`${ORIGIN}/lws/r/note-abc123`);
    // The id-keyed reads ride `bearerHeaderFor`; the host answers the pair, and the call names no method.
    expect((init.headers as Record<string, string>).authorization).toBe("DPoP tok-bearer");
    expect(host.bearerHeaderFor.mock.calls).toEqual([[url]]);
  });

  it("returns null on 404 (gone / unreadable — non-disclosure)", async () => {
    fetchMock.mockResolvedValue(resp(404, { body: { error: "NotFound" } }));
    expect(await readRecord("missing", null)).toBeNull();
  });

  it("a record with no type names the unknown marker and says so", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: { "@id": `${ORIGIN}/base/e/r1`, title: "x" } }));
    const rec = await readRecord("r1", null);
    expect(rec?.typeUri).toBe(typeUri("Resource"));
    expect(rec?.typeSubstituted).toBe(true);
  });
});

describe("patchRecord (PATCH merge-patch+json)", () => {
  it("carries the merge-patch content-type; a null member passes through (deletes attr)", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"sha256:dd"' } }));
    const out = await patchRecord("id", { status: "done", due: null }, null);
    expect(out).toEqual({ etag: '"sha256:dd"' });
    const [, init] = lastCall();
    expect(init.method).toBe("PATCH");
    expect((init.headers as Record<string, string>)["content-type"]).toBe("application/merge-patch+json");
    expect(JSON.parse(init.body as string)).toEqual({ "a:status": "done", "a:due": null });
  });

  it("accepts a structured array value (conditions) and wires it under a:<slug>", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"sha256:ee"' } }));
    const conditions = [
      { op: "manual", tag: "ProcVdcEnRaw", text: "idea", who: "HumanAgent" },
      { op: "manual", text: "approve", who: "HumanAgent" },
    ];
    await patchRecord("proc-valuedeliverycycle", { entryCondition: conditions }, null);
    const [, init] = lastCall();
    const body = JSON.parse(init.body as string);
    expect(body).toEqual({ "a:entryCondition": conditions });
    expect(body["entryCondition"]).toBeUndefined();
  });

  it("is signed for PATCH: the credential is asked with the method (the one change to the app's call)", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"sha256:dd"' } }));
    await patchRecord("id", { status: "done" }, null);
    const [url] = lastCall();
    expect(host.bearerHeaderFor.mock.calls).toEqual([[url, "PATCH"]]);
  });

  it("sends If-Match when the caller read a version", async () => {
    fetchMock.mockResolvedValue(resp(200, { headers: { etag: '"sha256:dd"' } }));
    await patchRecord("id", { status: "done" }, null, undefined, { ifMatch: '"sha256:aa"' });
    expect((lastCall()[1].headers as Record<string, string>)["if-match"]).toBe('"sha256:aa"');
  });

  it("a 412 is a RecordConflictError and carries no stray status", async () => {
    fetchMock.mockResolvedValue(resp(412, { body: { error: "PreconditionFailed" } }));
    const err = await patchRecord("id", { status: "done" }, null).catch((e) => e);
    expect(err).toBeInstanceOf(RecordConflictError);
  });

  it("any other refusal carries the HTTP status on the Error (a 409 tag collision is told from the rest)", async () => {
    fetchMock.mockResolvedValue(resp(409, { body: { error: "Conflict", message: "that tag is taken" } }));
    const err = (await patchRecord("id", { tag: "x" }, null).catch((e) => e)) as Error & { status?: number };
    expect(err.status).toBe(409);
    expect(err.message).toBe("that tag is taken");
  });
});

describe("auth handling", () => {
  it("a 401 drops the token + throws NotSignedInError", async () => {
    fetchMock.mockResolvedValue(resp(401, { body: "no session" }));
    await expect(readRecord("id", null)).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.tokenManager.invalidate).toHaveBeenCalled();
    expect(host.invalidateDpop).not.toHaveBeenCalled();
  });
});

describe("records — SWEPT SITE 4: a 403 no longer throws the server's reason away", () => {
  const REASON = "You do not own parent vault https://x.platform.example.test/base — nest only under vaults you have minted";
  it("RecordForbiddenError CARRIES the server sentence (and stays the same type)", async () => {
    fetchMock.mockResolvedValue(resp(403, { body: { error: "Forbidden", message: REASON } }));
    const err = (await createRecord("https://x.platform.example.test/base", NOTE_URI(), { title: "x" }, "x").catch((e) => e)) as RecordForbiddenError;
    expect(err).toBeInstanceOf(RecordForbiddenError);
    expect(err.reason).toBe(REASON);
    expect(err.message).toContain(REASON);
  });
  it("NEGATIVE CONTROL — a 403 with no reason keeps the floor sentence and adds nothing invented", async () => {
    fetchMock.mockResolvedValue(resp(403, { body: {} }));
    const err = (await createRecord("https://x.platform.example.test/base", NOTE_URI(), { title: "x" }, "x").catch((e) => e)) as RecordForbiddenError;
    expect(err).toBeInstanceOf(RecordForbiddenError);
    expect(err.reason).toBeNull();
    expect(err.message).toBe("You do not have write access to this record.");
  });
});

// credentialHost.d10.test.ts, "a fact naming a foreign host … never sends the Bearer off the platform": the ten parent URIs of the
// probe, each read through readRecord with a REAL signed-in session under the seam (so the proof is a real one), and the host each
// request actually went to read off the capturing fetch.
describe("Delta10 B1: readRecord never sends the credential off the platform", () => {
  const TEN: [what: string, uri: string, askedAt: string][] = [
    ["control: a vault host", "https://hytta.platform.example.test/base/e/06gkparent", "https://hytta.platform.example.test"],
    ["control: geo", "https://geo.platform.example.test/base/e/osm-r-1", "https://geo.platform.example.test"],
    ["foreign host", "https://evil.example/base/e/x", ORIGIN],
    ["look-alike suffix", "https://platform.example.test.evil.example/base/e/x", ORIGIN],
    ["look-alike prefix", "https://evilplatform.example.test/base/e/x", ORIGIN],
    ["userinfo trick", "https://hytta.platform.example.test@evil.example/base/e/x", ORIGIN],
    ["foreign port", "https://evil.example:8443/base/e/x", ORIGIN],
    ["plain http, platform host", "http://hytta.platform.example.test/base/e/x", ORIGIN],
    ["plain http, foreign", "http://evil.example/base/e/x", ORIGIN],
    ["link-local IP", "https://169.254.169.254/base/e/x", ORIGIN],
  ];
  const onPlatform = (url: string): boolean => {
    const u = new URL(url);
    return u.protocol === "https:" && u.port === "" && u.username === "" && u.password === "" && (u.hostname === "platform.example.test" || /^(?:[a-z0-9-]+\.)+platform\.example\.test$/.test(u.hostname));
  };
  for (const [what, uri, askedAt] of TEN) {
    it(`${what}: ${uri} → asked at ${askedAt}, the DPoP pair only there`, async () => {
      const credential = new SessionCredential();
      credential.adopt("tok-d10", { principal: "https://id.platform.example.test/base/p/kai", vault: null, vaults: [] }, Date.now() + 1_800_000);
      setLwsAuth(lwsAuthFromSession(credential));
      fetchMock.mockResolvedValue(resp(404, { body: {} }));
      const id = uri.slice(uri.lastIndexOf("/") + 1);
      await readRecord(id, uri);
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = lastCall();
      expect(onPlatform(url)).toBe(true);
      expect(new URL(url).origin).toBe(askedAt);
      const h = init.headers as Record<string, string>;
      expect(h.authorization).toBe("DPoP tok-d10");
      const htu = (JSON.parse(Buffer.from(h.dpop!.split(".")[1]!, "base64url").toString("utf8")) as { htu: string; htm: string });
      expect(htu.htm).toBe("GET");
      expect(htu.htu).toBe(url);
    });
  }
});
