// New. Every place the unit forms a credential header, and the method of the request it is for.
//
// A DPoP proof is bound to the method and the URL, and the fallback after a refused proof asks `bearerHeaderFor`, which here answers a
// proof too (the bridge's README says why). The app called `bearerHeaderFor(url)` at all three write sites; each now names the method of
// its own request, and the host fake below answers a header that carries the method it was asked for, so a call that dropped the
// argument would send a proof for a GET and these cases would see it.
//
//   relationWrite  putKnownRelation   fallback of PUT   `/base/r/<id>`        -> bearerHeaderFor(url, "PUT")
//   relationWrite  endRelation        fallback of POST  `/base/r/<id>/end`    -> bearerHeaderFor(url, "POST")
//   entityShare    postAuthzAct       fallback of POST  `/base/authz/...`     -> bearerHeaderFor(url, "POST")
//   relations      readRelations      GET `/base/e/<id>/relations`            -> bearerHeaderFor(url)   (a GET, the default)
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import {
  BoundTimeoutError,
  __setCatalogForTest,
  catalogFromGraph,
  endRelation,
  grantPublicOnRelation,
  readRelations,
  revokePublicOnRelation,
  shareEntity,
  writePairRelation,
} from "./index";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

const VAULT = "https://v.platform.example.test/base";
const REL = `${VAULT}/r/rel1`;
const A = `${VAULT}/e/a`;
const B = `${VAULT}/e/b`;

let host: FakeHost;
let fetchMock: ReturnType<typeof vi.fn>;

function catalog(): void {
  __setCatalogForTest(
    catalogFromGraph(
      [{ "@id": "https://ontology.example.test/base/t/Reference", "a:label": "references", "a:linkPlane": "user", "a:typeAttribute": "t:Reference", "a:symmetric": false }],
      "user",
    ),
  );
}

beforeEach(() => {
  host = setUp();
  // The bearer answer carries the method it was asked for. A GET is the default, as in the bridge.
  host.bearerHeaderFor.mockImplementation(async (url: string, method?: string) => ({ authorization: `DPoP bearer-${method ?? "GET"}`, dpop: `proof-${method ?? "GET"}-${url}` }));
  catalog();
  fetchMock = vi.fn(async () => resp(200, { body: { changed: true, relation: REL } }));
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  __setCatalogForTest(null);
  tearDown();
});

const lastInit = () => fetchMock.mock.calls.at(-1)![1] as RequestInit & { headers: Record<string, string> };

describe("relationWrite PUT: DPoP first, the bearer floor only after a refused proof", () => {
  const input = { relationId: REL, sourceId: "a", targetId: "b", sourceEntityUri: A, targetEntityUri: B, typeCurie: "t:Reference", vaultNamespace: VAULT };

  it("an accepted proof is used, and the bearer floor is never asked", async () => {
    await writePairRelation(input);
    expect(host.dpopWriteAuth).toHaveBeenCalledWith("PUT", `${VAULT}/r/rel1`);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    expect(lastInit().method).toBe("PUT");
    expect(lastInit().headers.authorization).toBe("DPoP tok-dpop");
  });

  it("a refused proof falls back to the bearer floor, asked for a PUT of that URL, and the PUT carries that answer", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new Error("proof refused"));
    await writePairRelation(input);
    expect(host.bearerHeaderFor).toHaveBeenCalledTimes(1);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT}/r/rel1`, "PUT");
    expect(lastInit().method).toBe("PUT");
    expect(lastInit().headers.authorization).toBe("DPoP bearer-PUT");
    expect(lastInit().headers["content-type"]).toBe("application/json");
  });

  it("a proof that TIMED OUT is not followed by a second wait: nothing is sent and the bearer floor is not asked", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new BoundTimeoutError("creating the DPoP proof"));
    await expect(writePairRelation(input)).rejects.toBeInstanceOf(BoundTimeoutError);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a 401 drops both credentials and signs the person out", async () => {
    fetchMock.mockResolvedValueOnce(resp(401, { body: "no" }));
    await expect(writePairRelation(input)).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
    expect(host.tokenManager.invalidate).toHaveBeenCalledTimes(1);
  });

  it("any other refusal throws the status and the body", async () => {
    fetchMock.mockResolvedValueOnce(resp(409, { body: "conflict" }));
    await expect(writePairRelation(input)).rejects.toThrow("relation write failed: 409 conflict");
  });
});

describe("endRelation POST: DPoP first, the bearer floor only after a refused proof", () => {
  it("an accepted proof is used for a POST of the /end URL", async () => {
    await endRelation(REL, VAULT);
    expect(host.dpopWriteAuth).toHaveBeenCalledWith("POST", `${VAULT}/r/rel1/end`);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    const init = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/end"))![1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("DPoP tok-dpop");
  });

  it("a refused proof falls back to the bearer floor, asked for a POST of the /end URL, and the POST carries that answer and no content-type", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new Error("proof refused"));
    await endRelation(REL, VAULT);
    expect(host.bearerHeaderFor).toHaveBeenCalledTimes(1);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT}/r/rel1/end`, "POST");
    const init = fetchMock.mock.calls.find((c) => String(c[0]).endsWith("/end"))![1] as RequestInit & { headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("DPoP bearer-POST");
    expect(Object.keys(init.headers).map((k) => k.toLowerCase())).not.toContain("content-type");
  });

  it("a proof that TIMED OUT is not followed by a second wait", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new BoundTimeoutError("creating the DPoP proof"));
    await expect(endRelation(REL, VAULT)).rejects.toBeInstanceOf(BoundTimeoutError);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("a 401 drops both credentials and signs the person out", async () => {
    fetchMock.mockResolvedValueOnce(resp(401, { body: "no" }));
    await expect(endRelation(REL, VAULT)).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
    expect(host.tokenManager.invalidate).toHaveBeenCalledTimes(1);
  });

  it("a refusal other than 404 throws the status and the body", async () => {
    fetchMock.mockResolvedValueOnce(resp(500, { body: "boom" }));
    await expect(endRelation(REL, VAULT)).rejects.toThrow("Not ended: the vault refused (500). boom");
  });
});

