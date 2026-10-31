// The two requests of the annotations route, and where they go. The asymmetry is load-bearing (the measured route table of the MyNet app):
//   PUT  carries the vault in the BODY (`vaultId`) and is ADDRESSED at that vault's node;
//   GET  is ADDRESSED at the node and names the party only: `?vaultId=` is refused (400) by the route's query schema.
// And the notes are private to the holder: they are written only to the holder's own vault, through the annotations door, never to the person's card.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ANNOTATIONS_PATH, ANNOTATIONS_VAULT_PARAM, AnnotationVaultMismatchError, annotationsFit, loadHolderAnnotations, sameVault, saveHolderAnnotations } from "./index";
import { APEX, HOME, HOME_HOST, PARTY, THEIRS, THEIRS_HOST, readAnswer, record, setUp, stub, tearDown, type Call } from "../test/support";

beforeEach(setUp);
afterEach(tearDown);

describe("GET: addressed at the vault's node, the party in the query, nothing else", () => {
  it("the URL is the vault's node + the route + ?heldParty= alone (no vaultId, no vault in the query)", async () => {
    const calls = stub(200, readAnswer({ note: "n" }));
    await loadHolderAnnotations(PARTY, HOME);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${HOME_HOST}${ANNOTATIONS_PATH}?heldParty=${encodeURIComponent(PARTY)}`);
    const u = new URL(calls[0]!.url);
    expect([...u.searchParams.keys()]).toEqual(["heldParty"]);
    expect(u.searchParams.has(ANNOTATIONS_VAULT_PARAM)).toBe(false);
    expect(ANNOTATIONS_VAULT_PARAM).toBe("vaultId");
  });
  it("the host is the vault's own node, not the platform's base address", async () => {
    const calls = stub(200, readAnswer());
    await loadHolderAnnotations(PARTY, HOME);
    expect(new URL(calls[0]!.url).origin).toBe(HOME_HOST);
    expect(new URL(calls[0]!.url).origin).not.toBe(APEX);
  });
  it("a card held in another vault is asked at THAT vault's node", async () => {
    const calls = stub(200, readAnswer({ vault: THEIRS, heldParty: `${THEIRS}/e/x` }));
    await loadHolderAnnotations(`${THEIRS}/e/x`, THEIRS);
    expect(new URL(calls[0]!.url).origin).toBe(THEIRS_HOST);
  });
  it("it is a GET with no body, no store, signed by the READ credential for exactly that method and URL", async () => {
    const calls = stub(200, readAnswer());
    await loadHolderAnnotations(PARTY, HOME);
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.body).toBeUndefined();
    expect(calls[0]!.headers.dpop).toBe(`read GET ${calls[0]!.url}`);
    expect(calls[0]!.headers.accept).toBe("application/json");
  });
  it("the held party is URL-encoded", async () => {
    const calls = stub(200, readAnswer({ heldParty: "https://x.test/base/e/a b&c" }));
    await loadHolderAnnotations("https://x.test/base/e/a b&c", HOME);
    expect(calls[0]!.url).toContain("heldParty=https%3A%2F%2Fx.test%2Fbase%2Fe%2Fa%20b%26c");
  });
});

describe("PUT: the vault in the body AND the node addressed", () => {
  it("the URL is the vault's node + the route, with no query; the body names the vault", async () => {
    const calls = stub(201, { heldParty: PARTY, note: "n", changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "n" });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${HOME_HOST}${ANNOTATIONS_PATH}`);
    expect(new URL(calls[0]!.url).search).toBe("");
    expect(JSON.parse(calls[0]!.body!)).toEqual({ heldParty: PARTY, vaultId: HOME, note: "n" });
  });
  it("is a PUT with JSON, signed by the WRITE credential for exactly that method and URL", async () => {
    const calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, origin: "Madrid" });
    expect(calls[0]!.method).toBe("PUT");
    expect(calls[0]!.headers["content-type"]).toBe("application/json");
    expect(calls[0]!.headers.dpop).toBe(`write PUT ${calls[0]!.url}`);
  });
  it("the host is the vault's node, not the base address", async () => {
    const calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "n" });
    expect(new URL(calls[0]!.url).origin).toBe(HOME_HOST);
  });
  it("only the fields given are in the body (an absent field is not sent, an empty one is)", async () => {
    const calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "" });
    expect(Object.keys(JSON.parse(calls[0]!.body!)).sort()).toEqual(["heldParty", "note", "vaultId"]);
  });
  it("keepalive is off unless asked, on when asked", async () => {
    let calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "a" });
    expect(calls[0]!.keepalive).toBe(false);
    calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "b", keepalive: true });
    expect(calls[0]!.keepalive).toBe(true);
  });
  it("reads back what the route answers: changed, and the echoed fields", async () => {
    stub(201, { heldParty: PARTY, note: "n", changed: true });
    expect(await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "n" })).toEqual({ heldParty: PARTY, note: "n", origin: undefined, changed: true });
    stub(200, {});
    expect(await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "n" })).toEqual({ heldParty: PARTY, note: undefined, origin: undefined, changed: false });
  });
});

