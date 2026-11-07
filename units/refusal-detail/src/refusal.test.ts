import { describe, expect, test } from "vitest";
import { parseServerErrorBody, serverErrorText } from "@kaigilb/gilbplatformcode-server-error";
import { NoAccessError, VaultBusyError, readRefusal, refusalLine, type RefusalDetail } from "./index";

const detail: RefusalDetail = { method: "GET", path: "/lws/vault/x/records", status: 403, sentence: "vault target denied: no read reach" };
const NO_REASON_503 = "Refused (HTTP 503) — no reason was sent — copy this line if you report it";

describe("refusalLine", () => {
  test("is METHOD path -> HTTP status - sentence", () => {
    expect(refusalLine(detail)).toBe("GET /lws/vault/x/records -> HTTP 403 - vault target denied: no read reach");
  });
  test("with no sentence it says none was sent", () => {
    expect(refusalLine({ ...detail, sentence: null })).toBe("GET /lws/vault/x/records -> HTTP 403 - no sentence was sent");
  });
});

describe("NoAccessError", () => {
  // Ported from TestFlowerPower screens/batch8.test.tsx:15.
  test("carries the detail and the server's sentence", () => {
    const e = new NoAccessError("s", detail);
    expect(e.detail).toEqual(detail);
    expect(e.serverSentence).toBe("s");
    expect(e.name).toBe("NoAccessError");
    expect(e).toBeInstanceOf(Error);
    expect(refusalLine({ ...detail, sentence: null })).toContain("no sentence was sent");
  });
  test("its default message asks the owner and names no place", () => {
    const e = new NoAccessError();
    expect(e.message).toBe("You have no write access here yet. Ask the owner.");
    expect(e.serverSentence).toBeNull();
    expect(e.detail).toBeNull();
  });
  test("a host's own message replaces the default (the source app passed its garden wording)", () => {
    const e = new NoAccessError(null, null, "You have no write access to this garden yet. Ask the owner.");
    expect(e.message).toBe("You have no write access to this garden yet. Ask the owner.");
  });
});

test("VaultBusyError carries its status and message", () => {
  const e = new VaultBusyError(503, "busy");
  expect(e.status).toBe(503);
  expect(e.message).toBe("busy");
  expect(e.name).toBe("VaultBusyError");
  expect(e).toBeInstanceOf(Error);
});

describe("readRefusal", () => {
  const url = "https://example.test/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files?name=a.jpg";
  test("a 400 WrongVaultRoot: the message reaches the line as it is; the path keeps %2F and drops the query", async () => {
    const res = new Response('{"error":"WrongVaultRoot","message":"Use the vault root https://example.test/vault"}', { status: 400 });
    const d = await readRefusal("PUT", url, res);
    expect(d).toEqual({ method: "PUT", path: "/lws/vault/https%3A%2F%2Fexample.test%2Fvault/files", status: 400, sentence: "Use the vault root https://example.test/vault" });
    expect(refusalLine(d)).toBe("PUT /lws/vault/https%3A%2F%2Fexample.test%2Fvault/files -> HTTP 400 - Use the vault root https://example.test/vault");
  });
  test("a 403 with a sentence in error", async () => {
    const d = await readRefusal("GET", "https://example.test/lws/vault/x/records?type=Note", new Response('{"error":"Not yours."}', { status: 403 }));
    expect(d).toEqual({ method: "GET", path: "/lws/vault/x/records", status: 403, sentence: "Not yours." });
  });
  test("an empty 503 gets the server-error unit's no-reason sentence", async () => {
    const d = await readRefusal("POST", "https://example.test/a", new Response("", { status: 503 }));
    expect(d.sentence).toBe(NO_REASON_503);
    expect(d.status).toBe(503);
  });
  test("a body that cannot be read still resolves", async () => {
    const res = { status: 503, text: () => Promise.reject(new Error("stream failed")) } as unknown as Response;
    const d = await readRefusal("GET", "https://example.test/a", res);
    expect(d).toEqual({ method: "GET", path: "/a", status: 503, sentence: NO_REASON_503 });
  });
  test("it does not decide which statuses are refusals: a 200 is read like any other", async () => {
    const d = await readRefusal("GET", "https://example.test/a", new Response("", { status: 200 }));
    expect(d.status).toBe(200);
  });
  test("a lower-case %2f is written %2F", async () => {
    const d = await readRefusal("GET", "https://example.test/a%2fb", new Response("", { status: 403 }));
    expect(d.path).toBe("/a%2Fb");
  });
});

// Expectations computed once from the copy of the reader the source app used (lws-records, serverError.ts), written as literals.
const CASES: [number, string, string][] = [
    [403,"","Refused (HTTP 403) — no reason was sent — copy this line if you report it"],
    [403,"{\"error\":\"Not yours.\"}","Not yours."],
    [403,"{\"error\":\"vault target denied: no read reach\"}","vault target denied: no read reach"],
    [400,"{\"error\":\"WrongVaultRoot\",\"message\":\"Use the vault root https://example.test/vault\"}","Use the vault root https://example.test/vault"],
    [400,"{\"error\":\"BadRequest\"}","BadRequest (HTTP 400) — no reason was sent — copy this line if you report it"],
    [400,"{\"error\":\"Bad Request\"}","Bad Request"],
    [503,"","Refused (HTTP 503) — no reason was sent — copy this line if you report it"],
    [503,"   ","Refused (HTTP 503) — no reason was sent — copy this line if you report it"],
    [502,"<html>Bad gateway</html>","<html>Bad gateway</html>"],
    [502,"Bad gateway from the edge","Bad gateway from the edge"],
    [404,"{\"message\":\"NotFound\"}","NotFound (HTTP 404) — no reason was sent — copy this line if you report it"],
    [404,"{\"message\":\"Nothing here\"}","Nothing here"],
    [500,"{\"error\":\"Boom\",\"message\":\"Something broke inside\"}","Something broke inside"],
    [500,"{\"error\":\"Boom\",\"message\":\"Oops\"}","Boom (HTTP 500) — no reason was sent — copy this line if you report it"],
    [403,"{\"message\":42}","Refused (HTTP 403) — no reason was sent — copy this line if you report it"],
    [403,"[]","Refused (HTTP 403) — no reason was sent — copy this line if you report it"],
    [403,"[\"a b\"]","a b"],
    [403,"null","null (HTTP 403) — no reason was sent — copy this line if you report it"],
    [412,"\"plain string body\"","plain string body"],
    [401,"{not json","{not json"],
];
describe("the sentence of the peer server-error unit", () => {
  test("twenty (status, body) pairs give the sentences the source app's reader gave", () => {
    expect(CASES).toHaveLength(20);
    for (const [status, text, expected] of CASES) expect(serverErrorText(status, parseServerErrorBody(text), "Refused"), JSON.stringify([status, text])).toBe(expected);
  });
});
