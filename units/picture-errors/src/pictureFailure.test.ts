import { afterEach, describe, expect, test, vi } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { RecordConflictError } from "@kaigilb/gilbplatformcode-lws-records";
import { NoAccessError, VaultBusyError } from "@kaigilb/gilbplatformcode-refusal-detail";
import { PictureUnreadableError } from "@kaigilb/gilbplatformcode-picture-shrink";
import { PictureUploadError } from "@kaigilb/gilbplatformcode-picture-upload";
import { DEFAULT_PICTURE_FAILURE_WORDS, pictureFailure, type PictureFailureKind } from "./index";

afterEach(() => vi.unstubAllGlobals());

const detail = { method: "PUT", path: "/lws/vault/x/files", status: 403, sentence: "no write reach" };

describe("pictureFailure, one test per kind", () => {
  test("no-access: the sentence, the next step, and the refusal line as detail", () => {
    expect(pictureFailure(new NoAccessError("no write reach", detail))).toEqual({
      kind: "no-access",
      sentence: "You can not add pictures here.",
      next: "Ask the owner for write access.",
      detail: "PUT /lws/vault/x/files -> HTTP 403 - no write reach",
    });
  });
  test("no-access with no detail: the server's own sentence, else null", () => {
    expect(pictureFailure(new NoAccessError("only words")).detail).toBe("only words");
    expect(pictureFailure(new NoAccessError()).detail).toBeNull();
  });
  test("not-signed-in", () => {
    expect(pictureFailure(new NotSignedInError())).toEqual({ kind: "not-signed-in", sentence: "You are signed out.", next: "Sign in again; your picture waits on this device.", detail: null });
  });
  test("vault-busy", () => {
    expect(pictureFailure(new VaultBusyError(503, "busy"))).toEqual({ kind: "vault-busy", sentence: "The vault is busy.", next: "Your picture waits on this device and is sent again soon.", detail: null });
  });
  test("wrong-vault-root: the body's message is the detail", () => {
    const f = pictureFailure(new PictureUploadError(400, JSON.stringify({ error: "WrongVaultRoot", message: "use https://x.example.test/vault" })));
    expect(f).toEqual({ kind: "wrong-vault-root", sentence: "This app is pointed at the wrong vault address.", next: "Tell the app's maker: the vault root must come from the vault list.", detail: "use https://x.example.test/vault" });
  });
  test("wrong-vault-root with a body that is not JSON: the body is the detail", () => {
    expect(pictureFailure(new PictureUploadError(400, "WrongVaultRoot: use the vault list")).detail).toBe("WrongVaultRoot: use the vault list");
  });
  test("wrong-vault-root with JSON that has no message: the body is the detail", () => {
    expect(pictureFailure(new PictureUploadError(400, '{"error":"WrongVaultRoot"}')).detail).toBe('{"error":"WrongVaultRoot"}');
  });
  test("wrong-sign-in-host: the message names the right host and is kept as detail", () => {
    const f = pictureFailure(new PictureUploadError(400, JSON.stringify({ error: "WrongSignInHost", message: "sign in at id.example.test" })));
    expect(f).toEqual({ kind: "wrong-sign-in-host", sentence: "This app signs in at the wrong place.", next: "Tell the app's maker: the sign-in host is wrong.", detail: "sign in at id.example.test" });
  });
  test("a 400 that names neither is not one of these two", () => {
    expect(pictureFailure(new PictureUploadError(400, "bad")).kind).toBe("unknown");
  });
  test("too-big (413)", () => {
    expect(pictureFailure(new PictureUploadError(413, ""))).toEqual({ kind: "too-big", sentence: "The picture is too big for the vault.", next: "Pick a smaller picture.", detail: null });
  });
  test("storage-full (507)", () => {
    expect(pictureFailure(new PictureUploadError(507, ""))).toEqual({ kind: "storage-full", sentence: "The vault is full.", next: "Ask the owner to make room.", detail: null });
  });
  test("a WrongVaultRoot body on another status is not wrong-vault-root", () => {
    expect(pictureFailure(new PictureUploadError(413, "WrongVaultRoot")).kind).toBe("too-big");
    expect(pictureFailure(new PictureUploadError(500, "WrongVaultRoot")).kind).toBe("unknown");
    expect(pictureFailure(new PictureUploadError(413, "WrongSignInHost")).kind).toBe("too-big");
    expect(pictureFailure(new PictureUploadError(500, "WrongSignInHost")).kind).toBe("unknown");
  });
  test("unreadable: the sentence is the error's own message", () => {
    expect(pictureFailure(new PictureUnreadableError("This looks like HEIC."))).toEqual({ kind: "unreadable", sentence: "This looks like HEIC.", next: "Pick a JPEG or PNG.", detail: null });
    expect(pictureFailure(new PictureUnreadableError()).sentence).toBe(new PictureUnreadableError().message);
  });
  test("changed-elsewhere", () => {
    expect(pictureFailure(new RecordConflictError())).toEqual({ kind: "changed-elsewhere", sentence: "Someone else changed this just now.", next: "Reload and try again.", detail: null });
  });
  test("offline: a TypeError", () => {
    expect(pictureFailure(new TypeError("x"))).toEqual({ kind: "offline", sentence: "You are offline.", next: "Your picture waits on this device and is sent when you are back online.", detail: null });
  });
  test("offline: navigator.onLine false", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(pictureFailure(new Error("whatever")).kind).toBe("offline");
  });
  test.each(["Failed to fetch", "fetch failed", "Network error", "you are Offline", "Load failed"])("offline: the message %s", (m) => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(pictureFailure(new Error(m)).kind).toBe("offline");
  });
  test("unknown: anything else, with the message as detail", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(pictureFailure(new Error("boom"))).toEqual({ kind: "unknown", sentence: "The picture could not be saved.", next: "Try again; if it keeps failing, tell the app's maker.", detail: "boom" });
  });
  test("unknown: a value that is not an Error is still shown", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(pictureFailure("odd")).toMatchObject({ kind: "unknown", detail: "odd" });
    expect(pictureFailure(null)).toMatchObject({ kind: "unknown", detail: "null" });
  });
  test("a PictureUploadError of another status is unknown, with its message", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(pictureFailure(new PictureUploadError(500, "x"))).toMatchObject({ kind: "unknown", detail: "The picture could not be saved (HTTP 500)." });
  });
});

