// Ported from GilbApp's contactAnnotation.s8labels.test.ts (8 tests): the annotations client asks the SAME route the MyNet app does
// (`/base/connect/annotations`), with the host's DPoP credential, at the node that holds the card's vault, and sends no audience: the route writes
// the note and the line private. Re-based on the real peers (`lws-session-bridge`, `vault-origin-rule`) over a recording credential, in place of the
// source's `vi.mock` of the two app modules.
import { beforeEach, afterEach, describe, expect, it } from "vitest";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { annotationsFit, AnnotationError, loadHolderAnnotations, saveHolderAnnotations } from "./index";
import { HOME as VAULT, HOME_HOST, PARTY, invalidate, readAnswer, setUp, stub, tearDown } from "../test/support";

beforeEach(setUp);
afterEach(tearDown);

describe("reading", () => {
  it("asks the route at the vault's own node, by the held party only, with the DPoP credential", async () => {
    const calls = stub(200, { ...(readAnswer({ note: "Only I see this" }) as object), originLoad: "empty" });
    const got = await loadHolderAnnotations(PARTY, VAULT);
    expect(calls[0]!.url).toBe(`${HOME_HOST}/base/connect/annotations?heldParty=${encodeURIComponent(PARTY)}`);
    expect(calls[0]!.headers.authorization).toBe("DPoP t");
    expect(got.note).toBe("Only I see this");
    expect(got.origin).toBeNull();
    expect(got.noteLoad).toBe("ok");
    expect(got.originLoad).toBe("empty");
  });
  it("a failed read throws: never an empty note", async () => {
    stub(500, { error: "ReadFailed" });
    await expect(loadHolderAnnotations(PARTY, VAULT)).rejects.toBeInstanceOf(AnnotationError);
  });
  it("a server that reports a failed load is an error even on 200", async () => {
    stub(200, { noteLoad: "error", originLoad: "ok" });
    await expect(loadHolderAnnotations(PARTY, VAULT)).rejects.toBeInstanceOf(AnnotationError);
  });
  it("a 401 drops the credential and says not signed in", async () => {
    stub(401, "no");
    await expect(loadHolderAnnotations(PARTY, VAULT)).rejects.toBeInstanceOf(NotSignedInError);
    expect(invalidate).toHaveBeenCalled();
  });
});

describe("writing", () => {
  it("sends the held party, the vault and the field, and NO audience of any kind", async () => {
    const calls = stub(201, { heldParty: PARTY, note: "n", changed: true });
    const out = await saveHolderAnnotations({ heldParty: PARTY, vaultId: VAULT, note: "n" });
    expect(calls[0]!.url).toBe(`${HOME_HOST}/base/connect/annotations`);
    expect(calls[0]!.method).toBe("PUT");
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ heldParty: PARTY, vaultId: VAULT, note: "n" });
    expect(out.changed).toBe(true);
  });
  it("writes the line (origin) alone without touching the note", async () => {
    const calls = stub(201, { heldParty: PARTY, origin: "Madrid Conference", changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: VAULT, origin: "Madrid Conference" });
    expect(JSON.parse(String(calls[0]!.body))).toEqual({ heldParty: PARTY, vaultId: VAULT, origin: "Madrid Conference" });
  });
  it("an empty string is sent (it clears); a refused write throws", async () => {
    let calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: VAULT, note: "" });
    expect(JSON.parse(String(calls[0]!.body)).note).toBe("");
    calls = stub(403, { error: "Forbidden" });
    await expect(saveHolderAnnotations({ heldParty: PARTY, vaultId: VAULT, note: "x" })).rejects.toBeInstanceOf(AnnotationError);
  });
});

describe("annotationsFit — the route reads from the holder's own vault, so only a card held there offers a note", () => {
  it("is true for the same vault and false for another or none", () => {
    expect(annotationsFit(VAULT, `${VAULT}/`)).toBe(true);
    expect(annotationsFit(VAULT, "https://other.platform.example.test/base")).toBe(false);
    expect(annotationsFit(VAULT, null)).toBe(false);
    expect(annotationsFit(null, VAULT)).toBe(false);
  });
});
