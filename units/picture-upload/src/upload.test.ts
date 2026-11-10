import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("@kaigilb/gilbplatformcode-lws-session-bridge", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kaigilb/gilbplatformcode-lws-session-bridge")>()),
  dpopWriteAuth: vi.fn(async (method: string, url: string) => ({ authorization: `DPoP t-${method}`, dpop: `proof-for-${url}` })),
  invalidateDpop: vi.fn(),
}));

import { NotSignedInError, dpopWriteAuth, invalidateDpop } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { NoAccessError, VaultBusyError } from "@kaigilb/gilbplatformcode-refusal-detail";
import { PictureUploadError, uploadPicture, uploadUrl, type UploadTarget } from "./index";

const target: UploadTarget = { vaultOrigin: "https://example.test", vaultRoot: "https://example.test/vault", folder: "a b" };
const URL_OK = "https://example.test/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files?name=x%20y.jpg&folder=a%20b";
const blob = () => new Blob(["jpeg"], { type: "image/jpeg" });

/** A response whose body can be read once: a second text() or json() throws. */
function once(status: number, body: string, calls: { text: number; json: number } = { text: 0, json: 0 }) {
  let read = 0;
  const take = () => {
    if (++read > 1) throw new Error("body used already");
    return body;
  };
  return {
    res: {
      status,
      text: async () => {
        calls.text++;
        return take();
      },
      json: async () => {
        calls.json++;
        return JSON.parse(take());
      },
    } as unknown as Response,
    calls,
  };
}

let fetchMock: ReturnType<typeof vi.fn>;
let warn: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.mocked(dpopWriteAuth).mockClear();
  vi.mocked(invalidateDpop).mockClear();
});

describe("uploadUrl", () => {
  test("is the file door of the vault root, with the name and folder encoded", () => {
    expect(uploadUrl("x y.jpg", target)).toBe(URL_OK);
  });
  test("an empty, blank or missing folder sends no folder key (the platform answers 400 to an empty folder=)", () => {
    const noFolder = "https://example.test/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files?name=a.jpg";
    expect(uploadUrl("a.jpg", { ...target, folder: "" })).toBe(noFolder);
    expect(uploadUrl("a.jpg", { ...target, folder: "  " })).toBe(noFolder);
    const { folder: _f, ...bare } = target;
    expect(uploadUrl("a.jpg", bare)).toBe(noFolder);
    expect(new URL(uploadUrl("a.jpg", { ...target, folder: "" })).searchParams.has("folder")).toBe(false);
  });
  test("the folder is the one given and is encoded", () => {
    expect(uploadUrl("a.jpg", { ...target, folder: "p/q&r" })).toBe("https://example.test/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files?name=a.jpg&folder=p%2Fq%26r");
  });
  test("a user vault's root is composed as given, not rebuilt", () => {
    expect(uploadUrl("a.jpg", { vaultOrigin: "https://h.example.test", vaultRoot: "https://h.example.test/vault", folder: "f" })).toBe(
      "https://h.example.test/lws/vault/https%3A%2F%2Fh.example.test%2Fvault/files?name=a.jpg&folder=f",
    );
  });
});

