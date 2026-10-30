// @vitest-environment node
// Ported from the source's downloadFileOutcome test (10 runs of its 11: the 11th, `fileFetchMessage`, belongs to `file-words`) and
// files.s9fix test (4). `vi.mock("./dpop")` and `vi.mock("./token")` are replaced by a fake host set with `setLwsAuth`; the
// re-import with a stubbed VITE_BASE_ORIGIN is the platform origin setting. New cases follow.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { downloadFile, downloadFileOutcome, FILE_RESOURCE_URL, FILE_TOO_LARGE } from "./index";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { ORIGIN, VAULT_HOST, reply, setUp, tearDown } from "../test/support";

const FILE_ID = "jbetv9hk8wnb";
const VAULT_FILE = `${VAULT_HOST}/base/e/${FILE_ID}`;
let fetchMock: ReturnType<typeof vi.fn>;
let asked: string[];
let host: ReturnType<typeof setUp>;

function answerWith(status: number, opts: { empty?: boolean } = {}) {
  fetchMock.mockImplementation(async (url: string) => {
    asked.push(String(url));
    return reply({ status, empty: opts.empty });
  });
}

beforeEach(() => {
  asked = [];
  host = setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

describe("only a 404 at the file's OWN vault may be called `gone`", () => {
  it("a 404 at the vault's own door IS `gone`", async () => {
    answerWith(404);
    const out = await downloadFileOutcome(FILE_ID, VAULT_FILE);
    expect(out.kind).toBe("gone");
    expect(asked[0]).toBe(`${VAULT_HOST}/files/${FILE_ID}`);
  });

  it("a 404 with NO address is `unaddressed`, never `gone`", async () => {
    answerWith(404);
    const out = await downloadFileOutcome(FILE_ID, null);
    expect(out.kind).toBe("unaddressed");
    expect(asked[0]).toBe(`${ORIGIN}/files/${FILE_ID}`);
  });

  const uselessAddresses: [string, string][] = [
    ["an empty string", ""],
    ["the unresolved-vault sentinel", "urn:base:unresolved-vault"],
    ["a bare opaque id", "jbetv9hk8wnb"],
    ["a relative path", "/base/e/jbetv9hk8wnb"],
    ["an entity URI already on the platform origin", `${ORIGIN}/base/e/${FILE_ID}`],
  ];
  for (const [label, at] of uselessAddresses) {
    it(`${label} lands on the platform origin, so a 404 is 'unaddressed', NOT 'gone'`, async () => {
      answerWith(404);
      const out = await downloadFileOutcome(FILE_ID, at);
      expect(asked[0]).toBe(`${ORIGIN}/files/${FILE_ID}`);
      expect(out.kind).toBe("unaddressed");
      expect(out.kind).not.toBe("gone");
    });
  }
});

describe("a denial outranks an absence; the two legs cannot downgrade each other", () => {
  it("a 403 on either credential leg is `forbidden`, never `gone`", async () => {
    answerWith(403);
    expect((await downloadFileOutcome(FILE_ID, VAULT_FILE)).kind).toBe("forbidden");
  });

  it("DPoP 403 then Bearer 404 reports FORBIDDEN, not the last leg's absence", async () => {
    let n = 0;
    fetchMock.mockImplementation(async (url: string) => {
      asked.push(String(url));
      return reply({ status: n++ === 0 ? 403 : 404, headers: {} });
    });
    expect((await downloadFileOutcome(FILE_ID, VAULT_FILE)).kind).toBe("forbidden");
  });

  it("a 200 with an empty body is `failed`, never an absence", async () => {
    answerWith(200, { empty: true });
    expect((await downloadFileOutcome(FILE_ID, VAULT_FILE)).kind).toBe("failed");
  });
});

describe("downloadFileOutcome with maxBytes", () => {
  const VAULT = "https://mona.platform.example.test/base/e/f1";
  it("refuses an answer whose content-length is over the bound WITHOUT reading the body, and does not retry on the second credential", async () => {
    const blobSpy = vi.fn();
    fetchMock.mockResolvedValue({ ...reply({ status: 200, headers: { "content-type": "image/png", "content-length": "55000000" } }), blob: blobSpy });
    const o = await downloadFileOutcome("f1", VAULT, { maxBytes: 262_144 });
    expect(o.kind).toBe("failed");
    expect(o.kind === "failed" && o.detail).toBe(FILE_TOO_LARGE);
    expect(blobSpy).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("accepts an answer inside the bound", async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, headers: { "content-type": "image/png", "content-length": "12000" } }));
    expect((await downloadFileOutcome("f1", VAULT, { maxBytes: 262_144 })).kind).toBe("ok");
  });
  it("an answer with no length is read, then refused when the bytes are over the bound", async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, bytes: 300_000 }));
    const o = await downloadFileOutcome("f1", VAULT, { maxBytes: 262_144 });
    expect(o.kind === "failed" && o.detail).toBe(FILE_TOO_LARGE);
  });
  it("with no bound given nothing changes: a large answer is read", async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, headers: { "content-type": "image/png", "content-length": "55000000" } }));
    expect((await downloadFileOutcome("f1", VAULT)).kind).toBe("ok");
  });
});