describe("the two requests differ, on purpose", () => {
  it("the PUT body carries the vault and the GET query does not; both are addressed at the same node", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push(record(url, init));
      return new Response(JSON.stringify(init.method === "PUT" ? { changed: true } : readAnswer()), { status: 200 });
    });
    await loadHolderAnnotations(PARTY, HOME);
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "x" });
    const [get, put] = calls as [Call, Call];
    expect(new URL(get.url).origin).toBe(new URL(put.url).origin);
    expect(new URL(get.url).pathname).toBe(new URL(put.url).pathname);
    expect(get.url).not.toContain("vaultId");
    expect(JSON.parse(put.body!).vaultId).toBe(HOME);
  });
});

describe("the named read: only after a read that could not be tied, and a refusal is learned", () => {
  it("the first read never names the vault; the second (named) read carries ?vaultId= once", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push(record(url, init));
      const named = new URL(url).searchParams.get("vaultId");
      return new Response(JSON.stringify(readAnswer({ vault: named ?? THEIRS })), { status: 200 });
    });
    await loadHolderAnnotations(PARTY, HOME);
    expect(calls).toHaveLength(2);
    expect(new URL(calls[0]!.url).searchParams.has("vaultId")).toBe(false);
    expect(new URL(calls[1]!.url).searchParams.get("vaultId")).toBe(HOME);
    expect(new URL(calls[1]!.url).origin).toBe(HOME_HOST);
  });
  it("a platform that refuses the named form (400) is learned: later reads stay plain and fail as 'untied'", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push(record(url, init));
      if (new URL(url).searchParams.has("vaultId")) return new Response("{}", { status: 400 });
      return new Response(JSON.stringify(readAnswer({ vault: THEIRS })), { status: 200 });
    });
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toBeInstanceOf(AnnotationVaultMismatchError);
    expect(calls).toHaveLength(2);
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toBeInstanceOf(AnnotationVaultMismatchError);
    expect(calls).toHaveLength(3);
    expect(calls.slice(2).every((c) => !c.url.includes("vaultId"))).toBe(true);
  });
  it("a 500 on the named form is NOT learned as a refusal: it is thrown", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      if (new URL(url).searchParams.has("vaultId")) return new Response("boom", { status: 500 });
      return new Response(JSON.stringify(readAnswer({ vault: THEIRS })), { status: 200 });
    });
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toMatchObject({ status: 500 });
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toMatchObject({ status: 500 });
  });
});

