import { afterEach, describe, expect, test, vi } from "vitest";
import { describeError, DESCRIBE_WORDS } from "./describe";
import { NoAccessError, VaultBusyError, readRefusal } from "./index";

// Stand-ins by name and status: this unit does not import the units that throw these.
const named = (name: string, props: Record<string, unknown> = {}, message = "raw message") => Object.assign(new Error(message), { name }, props);

afterEach(() => vi.unstubAllGlobals());

describe("describeError", () => {
  test("NoAccessError answers its own message, the default or the host's", () => {
    expect(describeError(new NoAccessError())).toBe("You have no write access here yet. Ask the owner.");
    expect(describeError(new NoAccessError("server words", null, "Ask Ann."))).toBe("Ask Ann.");
  });
  test("VaultBusyError answers its message", () => {
    expect(describeError(new VaultBusyError(503, "The vault is busy. Try again in a moment."))).toBe("The vault is busy. Try again in a moment.");
  });
  test("a 403 RecordForbiddenError answers its message", () => {
    expect(describeError(named("RecordForbiddenError", { reason: "x" }, "You do not have write access to this record."))).toBe("You do not have write access to this record.");
  });
  test("NotSignedInError and a bare 401 are 'Sign in again.' even when a platform sentence rides along", () => {
    expect(describeError(named("NotSignedInError", { platformSentence: "token expired" }))).toBe("Sign in again.");
    expect(describeError(Object.assign(new Error("x"), { status: 401 }))).toBe("Sign in again.");
  });
  test("a request the platform refused (RequestRefusedError, status 401 WITH a sentence) answers the platform's sentence", () => {
    expect(describeError(named("RequestRefusedError", { status: 401, platformSentence: "The request proof is too old." }))).toBe("The request proof is too old.");
  });
  test("a refusal sentence is found in serverSentence, platformMessage, reason, detail.sentence and a RefusalDetail itself", async () => {
    expect(describeError(Object.assign(new Error("x"), { serverSentence: "from server" }))).toBe("from server");
    expect(describeError({ platformMessage: " from platform " })).toBe("from platform");
    expect(describeError(Object.assign(new Error("x"), { detail: { sentence: "from detail" } }))).toBe("from detail");
    const res = new Response('{"error":"X","message":"Use the vault root"}', { status: 400 });
    const detail = await readRefusal("GET", "https://example.test/lws/x", res);
    expect(describeError(detail)).toBe(detail.sentence);
    expect(describeError({ method: "GET", path: "/a", status: 403, sentence: null })).toBe(DESCRIBE_WORDS.fallback);
  });
  test("a conflict (name or 412 or 428) answers the default, or the host's sentence", () => {
    expect(describeError(named("RecordConflictError"))).toBe(DESCRIBE_WORDS.conflict);
    expect(describeError(Object.assign(new Error("x"), { status: 412 }), { conflict: "This camera was changed elsewhere." })).toBe("This camera was changed elsewhere.");
    expect(describeError(Object.assign(new Error("x"), { status: 428 }), { conflict: "Changed." })).toBe("Changed.");
  });
  test("a network failure is 'No connection. Try again.' (the browsers\' failed-fetch messages, an offline browser)", () => {
    expect(describeError(new TypeError("Failed to fetch"))).toBe("No connection. Try again.");
    expect(describeError(new Error("Load failed"))).toBe("No connection. Try again.");
    expect(describeError(new TypeError("NetworkError when attempting to fetch resource."))).toBe("No connection. Try again.");
    // a TypeError that is a bug in the page is not a lost connection
    expect(describeError(new TypeError("x is not a function"))).toBe("Something went wrong. Try again.");
    vi.stubGlobal("navigator", { onLine: false });
    expect(describeError(new Error("odd"))).toBe("No connection. Try again.");
  });
  test("more maps a host error (picture errors) after the refusals and before the network; null lets the search go on", () => {
    const more = (e: unknown) => (e instanceof RangeError ? "That picture is too large." : null);
    expect(describeError(new RangeError("x"), { more })).toBe("That picture is too large.");
    expect(describeError(new TypeError("Failed to fetch"), { more })).toBe("No connection. Try again.");
    // more is not asked for a refusal the unit already knows
    expect(describeError(new NoAccessError(), { more: () => "no" })).toBe("You have no write access here yet. Ask the owner.");
  });
  test("an unknown error is the fallback; a raw message, a stack and a status are never shown", () => {
    expect(describeError(new Error("Unexpected token < in JSON at position 0"))).toBe("Something went wrong. Try again.");
    expect(describeError("boom")).toBe("Something went wrong. Try again.");
    expect(describeError(undefined)).toBe("Something went wrong. Try again.");
    expect(describeError(null, { fallback: "Not saved." })).toBe("Not saved.");
  });
});