describe("the address", () => {
  it("FILE_RESOURCE_URL: the vault's origin when the address names a vault, the platform origin otherwise", () => {
    expect(FILE_RESOURCE_URL("f1", VAULT_FILE)).toBe(`${VAULT_HOST}/files/f1`);
    expect(FILE_RESOURCE_URL("f1", null)).toBe(`${ORIGIN}/files/f1`);
    expect(FILE_RESOURCE_URL("f1")).toBe(`${ORIGIN}/files/f1`);
  });
  it("cleans the id: leading slashes, a `files/` prefix, and a query or fragment are dropped", async () => {
    answerWith(404);
    for (const id of ["/f1", "//files/f1", "files/f1?x=1", "Files/f1#y", "f1"]) {
      asked = [];
      await downloadFileOutcome(id, VAULT_FILE);
      expect(asked[0]).toBe(`${VAULT_HOST}/files/f1`);
    }
  });
  it("no id: failed with 'no file id' and nothing is asked", async () => {
    for (const id of ["", "/", "files/", "?x=1"]) {
      const o = await downloadFileOutcome(id, VAULT_FILE);
      expect(o).toEqual({ kind: "failed", status: null, url: "", detail: "no file id" });
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("an absolute URL handed as the id, with no address, is itself the address: its origin is used (the path is kept whole, as in the source)", async () => {
    answerWith(404);
    const out = await downloadFileOutcome(`${VAULT_HOST}/files/f1`, null);
    expect(asked[0]).toBe(`${VAULT_HOST}/files/${VAULT_HOST}/files/f1`);
    expect(out.kind).toBe("gone");
  });
});

describe("the two credentials", () => {
  it("DPoP is asked first, with GET and the URL; its bytes are returned, typed from the answer, and Bearer is never asked", async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, headers: { "content-type": "image/jpeg; charset=x" }, blobType: "" }));
    const o = await downloadFileOutcome("f1", VAULT_FILE);
    expect(host.dpopReadAuth).toHaveBeenCalledWith("GET", `${VAULT_HOST}/files/f1`);
    expect(host.bearerHeaderFor).not.toHaveBeenCalled();
    expect(o.kind).toBe("ok");
    if (o.kind === "ok") {
      expect(o.blob.type).toBe("image/jpeg");
      expect(o.url).toBe(`${VAULT_HOST}/files/f1`);
    }
    const init = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("GET");
    expect(init.credentials).toBe("omit");
    expect(init.headers).toMatchObject({ authorization: "DPoP d-tok", dpop: "proof", accept: "*/*" });
  });
  it("when DPoP fails the Bearer leg is asked with the URL, and its bytes are returned", async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 401, headers: {} })).mockResolvedValueOnce(reply({ status: 200 }));
    const o = await downloadFileOutcome("f1", VAULT_FILE);
    expect(o.kind).toBe("ok");
    expect(host.bearerHeaderFor).toHaveBeenCalledWith(`${VAULT_HOST}/files/f1`);
    expect((fetchMock.mock.calls[1]![1] as RequestInit).headers).toMatchObject({ authorization: "Bearer b-tok" });
  });
  it("when the DPoP mint throws, Bearer still runs; when Bearer then fails, the DPoP mint error is the detail only if it ranks equal", async () => {
    host.dpopReadAuth.mockRejectedValue(new Error("dpop mint failed here"));
    fetchMock.mockResolvedValue(reply({ status: 500, body: "boom" }));
    const o = await downloadFileOutcome("f1", VAULT_FILE);
    expect(o.kind).toBe("failed");
    expect(o.kind === "failed" && o.detail).toBe("dpop mint failed here");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
  it("not signed in at the Bearer leg is `forbidden` 401, a permission answer and not an absence", async () => {
    host.bearerHeaderFor.mockRejectedValue(new NotSignedInError());
    fetchMock.mockResolvedValueOnce(reply({ status: 404, headers: {} }));
    const o = await downloadFileOutcome("f1", VAULT_FILE);
    expect(o).toEqual({ kind: "forbidden", status: 401, url: `${VAULT_HOST}/files/f1` });
  });
  it("401 and 403 on both legs are `forbidden` with the status; 401 on one leg and 404 on the other is still `forbidden`", async () => {
    for (const status of [401, 403]) {
      fetchMock.mockResolvedValue(reply({ status, headers: {} }));
      expect(await downloadFileOutcome("f1", VAULT_FILE)).toEqual({ kind: "forbidden", status, url: `${VAULT_HOST}/files/f1` });
    }
    fetchMock.mockReset();
    fetchMock.mockResolvedValueOnce(reply({ status: 401, headers: {} })).mockResolvedValueOnce(reply({ status: 404, headers: {} }));
    expect((await downloadFileOutcome("f1", VAULT_FILE)).kind).toBe("forbidden");
  });
  it("a transport error on both legs is `failed` with status null and the message", async () => {
    fetchMock.mockRejectedValue(new Error("offline"));
    const o = await downloadFileOutcome("f1", VAULT_FILE);
    expect(o).toEqual({ kind: "failed", status: null, url: `${VAULT_HOST}/files/f1`, detail: "offline" });
  });
  it("a failed answer carries the status and the reason the server sent", async () => {
    fetchMock.mockResolvedValue(reply({ status: 500, body: JSON.stringify({ error: "disk full" }) }));
    const o = await downloadFileOutcome("f1", VAULT_FILE);
    expect(o.kind).toBe("failed");
    expect(o.kind === "failed" && o.status).toBe(500);
  });
  it("a gone on DPoP next to a Bearer transport error stays `gone`", async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 404, headers: {} })).mockRejectedValueOnce(new Error("blip"));
    expect((await downloadFileOutcome("f1", VAULT_FILE)).kind).toBe("gone");
  });
  it("a `forbidden` on either leg is never downgraded by a failed other leg", async () => {
    fetchMock.mockResolvedValueOnce(reply({ status: 500, body: "x" })).mockResolvedValueOnce(reply({ status: 403, headers: {} }));
    expect((await downloadFileOutcome("f1", VAULT_FILE)).kind).toBe("forbidden");
  });
});

describe("downloadFile (the blob-or-null shim)", () => {
  it("the blob when the outcome is ok", async () => {
    fetchMock.mockResolvedValue(reply({ status: 200 }));
    const b = await downloadFile("f1", VAULT_FILE);
    expect(b).toBeInstanceOf(Blob);
    expect(b!.size).toBe(64);
  });
  it("null for gone, unaddressed, forbidden and failed", async () => {
    for (const status of [404, 403, 500]) {
      fetchMock.mockResolvedValue(reply({ status, headers: {} }));
      expect(await downloadFile("f1", VAULT_FILE)).toBeNull();
    }
    fetchMock.mockResolvedValue(reply({ status: 404, headers: {} }));
    expect(await downloadFile("f1", null)).toBeNull();
  });
  it("asks without a bound: a large answer is read", async () => {
    fetchMock.mockResolvedValue(reply({ status: 200, headers: { "content-type": "image/png", "content-length": "55000000" } }));
    expect(await downloadFile("f1", VAULT_FILE)).not.toBeNull();
  });
});