describe("privacy: the notes go only to the holder's own vault, through the annotations door, never to the person's card", () => {
  it("a write about a person whose card is in ANOTHER vault goes to the holder's vault node and to no other host", async () => {
    const calls = stub(201, { changed: true });
    const theirCard = `${THEIRS}/e/anna0001`;
    await saveHolderAnnotations({ heldParty: theirCard, vaultId: HOME, note: "she owes me lunch" });
    expect(calls).toHaveLength(1);
    expect(new URL(calls[0]!.url).origin).toBe(HOME_HOST);
    expect(calls[0]!.url.startsWith(THEIRS_HOST)).toBe(false);
    expect(calls[0]!.url).toBe(`${HOME_HOST}${ANNOTATIONS_PATH}`);
    // the person's card address is DATA in the body (the key of the note), never a place a request goes
    expect(JSON.parse(calls[0]!.body!).heldParty).toBe(theirCard);
  });
  it("a read about that person is asked at the holder's vault node too", async () => {
    const calls = stub(200, readAnswer({ heldParty: `${THEIRS}/e/anna0001` }));
    await loadHolderAnnotations(`${THEIRS}/e/anna0001`, HOME);
    expect(calls.map((c) => new URL(c.url).origin)).toEqual([HOME_HOST]);
  });
  it("every request in a read-then-write is the annotations route at the holder's node: no record route, no other host", async () => {
    const calls: Call[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit = {}) => {
      calls.push(record(url, init));
      return new Response(JSON.stringify(init.method === "PUT" ? { changed: true } : readAnswer()), { status: 200 });
    });
    await loadHolderAnnotations(`${THEIRS}/e/anna0001`, HOME);
    await saveHolderAnnotations({ heldParty: `${THEIRS}/e/anna0001`, vaultId: HOME, note: "private", origin: "Oslo" });
    expect(calls.length).toBe(2);
    for (const c of calls) {
      const u = new URL(c.url);
      expect(u.origin).toBe(HOME_HOST);
      expect(u.pathname).toBe(ANNOTATIONS_PATH);
      expect(c.url).not.toContain("/lws/");
    }
  });
  it("the text of a note appears only in the PUT body, never in a URL", async () => {
    const calls = stub(201, { changed: true });
    await saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "secret-word", origin: "other-secret" });
    expect(calls[0]!.url).not.toContain("secret");
    expect(calls[0]!.body).toContain("secret-word");
  });
  it("a note is offered only on a card held in the holder's own vault (annotationsFit)", () => {
    expect(annotationsFit(HOME, HOME)).toBe(true);
    expect(annotationsFit(THEIRS, HOME)).toBe(false);
    expect(annotationsFit(HOME, undefined)).toBe(false);
    expect(annotationsFit("", "")).toBe(false);
    expect(annotationsFit(`${HOME}///`, HOME)).toBe(true);
  });
});

describe("the answers are read strictly", () => {
  it("tolerates a server that predates the arrays: the singular field is the one value", async () => {
    stub(200, { note: "old", origin: "Bergen", noteLoad: "ok", originLoad: "ok", vault: HOME });
    const got = await loadHolderAnnotations(PARTY, HOME);
    expect(got.notes).toEqual([{ entity: "", text: "old" }]);
    expect(got.origins).toEqual([{ entity: "", text: "Bergen" }]);
    expect(got.note).toBe("old");
  });
  it("keeps EVERY live value, newest first, and drops empty ones", async () => {
    stub(200, { ...(readAnswer({ note: "mine", others: [{ entity: "e2", text: "from another app" }] }) as object) });
    const got = await loadHolderAnnotations(PARTY, HOME);
    expect(got.notes.map((n) => n.text)).toEqual(["mine", "from another app"]);
    stub(200, { ...(readAnswer() as object), notes: [{ entity: "e", text: "" }, { entity: "f" }], noteLoad: "empty" });
    expect((await loadHolderAnnotations(PARTY, HOME)).notes).toEqual([]);
  });
  it("a failed load of EITHER field is an error, even when the other is fine", async () => {
    stub(200, { noteLoad: "ok", originLoad: "error", vault: HOME });
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toMatchObject({ name: "AnnotationError" });
    stub(200, { noteLoad: "error", originLoad: "ok", vault: HOME });
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toMatchObject({ name: "AnnotationError" });
  });
  it("a vault with no readable host is the same as no vault: never the same one", () => {
    expect(sameVault(null, "not a url")).toBe(false);
    expect(sameVault("", "")).toBe(false);
    expect(sameVault("not a url", "also not")).toBe(false);
    expect(sameVault(`${HOME}`, `${HOME_HOST}/vault`)).toBe(true);
  });
  it("an unknown load word is an error", async () => {
    stub(200, { noteLoad: "weird", originLoad: "ok", vault: HOME });
    await expect(loadHolderAnnotations(PARTY, HOME)).rejects.toMatchObject({ name: "AnnotationError", status: 500 });
  });
  it("the error carries the status and the platform's words", async () => {
    stub(403, "no way");
    await expect(saveHolderAnnotations({ heldParty: PARTY, vaultId: HOME, note: "x" })).rejects.toMatchObject({ status: 403, message: "Annotation 403 — no way" });
  });
});
