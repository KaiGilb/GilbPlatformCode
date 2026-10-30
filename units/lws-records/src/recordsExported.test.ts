// @vitest-environment node
// New tests for the three functions exported in 0.4.0 (they were private before, and are unchanged): `idFromResourceUrl`,
// `throwForCreateStatus` and `toWireFacts`. A unit that makes its own create-style request builds its body and reads its answer with them.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { RecordForbiddenError, idFromResourceUrl, throwForCreateStatus, toWireFacts } from "./index";
import { resp, setUp, tearDown, type FakeHost } from "../test/support";

let host: FakeHost;
beforeEach(() => {
  host = setUp();
});
afterEach(() => tearDown());

describe("idFromResourceUrl", () => {
  it("takes what follows /lws/r/", () => {
    expect(idFromResourceUrl("https://h.platform.example.test/lws/r/abc123")).toBe("abc123");
  });
  it("takes the whole text when there is no marker", () => {
    expect(idFromResourceUrl("abc123")).toBe("abc123");
    expect(idFromResourceUrl("")).toBe("");
  });
  it("takes everything after the FIRST marker", () => {
    expect(idFromResourceUrl("x/lws/r/a/lws/r/b")).toBe("a/lws/r/b");
  });
});

describe("throwForCreateStatus", () => {
  it("a 401 drops the credential and throws NotSignedInError", async () => {
    await expect(throwForCreateStatus(resp(401))).rejects.toBeInstanceOf(NotSignedInError);
    expect(host.invalidateDpop).toHaveBeenCalledTimes(1);
  });
  it("a 403 throws RecordForbiddenError and does not drop the credential", async () => {
    await expect(throwForCreateStatus(resp(403, { body: "no" }))).rejects.toBeInstanceOf(RecordForbiddenError);
    expect(host.invalidateDpop).not.toHaveBeenCalled();
  });
  it("any other status throws an Error that carries the status", async () => {
    const err = await throwForCreateStatus(resp(409, { body: "taken" })).catch((e) => e as Error & { status: number });
    expect(err).toBeInstanceOf(Error);
    expect(err.status).toBe(409);
    expect(err).not.toBeInstanceOf(RecordForbiddenError);
    expect(host.invalidateDpop).not.toHaveBeenCalled();
  });
});

describe("toWireFacts", () => {
  it("mints a:<slug> keys, omits empty strings, null and undefined, keeps 0 and false and edges unchanged", async () => {
    const out = await toWireFacts({ name: "Ann", empty: "", gone: null, zero: 0, no: false, edge: { "@id": "https://h.platform.example.test/base/e/x" } } as never);
    expect(out).toEqual({ "a:name": "Ann", "a:zero": 0, "a:no": false, "a:edge": { "@id": "https://h.platform.example.test/base/e/x" } });
  });
  it("carries an empty string the vault served when the slug is in keepEmpty", async () => {
    const out = await toWireFacts({ a: "", b: "" }, undefined, new Set(["a"]));
    expect(out).toEqual({ "a:a": "" });
  });
});
