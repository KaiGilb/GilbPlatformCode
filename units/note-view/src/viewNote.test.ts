import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NOTE_BODY_ATTR,
  NOTE_FIND_TYPE_BARE,
  NOTE_SENTINEL_TYPE_BARE,
  NOTE_TITLE_ATTR,
  NOTE_TYPE_PREFIXED,
  NoteViewError,
  findLiveNotes,
  findLiveSentinel,
  openNote,
  type NoteViewDeps,
} from "./viewNote";

const HOST_A = "https://node-a.example.test";
const HOST_B = "https://node-b.example.test";
const VAULT_A = "https://holder-a.example.test/vault";
const VAULT_B = "https://holder-b.example.test/vault";
const TOKEN_A = "token-alpha";
const TOKEN_B = "token-beta";
const TITLE = "Field notes from the stream";
const BODY = "A short body the vault must keep.";
const NOTE_ID = "note-live-1";
const NOTE_ENTITY = `${HOST_A}/vault/e/${NOTE_ID}`;

type Call = { url: string; init: RequestInit };

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function scriptedFetch(calls: Call[], responses: Response[]): typeof fetch {
  let i = 0;
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, init: init ?? {} });
    const next = responses[i++];
    if (!next) throw new Error(`unexpected fetch ${url}`);
    return next;
  };
}

function deps(over: Partial<NoteViewDeps> & { fetch: typeof fetch }): NoteViewDeps {
  return {
    host: HOST_A,
    vaultId: VAULT_A,
    authorization: TOKEN_A,
    ...over,
  };
}

function livePage(records: unknown[], extra: Record<string, unknown> = {}): Response {
  return jsonResponse(200, {
    records,
    total: records.length,
    complete: true,
    pageSize: 20,
    offset: 0,
    ...extra,
  });
}

