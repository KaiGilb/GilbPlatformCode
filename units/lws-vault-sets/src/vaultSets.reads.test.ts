import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { findByAttribute } from "./attributeFind";
import { listVaultFilesPage, listVaultRecordsPage, lwsReadFetch } from "./vaultSets";
import { ORIGIN, setUp, tearDown, type FakeHost } from "../test/support";

const VAULT = "https://home.platform.example.test/base";
const URL_ = `${ORIGIN}/lws/r/abc`;

let host: FakeHost;
let fetchMock: ReturnType<typeof vi.fn>;
const res = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

beforeEach(() => {
  host = setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

const sentHeaders = (n = 0) => (fetchMock.mock.calls[n]![1] as RequestInit).headers as Record<string, string>;

describe("lwsReadFetch: the credential and the method it is signed for", () => {
  it("signs a GET through bearerHeaderFor, naming GET, and adds accept", async () => {
    fetchMock.mockResolvedValue(res(200));
    await lwsReadFetch(URL_);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(URL_, "GET");
    expect(host.dpopReadAuth).not.toHaveBeenCalled();
    expect(sentHeaders()).toEqual({ authorization: "DPoP tok-bearer", dpop: "proof-bearer", accept: "application/json" });
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("GET");
  });

  it("names the request's own method (upper-cased) to bearerHeaderFor, not GET", async () => {
    fetchMock.mockResolvedValue(res(200));
    await lwsReadFetch(URL_, { method: "head" });
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(URL_, "HEAD");
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe("HEAD");
  });

  it("keeps the caller's headers, with accept and the credential on top", async () => {
    fetchMock.mockResolvedValue(res(200));
    await lwsReadFetch(URL_, { headers: { "x-extra": "1" } });
    expect(sentHeaders()["x-extra"]).toBe("1");
  });

  it("a bridge that forms no credential ({}) sends the DPoP read pair instead", async () => {
    host.bearerHeaderFor.mockResolvedValue({} as never);
    fetchMock.mockResolvedValue(res(200));
    await lwsReadFetch(URL_);
    expect(host.dpopReadAuth).toHaveBeenCalledWith("GET", URL_);
    expect(sentHeaders().authorization).toBe("DPoP tok-read");
  });

  it("a bridge that throws sends the DPoP read pair instead", async () => {
    host.bearerHeaderFor.mockRejectedValue(new Error("no bridge"));
    fetchMock.mockResolvedValue(res(200));
    await lwsReadFetch(URL_);
    expect(sentHeaders().dpop).toBe("proof-read");
  });

  it("a 401 is retried once with the DPoP read pair and the retry's answer is returned", async () => {
    fetchMock.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200, { ok: true }));
    const r = await lwsReadFetch(URL_);
    expect(r.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(host.dpopReadAuth).toHaveBeenCalledWith("GET", URL_);
    expect(sentHeaders(1).dpop).toBe("proof-read");
  });

  it("when the retry cannot be formed, the first 401 is returned as it came", async () => {
    fetchMock.mockResolvedValueOnce(res(401));
    host.dpopReadAuth.mockRejectedValue(new Error("no key"));
    const r = await lwsReadFetch(URL_);
    expect(r.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("any other status is returned without a retry", async () => {
    fetchMock.mockResolvedValue(res(500));
    expect((await lwsReadFetch(URL_)).status).toBe(500);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("sends no credential, and does not ask the host, for a URL outside the platform", async () => {
    fetchMock.mockResolvedValue(res(200));
    await lwsReadFetch("https://elsewhere.example.invalid/lws/r/abc");
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    expect(sentHeaders()).toEqual({ accept: "application/json" });
  });
});

describe("listVaultRecordsPage and listVaultFilesPage: the refusals", () => {
  it("a 401 drops the held token and throws NotSignedInError", async () => {
    fetchMock.mockResolvedValue(res(401));
    await expect(listVaultRecordsPage(VAULT, ["Person"], 0)).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalled();
  });

  it("another refusal throws the sentence the server sent", async () => {
    fetchMock.mockResolvedValue(res(400, { error: "BadRequest", message: "vault target required" }));
    await expect(listVaultFilesPage(VAULT, 0)).rejects.toThrow("vault target required");
  });

  it("a refusal with no body falls back to the module's own sentence", async () => {
    fetchMock.mockResolvedValue(new Response("", { status: 503 }));
    await expect(listVaultRecordsPage(VAULT, [], 0)).rejects.toThrow(/Vault listing failed/);
  });

  it("asks the vault named, at its own origin, with the type names and the offset on the path's query", async () => {
    fetchMock.mockResolvedValue(res(200, { total: 0, complete: true, records: [] }));
    await listVaultRecordsPage(VAULT, ["Person", "Task"], 40);
    const u = new URL(String(fetchMock.mock.calls[0]![0]));
    expect(u.origin).toBe("https://home.platform.example.test");
    expect(u.pathname).toMatch(/\/records$/);
    expect(u.searchParams.getAll("type")).toEqual(["Person", "Task"]);
    expect(u.searchParams.get("offset")).toBe("40");
  });

  it("normalizes the host-free type CURIE a vault stores, and the page counts what the door sent", async () => {
    fetchMock.mockResolvedValue(
      res(200, {
        total: 2,
        complete: true,
        records: [
          { entity: `${VAULT}/e/a`, typeUri: "t:Task", updatedAt: "2026-07-20T10:00:00.000Z" },
          { entity: `${VAULT}/e/b`, typeUri: "filectl:FileContent", updatedAt: null },
        ],
      }),
    );
    const page = await listVaultRecordsPage(VAULT, ["Task"], 0);
    expect(page.records.map((r) => r.id)).toEqual(["a"]);
    expect(page.records[0]!.typeUri).toBe(`${ORIGIN}/base/t/Task`);
    expect(page.served).toBe(2);
    expect(page.total).toBe(1);
  });
});

describe("findByAttribute: the refusals", () => {
  it("a 401 drops the held token and throws NotSignedInError", async () => {
    fetchMock.mockResolvedValue(res(401));
    await expect(findByAttribute("a:x", "v")).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalled();
  });

  it("another refusal throws its status and body", async () => {
    fetchMock.mockResolvedValue(new Response("boom", { status: 500 }));
    await expect(findByAttribute("a:x", "v")).rejects.toThrow("find-by-attribute failed: 500 boom");
  });

  it("asks the platform origin when no host is given, and keeps only non-empty string ids", async () => {
    fetchMock.mockResolvedValue(res(200, { count: 9, ids: ["a", "", 3, "b"] }));
    const r = await findByAttribute("a:x", { "@id": "y" });
    expect(String(fetchMock.mock.calls[0]![0]).startsWith(`${ORIGIN}/base/find-by-attribute?`)).toBe(true);
    expect(r).toEqual({ count: 9, ids: ["a", "b"] });
  });
});