describe("a stored picture", () => {
  test("201 with an entity answers the entity", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"https://example.test/vault/e/file-1"}').res);
    await expect(uploadPicture(blob(), "x y.jpg", target)).resolves.toBe("https://example.test/vault/e/file-1");
  });
  test("200 (an identical re-upload) answers the entity too", async () => {
    fetchMock.mockResolvedValue(once(200, '{"entity":"https://example.test/vault/e/file-2"}').res);
    await expect(uploadPicture(blob(), "x y.jpg", target)).resolves.toBe("https://example.test/vault/e/file-2");
  });
  test("200 without an entity says the vault did not name the picture", async () => {
    fetchMock.mockResolvedValue(once(200, "{}").res);
    await expect(uploadPicture(blob(), "x y.jpg", target)).rejects.toThrow("The vault did not name the saved picture.");
  });
  test("200 with an empty entity says the same", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":""}').res);
    await expect(uploadPicture(blob(), "x y.jpg", target)).rejects.toThrow("The vault did not name the saved picture.");
  });
  test("200 with a non-string entity says the same", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":5}').res);
    await expect(uploadPicture(blob(), "x y.jpg", target)).rejects.toThrow("The vault did not name the saved picture.");
  });
  test("the request is a PUT to the upload address with the auth headers, image/jpeg, the blob and credentials omitted", async () => {
    const b = blob();
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(b, "x y.jpg", target);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(URL_OK);
    expect(init).toEqual({
      method: "PUT",
      headers: { authorization: "DPoP t-PUT", dpop: `proof-for-${URL_OK}`, "content-type": "image/jpeg" },
      body: b,
      credentials: "omit",
    });
    expect(init.body).toBe(b);
    expect(dpopWriteAuth).toHaveBeenCalledWith("PUT", URL_OK);
  });
  test("a JPEG blob sends image/jpeg: the request is the 0.1.0 request", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(blob(), "a.jpg", target);
    expect(fetchMock.mock.calls[0]![1].headers).toEqual({ authorization: "DPoP t-PUT", dpop: `proof-for-${uploadUrl("a.jpg", target)}`, "content-type": "image/jpeg" });
  });
  test("a WebP blob sends image/webp", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(new Blob(["x"], { type: "image/webp" }), "a.webp", target);
    expect(fetchMock.mock.calls[0]![1].headers["content-type"]).toBe("image/webp");
  });
  test("another image type is sent as it is", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(new Blob(["x"], { type: "image/png" }), "a.png", target);
    expect(fetchMock.mock.calls[0]![1].headers["content-type"]).toBe("image/png");
  });
  test("a blob with no type sends image/jpeg (the 0.1.0 value)", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(new Blob(["x"]), "a.jpg", target);
    expect(fetchMock.mock.calls[0]![1].headers["content-type"]).toBe("image/jpeg");
  });
  test("a type that only starts like image (no slash) sends image/jpeg", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(new Blob(["x"], { type: "imagery/x" }), "a.jpg", target);
    expect(fetchMock.mock.calls[0]![1].headers["content-type"]).toBe("image/jpeg");
  });
  test("a blob with a non-image type sends image/jpeg", async () => {
    fetchMock.mockResolvedValue(once(201, '{"entity":"e"}').res);
    await uploadPicture(new Blob(["x"], { type: "text/html" }), "a.jpg", target);
    expect(fetchMock.mock.calls[0]![1].headers["content-type"]).toBe("image/jpeg");
  });
  test("a success reads the body once, as json, and never as text", async () => {
    const r = once(201, '{"entity":"e"}');
    fetchMock.mockResolvedValue(r.res);
    await uploadPicture(blob(), "x.jpg", target);
    expect(r.calls).toEqual({ text: 0, json: 1 });
  });
});