describe("findLiveNotes — F-LIVE NoteDocument", () => {
  it("GETs /lws/vault/<vaultId>/records?type=NoteDocument (bare) on the injected host", async () => {
    const calls: Call[] = [];
    const page = await findLiveNotes(
      deps({
        fetch: scriptedFetch(calls, [
          livePage([
            {
              entity: NOTE_ENTITY,
              typeUri: "t:NoteDocument",
              label: TITLE,
            },
          ]),
        ]),
      }),
    );

    expect(page.records).toHaveLength(1);
    expect(page.records[0]).toEqual({
      id: NOTE_ID,
      entity: NOTE_ENTITY,
      typeUri: "t:NoteDocument",
      listLabel: TITLE,
    });
    expect(calls).toHaveLength(1);
    const live = new URL(calls[0]!.url);
    expect(live.origin).toBe(HOST_A);
    expect(live.pathname).toBe(`/lws/vault/${encodeURIComponent(VAULT_A)}/records`);
    expect(live.searchParams.get("type")).toBe("NoteDocument");
    expect(live.searchParams.get("type")).not.toBe("t:NoteDocument");
    expect(calls[0]!.url).not.toContain("type=t%3A");
    expect(calls[0]!.init.method).toBe("GET");
    expect(NOTE_FIND_TYPE_BARE).toBe("NoteDocument");
    expect(NOTE_TYPE_PREFIXED).toBe("t:NoteDocument");
  });

  it("keeps every live row on the page, including a second note", async () => {
    const second = `${HOST_A}/vault/e/note-live-2`;
    const page = await findLiveNotes(
      deps({
        fetch: scriptedFetch(
          [],
          [
            livePage([
              { entity: NOTE_ENTITY, typeUri: "t:NoteDocument" },
              { entity: second, typeUri: "t:NoteDocument" },
            ]),
          ],
        ),
      }),
    );
    expect(page.records.map((r) => r.id)).toEqual(["note-live-1", "note-live-2"]);
  });

  it("treats 200 empty as none, not as a throw", async () => {
    const page = await findLiveNotes(
      deps({ fetch: scriptedFetch([], [livePage([])]) }),
    );
    expect(page.records).toEqual([]);
    expect(page.complete).toBe(true);
    expect(page.nextOffset).toBeNull();
  });

  it("does not treat list chrome label as a:title (open is the persist read)", async () => {
    const page = await findLiveNotes(
      deps({
        fetch: scriptedFetch(
          [],
          [livePage([{ entity: NOTE_ENTITY, typeUri: "t:NoteDocument", label: "grid chrome" }])],
        ),
      }),
    );
    expect(page.records[0]!.listLabel).toBe("grid chrome");
    expect(page.records[0]!).not.toHaveProperty("title");
    expect(page.records[0]!).not.toHaveProperty("body");
  });

  it("sends the injected Authorization as Bearer and does not reuse another vault's token", async () => {
    const calls: Call[] = [];
    await findLiveNotes(
      deps({ authorization: TOKEN_B, fetch: scriptedFetch(calls, [livePage([])]) }),
    );
    const headers = new Headers(calls[0]!.init.headers);
    expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN_B}`);
    expect(headers.get("Authorization")).not.toBe(`Bearer ${TOKEN_A}`);
  });

  it("addresses host A and vault A, not host B and vault B (fixture varies both keys)", async () => {
    const calls: Call[] = [];
    await findLiveNotes(
      deps({
        host: HOST_A,
        vaultId: VAULT_A,
        fetch: scriptedFetch(calls, [livePage([])]),
      }),
    );
    const posted = calls.map((c) => c.url).join("\n");
    expect(posted).toContain(HOST_A);
    expect(posted).toContain(encodeURIComponent(VAULT_A));
    expect(posted).not.toContain(HOST_B);
    expect(posted).not.toContain(encodeURIComponent(VAULT_B));
  });

  it("moves the GET URL when the injected host and vaultId swap", async () => {
    const callsA: Call[] = [];
    await findLiveNotes(
      deps({ host: HOST_A, vaultId: VAULT_A, fetch: scriptedFetch(callsA, [livePage([])]) }),
    );
    const callsB: Call[] = [];
    await findLiveNotes(
      deps({ host: HOST_B, vaultId: VAULT_B, fetch: scriptedFetch(callsB, [livePage([])]) }),
    );
    expect(callsA[0]!.url).toBe(
      `${HOST_A}/lws/vault/${encodeURIComponent(VAULT_A)}/records?type=NoteDocument`,
    );
    expect(callsB[0]!.url).toBe(
      `${HOST_B}/lws/vault/${encodeURIComponent(VAULT_B)}/records?type=NoteDocument`,
    );
    expect(callsA[0]!.url).not.toBe(callsB[0]!.url);
  });

  it("refuses a missing host without calling fetch", async () => {
    const calls: Call[] = [];
    await expect(
      findLiveNotes(deps({ host: "", fetch: scriptedFetch(calls, [livePage([])]) })),
    ).rejects.toBeInstanceOf(NoteViewError);
    expect(calls).toHaveLength(0);
  });

  it("throws when F-LIVE is refused", async () => {
    await expect(
      findLiveNotes(
        deps({ fetch: scriptedFetch([], [jsonResponse(403, { error: "no grant" })]) }),
      ),
    ).rejects.toMatchObject({ name: "NoteViewError", status: 403 });
  });

  it("does not POST, PUT, PATCH, or DELETE", async () => {
    const calls: Call[] = [];
    await findLiveNotes(deps({ fetch: scriptedFetch(calls, [livePage([])]) }));
    expect(calls[0]!.init.method).toBe("GET");
    expect(calls[0]!.init.body).toBeUndefined();
  });
});

describe("findLiveSentinel — F-LIVE negative control", () => {
  it("GETs ?type=NoSuchTypeHere and keeps 0 rows (not the grid)", async () => {
    const calls: Call[] = [];
    const page = await findLiveSentinel(
      deps({ fetch: scriptedFetch(calls, [livePage([])]) }),
    );
    expect(page.records).toEqual([]);
    const live = new URL(calls[0]!.url);
    expect(live.searchParams.get("type")).toBe("NoSuchTypeHere");
    expect(live.searchParams.get("type")).not.toBe("NoteDocument");
    expect(NOTE_SENTINEL_TYPE_BARE).toBe("NoSuchTypeHere");
  });
});

describe("openNote — F-OPEN known id", () => {
  it("GETs /lws/r/<id> on the injected host and reads a:title + a:body from facts", async () => {
    const calls: Call[] = [];
    const view = await openNote(
      deps({
        fetch: scriptedFetch(calls, [
          jsonResponse(200, {
            "@id": NOTE_ENTITY,
            type: "t:NoteDocument",
            facts: { "a:title": TITLE, "a:body": BODY },
          }),
        ]),
      }),
      NOTE_ID,
    );

    expect(view).toEqual({
      id: NOTE_ID,
      entity: NOTE_ENTITY,
      title: TITLE,
      body: BODY,
    });
    expect(calls).toHaveLength(1);
    expect(calls[0]!.url).toBe(`${HOST_A}/lws/r/${NOTE_ID}`);
    expect(calls[0]!.init.method).toBe("GET");
    expect(NOTE_TITLE_ATTR).toBe("a:title");
    expect(NOTE_BODY_ATTR).toBe("a:body");
  });

  it("reads top-level a:title / a:body and {text} literals without joining to empty", async () => {
    const view = await openNote(
      deps({
        fetch: scriptedFetch(
          [],
          [
            jsonResponse(200, {
              "@id": NOTE_ENTITY,
              "a:title": { text: TITLE },
              "a:body": { text: BODY },
            }),
          ],
        ),
      }),
      NOTE_ID,
    );
    expect(view.title).toBe(TITLE);
    expect(view.body).toBe(BODY);
  });

  it("does not use a:label as the document title", async () => {
    const view = await openNote(
      deps({
        fetch: scriptedFetch(
          [],
          [
            jsonResponse(200, {
              "@id": NOTE_ENTITY,
              facts: {
                "a:label": "term-name homonym",
                "a:title": TITLE,
                "a:body": BODY,
              },
            }),
          ],
        ),
      }),
      NOTE_ID,
    );
    expect(view.title).toBe(TITLE);
    expect(view.title).not.toBe("term-name homonym");
  });

  it("title stays the persist headline when a:label is the only other string", async () => {
    const view = await openNote(
      deps({
        fetch: scriptedFetch(
          [],
          [
            jsonResponse(200, {
              "@id": NOTE_ENTITY,
              facts: { "a:label": "term-name homonym" },
            }),
          ],
        ),
      }),
      NOTE_ID,
    );
    expect(view.title).toBe("");
    expect(view.body).toBeNull();
  });

  it("never computes the id — refuses a blank id without calling fetch", async () => {
    const calls: Call[] = [];
    await expect(
      openNote(deps({ fetch: scriptedFetch(calls, [jsonResponse(200, {})]) }), "  "),
    ).rejects.toBeInstanceOf(NoteViewError);
    expect(calls).toHaveLength(0);
  });

  it("throws when F-OPEN is refused", async () => {
    await expect(
      openNote(
        deps({ fetch: scriptedFetch([], [jsonResponse(404, {})]) }),
        NOTE_ID,
      ),
    ).rejects.toMatchObject({ name: "NoteViewError", status: 404 });
  });

  it("does not POST the opened document back (no read-replace)", async () => {
    const calls: Call[] = [];
    await openNote(
      deps({
        fetch: scriptedFetch(calls, [
          jsonResponse(200, { "@id": NOTE_ENTITY, facts: { "a:title": TITLE } }),
        ]),
      }),
      NOTE_ID,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0]!.init.method).toBe("GET");
    expect(String(calls[0]!.init.method)).not.toBe("PUT");
    expect(String(calls[0]!.init.method)).not.toBe("PATCH");
  });
});

describe("artefact independence and host-agnostic body", () => {
  it("unit source bakes no vault host", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "viewNote.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/gilb\.com/i);
    expect(src).not.toMatch(/localhost/i);
    expect(src).not.toMatch(/127\.0\.0\.1/);
    expect(src).not.toMatch(/veda\./i);
  });

  it("does not import or depend on the note-write artefact", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const viewNote = readFileSync(join(here, "viewNote.ts"), "utf8");
    const index = readFileSync(join(here, "index.ts"), "utf8");
    const hook = readFileSync(join(here, "useViewNote.ts"), "utf8");
    const pkg = JSON.parse(
      readFileSync(join(here, "..", "package.json"), "utf8"),
    ) as {
      dependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    for (const src of [viewNote, index, hook]) {
      expect(src).not.toMatch(/note-write/);
      expect(src).not.toMatch(/writeNote/);
      expect(src).not.toMatch(/gilbplatformcode-note-write/);
    }
    expect(pkg.dependencies ?? {}).not.toHaveProperty(
      "@kaigilb/gilbplatformcode-note-write",
    );
    expect(pkg.peerDependencies ?? {}).not.toHaveProperty(
      "@kaigilb/gilbplatformcode-note-write",
    );
    expect(pkg.devDependencies ?? {}).not.toHaveProperty(
      "@kaigilb/gilbplatformcode-note-write",
    );
  });
});