describe("entityShare POST (the per-item authz acts): DPoP first, the bearer floor after ANY failure of the proof", () => {
  it("grant on a relation: an accepted proof is used for a POST of the grant URL", async () => {
    await grantPublicOnRelation(REL);
    expect(host.dpopWriteAuth).toHaveBeenCalledWith("POST", `${VAULT}/authz/grant-direct`);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
  });

  it("grant on a relation: a refused proof falls back to the bearer floor, asked for a POST of that URL, and the POST carries that answer", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new Error("proof refused"));
    await grantPublicOnRelation(REL);
    expect(host.bearerHeaderFor).toHaveBeenCalledTimes(1);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT}/authz/grant-direct`, "POST");
    expect(lastInit().method).toBe("POST");
    expect(lastInit().headers.authorization).toBe("DPoP bearer-POST");
    expect(JSON.parse(String(lastInit().body))).toEqual({ entity: REL, principal: "https://ontology.example.test/base/t/PublicGrantee", type: "t:PartOf", facts: {} });
  });

  it("revoke on a relation: a refused proof falls back to the bearer floor for a POST of the revoke-direct URL", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new Error("proof refused"));
    await revokePublicOnRelation(REL);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT}/authz/revoke-direct`, "POST");
    expect(lastInit().headers.authorization).toBe("DPoP bearer-POST");
    expect(JSON.parse(String(lastInit().body))).toEqual({ entity: REL, principal: "https://ontology.example.test/base/t/PublicGrantee" });
  });

  it("QUIRK kept: unlike the relation writes, a proof that timed out DOES fall back here (the share act has no timeout test)", async () => {
    host.dpopWriteAuth.mockRejectedValueOnce(new BoundTimeoutError("creating the DPoP proof"));
    await grantPublicOnRelation(REL);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT}/authz/grant-direct`, "POST");
  });

  it("shareEntity of a record read at the door: the grant is a POST whose proof is asked for that method", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      if (String(url).includes("/lws/r/")) {
        return resp(200, { body: { "@id": `${VAULT}/e/rec1`, "@type": "t:NoteDocument", "a:title": "T" }, headers: { etag: '"e1"' } });
      }
      return resp(200, { body: {} });
    });
    host.dpopWriteAuth.mockRejectedValueOnce(new Error("proof refused"));
    await shareEntity("rec1", "https://g.platform.example.test/base", "write", VAULT, `${VAULT}/e/rec1`);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT}/authz/grant-write-direct`, "POST");
    expect(host.bearerHeaderFor).not.toHaveBeenCalledWith(expect.stringContaining("/authz/"), undefined);
  });

  it("a 401 drops both credentials and signs the person out", async () => {
    fetchMock.mockResolvedValueOnce(resp(401, { body: "no" }));
    await expect(grantPublicOnRelation(REL)).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
    expect(host.tokenManager.invalidate).toHaveBeenCalledTimes(1);
  });

  it("a refusal shows the platform's own sentence, and the revoke act words it as a change", async () => {
    fetchMock.mockResolvedValue(resp(403, { body: JSON.stringify({ message: "not yours" }) }));
    await expect(grantPublicOnRelation(REL)).rejects.toThrow("GilbPlatform refused this share: not yours");
    await expect(revokePublicOnRelation(REL)).rejects.toThrow("GilbPlatform refused this change: not yours");
  });
});

describe("relations GET: the credential is asked for a GET (the default method)", () => {
  it("readRelations asks bearerHeaderFor with the URL alone", async () => {
    fetchMock.mockResolvedValueOnce(resp(200, { body: { relations: [] } }));
    await readRelations("a", A);
    expect(host.bearerHeaderFor).toHaveBeenCalledTimes(1);
    expect(host.bearerHeaderFor.mock.calls[0]).toEqual([`${VAULT.replace("/base", "")}/base/e/a/relations`]);
    expect(host.bearerHeaderFor.mock.calls[0]).toHaveLength(1);
    expect(lastInit().method).toBe("GET");
    expect(lastInit().headers.authorization).toBe("DPoP bearer-GET");
  });
});