describe("refusals", () => {
  test("401 gives NotSignedInError, drops the proof once, and reads no body", async () => {
    const r = once(401, "");
    fetchMock.mockResolvedValue(r.res);
    await expect(uploadPicture(blob(), "x.jpg", target)).rejects.toBeInstanceOf(NotSignedInError);
    expect(invalidateDpop).toHaveBeenCalledTimes(1);
    expect(r.calls).toEqual({ text: 0, json: 0 });
  });
  test("403 gives NoAccessError with the server's sentence and the request detail", async () => {
    const r = once(403, '{"error":"Forbidden","message":"No write here."}');
    fetchMock.mockResolvedValue(r.res);
    const e = (await uploadPicture(blob(), "x y.jpg", target).catch((x: unknown) => x)) as NoAccessError;
    expect(e).toBeInstanceOf(NoAccessError);
    expect(e.serverSentence).toBe("No write here.");
    expect(e.detail).toEqual({
      method: "PUT",
      path: "/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files",
      status: 403,
      sentence: "No write here.",
    });
    expect(e.message).toBe("You have no write access here yet. Ask the owner.");
    expect(r.calls.text).toBe(1);
    expect(invalidateDpop).not.toHaveBeenCalled();
  });
  test("403 whose body cannot be read still gives NoAccessError, with no sentence", async () => {
    fetchMock.mockResolvedValue({ status: 403, text: async () => { throw new Error("gone"); } } as unknown as Response);
    const e = (await uploadPicture(blob(), "x y.jpg", target).catch((x: unknown) => x)) as NoAccessError;
    expect(e).toBeInstanceOf(NoAccessError);
    expect(e.serverSentence).toBeNull();
    expect(e.detail).toMatchObject({ status: 403, sentence: null });
  });
  test("403 with a body that is only a token has no sentence", async () => {
    fetchMock.mockResolvedValue(once(403, "<html>nope</html>").res);
    const e = (await uploadPicture(blob(), "x y.jpg", target).catch((x: unknown) => x)) as NoAccessError;
    expect(e.serverSentence).toBeNull();
  });
  test.each([502, 503, 504])("%i gives VaultBusyError with its status and warns once with the line and the body", async (status) => {
    const html = "<html><body>Service Unavailable from the edge</body></html>";
    fetchMock.mockResolvedValue(once(status, html).res);
    const e = (await uploadPicture(blob(), "x y.jpg", target).catch((x: unknown) => x)) as VaultBusyError;
    expect(e).toBeInstanceOf(VaultBusyError);
    expect(e.status).toBe(status);
    expect(e.message).toBe(`The picture could not be saved (HTTP ${status}).`);
    expect(warn).toHaveBeenCalledTimes(1);
    const line = String(warn.mock.calls[0]![0]);
    expect(line).toContain(`HTTP ${status}`);
    expect(line.startsWith("PUT /lws/vault/https%3A%2F%2Fexample.test%2Fvault/files -> HTTP ")).toBe(true);
    expect(line).toContain(" | body: <html><body>Service Unavailable");
  });
  test("the warning keeps the first 300 characters of the body, not more", async () => {
    fetchMock.mockResolvedValue(once(503, "a".repeat(300) + "ZZZ").res);
    await uploadPicture(blob(), "x.jpg", target).catch(() => undefined);
    const line = String(warn.mock.calls[0]![0]);
    expect(line.endsWith(" | body: " + "a".repeat(300))).toBe(true);
    expect(line).not.toContain("ZZZ");
  });
  test("a 503 with a platform sentence puts it in the warning line", async () => {
    fetchMock.mockResolvedValue(once(503, '{"message":"Vault is starting."}').res);
    await uploadPicture(blob(), "x.jpg", target).catch(() => undefined);
    expect(String(warn.mock.calls[0]![0])).toContain("HTTP 503 - Vault is starting.");
  });
  test("a 503 whose body cannot be read still gives VaultBusyError and warns with an empty body", async () => {
    fetchMock.mockResolvedValue({ status: 503, text: async () => { throw new Error("gone"); } } as unknown as Response);
    await expect(uploadPicture(blob(), "x.jpg", target)).rejects.toBeInstanceOf(VaultBusyError);
    expect(String(warn.mock.calls[0]![0])).toContain("HTTP 503 - no sentence was sent | body: ");
  });
  test("500 with body boom gives PictureUploadError with the status, the body and the source's message", async () => {
    fetchMock.mockResolvedValue(once(500, "boom").res);
    const e = (await uploadPicture(blob(), "x.jpg", target).catch((x: unknown) => x)) as PictureUploadError;
    expect(e).toBeInstanceOf(PictureUploadError);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("PictureUploadError");
    expect(e.status).toBe(500);
    expect(e.body).toBe("boom");
    expect(e.message).toBe("The picture could not be saved (HTTP 500).");
    expect(warn).not.toHaveBeenCalled();
  });
  test("a 5000-character body is kept to 2000", async () => {
    fetchMock.mockResolvedValue(once(500, "b".repeat(5000)).res);
    const e = (await uploadPicture(blob(), "x.jpg", target).catch((x: unknown) => x)) as PictureUploadError;
    expect(e.body).toHaveLength(2000);
  });
  test("400 and 404 and 413 are PictureUploadError, not NoAccess or Busy", async () => {
    for (const s of [400, 404, 413]) {
      fetchMock.mockResolvedValueOnce(once(s, "x").res);
      const e = (await uploadPicture(blob(), "x.jpg", target).catch((x: unknown) => x)) as PictureUploadError;
      expect(e).toBeInstanceOf(PictureUploadError);
      expect(e.status).toBe(s);
    }
  });
  test("a status other than 200 and 201 with an unreadable body still gives PictureUploadError with an empty body", async () => {
    fetchMock.mockResolvedValue({ status: 500, text: async () => { throw new Error("gone"); } } as unknown as Response);
    const e = (await uploadPicture(blob(), "x.jpg", target).catch((x: unknown) => x)) as PictureUploadError;
    expect(e).toBeInstanceOf(PictureUploadError);
    expect(e.body).toBe("");
  });
  test("every refusal reads the body at most once", async () => {
    for (const s of [401, 403, 500, 503]) {
      const r = once(s, '{"message":"m"}');
      fetchMock.mockResolvedValueOnce(r.res);
      await uploadPicture(blob(), "x.jpg", target).catch(() => undefined);
      expect(r.calls.text + r.calls.json).toBeLessThanOrEqual(1);
    }
  });
  test("a network failure passes through untouched", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(uploadPicture(blob(), "x.jpg", target)).rejects.toThrow("Failed to fetch");
  });
});
