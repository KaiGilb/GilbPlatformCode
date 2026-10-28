import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { readRelations, uriTail } from "./relations";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

let fetchMock: ReturnType<typeof vi.fn>;
let host: FakeHost;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  host = setUp();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  tearDown();
});

function lastCall(): [string, RequestInit] {
  return fetchMock.mock.calls.at(-1) as [string, RequestInit];
}

describe("readRelations (GET /base/e/:id/relations)", () => {
  it("hits the reverse-lookup URL with the credential and returns the (relation, role) pairs", async () => {
    fetchMock.mockResolvedValue(
      resp(200, {
        body: {
          member: "https://platform.example.test/base/e/note-abc",
          relations: [
            { relation: "https://platform.example.test/base/r/rel-1", role: "worksFor" },
            { relation: "https://platform.example.test/base/r/rel-2", role: "role:member" },
          ],
        },
      }),
    );
    const rows = await readRelations("note-abc", null);
    expect(rows).toEqual([
      { relation: "https://platform.example.test/base/r/rel-1", role: "worksFor" },
      { relation: "https://platform.example.test/base/r/rel-2", role: "role:member" },
    ]);
    const [url, init] = lastCall();
    expect(url).toBe("https://platform.example.test/base/e/note-abc/relations");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).authorization).toBe("DPoP tok-bearer");
    // The one non-write credential call: a GET, so the method is left to its default (a proof for a GET).
    expect(host.bearerHeaderFor).toHaveBeenCalledTimes(1);
    expect(host.bearerHeaderFor).toHaveBeenCalledWith("https://platform.example.test/base/e/note-abc/relations");
  });

  it("returns [] on 404 (unreadable/absent — the C2b non-disclosure floor), never throwing", async () => {
    fetchMock.mockResolvedValue(resp(404, { body: { error: "NotFound" } }));
    await expect(readRelations("missing", null)).resolves.toEqual([]);
  });

  it("returns [] when the vault reports the record participates in no relation", async () => {
    fetchMock.mockResolvedValue(resp(200, { body: { member: "x", relations: [] } }));
    await expect(readRelations("lonely", null)).resolves.toEqual([]);
  });

  it("drops rows missing a relation URI (never fabricates a reference)", async () => {
    fetchMock.mockResolvedValue(
      resp(200, { body: { relations: [{ role: "worksFor" }, { relation: "https://h/base/r/ok", role: "member" }] } }),
    );
    await expect(readRelations("id", null)).resolves.toEqual([{ relation: "https://h/base/r/ok", role: "member" }]);
  });

  it("a 401 drops the token + throws NotSignedInError", async () => {
    const invalidate = host.tokenManager.invalidate;
    fetchMock.mockResolvedValue(resp(401, { body: "no session" }));
    await expect(readRelations("id", null)).rejects.toBeInstanceOf(NotSignedInError);
    expect(invalidate).toHaveBeenCalled();
  });

  it("a 500 throws (a real error is surfaced, not swallowed as empty)", async () => {
    fetchMock.mockResolvedValue(resp(500, { body: "boom" }));
    await expect(readRelations("id", null)).rejects.toThrow(/relations read failed: 500/);
  });
});

describe("uriTail", () => {
  it("takes the last path segment of an entity/relation URI", () => {
    expect(uriTail("https://platform.example.test/base/r/rel-abc123")).toBe("rel-abc123");
    expect(uriTail("https://platform.example.test/base/e/note-x/")).toBe("note-x");
    expect(uriTail("plain")).toBe("plain");
  });
});