describe("order of the checks", () => {
  test("a NoAccessError while offline is still no-access", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(pictureFailure(new NoAccessError()).kind).toBe("no-access");
  });
  test("a NotSignedInError, VaultBusyError and conflict while offline keep their kinds", () => {
    vi.stubGlobal("navigator", { onLine: false });
    expect(pictureFailure(new NotSignedInError()).kind).toBe("not-signed-in");
    expect(pictureFailure(new VaultBusyError(503, "network busy")).kind).toBe("vault-busy");
    expect(pictureFailure(new RecordConflictError()).kind).toBe("changed-elsewhere");
    expect(pictureFailure(new PictureUploadError(413, "")).kind).toBe("too-big");
    expect(pictureFailure(new PictureUnreadableError("network? no")).kind).toBe("unreadable");
  });
  test("wrong-vault-root wins over wrong-sign-in-host when a body names both", () => {
    expect(pictureFailure(new PictureUploadError(400, "WrongVaultRoot WrongSignInHost")).kind).toBe("wrong-vault-root");
  });
  test("an Error whose message looks like a network failure is offline, though it is no TypeError", () => {
    vi.stubGlobal("navigator", { onLine: true });
    expect(pictureFailure(new Error("The Internet connection appears to be offline.")).kind).toBe("offline");
  });
});

describe("words", () => {
  test("an app's words replace the sentence and next of the kinds it gives, field by field", () => {
    const f = pictureFailure(new NotSignedInError(), { "not-signed-in": { sentence: "Du bist abgemeldet.", next: "Melde dich an." } });
    expect(f).toMatchObject({ sentence: "Du bist abgemeldet.", next: "Melde dich an." });
    const g = pictureFailure(new NotSignedInError(), { "not-signed-in": { sentence: "Only this." } });
    expect(g.sentence).toBe("Only this.");
    expect(g.next).toBe("Sign in again; your picture waits on this device.");
  });
  test("words for another kind change nothing", () => {
    expect(pictureFailure(new NotSignedInError(), { offline: { sentence: "x", next: "y" } }).sentence).toBe("You are signed out.");
  });
  test("an override reaches unreadable and unknown too", () => {
    expect(pictureFailure(new PictureUnreadableError("own"), { unreadable: { sentence: "Nicht lesbar.", next: "Nimm JPEG." } })).toMatchObject({ sentence: "Nicht lesbar.", next: "Nimm JPEG." });
    vi.stubGlobal("navigator", { onLine: true });
    expect(pictureFailure(new Error("e"), { unknown: { sentence: "S", next: "N" } })).toMatchObject({ sentence: "S", next: "N", detail: "e" });
  });
});

// The Clarity.Error Value names ten failures a person can meet. Each gets its own kind and a next step: this is that Value's Meter.
describe("Clarity.Error: the ten failures", () => {
  const cases: [string, () => unknown, PictureFailureKind][] = [
    ["no access", () => new NoAccessError(), "no-access"],
    ["wrong vault root", () => new PictureUploadError(400, "WrongVaultRoot"), "wrong-vault-root"],
    ["offline", () => new TypeError("Failed to fetch"), "offline"],
    ["vault busy", () => new VaultBusyError(503, "busy"), "vault-busy"],
    ["file too big", () => new PictureUploadError(413, ""), "too-big"],
    ["format unreadable", () => new PictureUnreadableError(), "unreadable"],
    ["changed elsewhere", () => new RecordConflictError(), "changed-elsewhere"],
    ["not signed in", () => new NotSignedInError(), "not-signed-in"],
    ["storage full", () => new PictureUploadError(507, ""), "storage-full"],
    ["unknown", () => new Error("boom"), "unknown"],
  ];
  test.each(cases)("%s gets its own kind and a next step", (_n, make, kind) => {
    vi.stubGlobal("navigator", { onLine: true });
    const f = pictureFailure(make());
    expect(f.kind).toBe(kind);
    expect(f.next.length).toBeGreaterThan(0);
    expect(f.sentence.length).toBeGreaterThan(0);
  });
  test("the ten kinds are ten different kinds, and the eleventh (wrong sign-in host) is its own too", () => {
    vi.stubGlobal("navigator", { onLine: true });
    const kinds = cases.map(([, make]) => pictureFailure(make()).kind);
    expect(new Set(kinds).size).toBe(10);
    expect(Object.keys(DEFAULT_PICTURE_FAILURE_WORDS).length).toBe(11);
    for (const w of Object.values(DEFAULT_PICTURE_FAILURE_WORDS)) {
      expect(w.sentence).not.toBe("");
      expect(w.next).not.toBe("");
    }
  });
});
