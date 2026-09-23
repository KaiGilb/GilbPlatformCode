import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  NOTE_BODY_ATTR,
  NOTE_FIND_TYPE_BARE,
  NOTE_TITLE_ATTR,
  NOTE_WRITE_TYPE_PREFIXED,
  NoteWriteError,
  writeNote,
  type NoteWriteDeps,
} from "./writeNote";

const HOST_A = "https://node-a.example.test";
const HOST_B = "https://node-b.example.test";
const VAULT_A = "https://holder-a.example.test/vault";
const VAULT_B = "https://holder-b.example.test/vault";
const TOKEN_A = "token-alpha";
const TOKEN_B = "token-beta";
const TITLE = "Field notes from the stream";
const BODY = "A short body the vault must keep.";
const MINTED_ID = "note-minted-1";

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

function deps(over: Partial<NoteWriteDeps> & { fetch: typeof fetch }): NoteWriteDeps {
  return {
    host: HOST_A,
    vaultId: VAULT_A,
    authorization: TOKEN_A,
    ...over,
  };
}

function okTrip(): Response[] {
  return [
    jsonResponse(201, { "@id": `${HOST_A}/vault/e/${MINTED_ID}` }, {
      location: `/lws/r/${MINTED_ID}`,
    }),
    jsonResponse(200, { "@id": `${HOST_A}/vault/e/${MINTED_ID}` }),
    jsonResponse(200, {
      records: [{ entity: `${HOST_A}/vault/e/${MINTED_ID}`, typeUri: NOTE_WRITE_TYPE_PREFIXED }],
      total: 1,
      complete: true,
    }),
  ];
}

describe("writeNote — W-MINT NoteDocument", () => {
  it("POSTs /lws/vault/<vaultId>/c on the injected host with prefixed type and a:title + a:body", async () => {
    const calls: Call[] = [];
    const result = await writeNote(deps({ fetch: scriptedFetch(calls, okTrip()) }), {
      title: TITLE,
      body: BODY,
    });

    expect(result.id).toBe(MINTED_ID);
    const create = calls[0];
    expect(create).toBeDefined();
    expect(create!.url).toBe(
      `${HOST_A}/lws/vault/${encodeURIComponent(VAULT_A)}/c`,
    );
    expect(create!.init.method).toBe("POST");
    const payload = JSON.parse(String(create!.init.body));
    expect(payload).toEqual({
      type: "t:NoteDocument",
      facts: { "a:title": TITLE, "a:body": BODY },
    });
    expect(payload.facts["a:label"]).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("a:label");
    expect(NOTE_WRITE_TYPE_PREFIXED).toBe("t:NoteDocument");
    expect(NOTE_TITLE_ATTR).toBe("a:title");
    expect(NOTE_BODY_ATTR).toBe("a:body");
  });

  it("omits a:body when the body is empty and never dual-writes a:label", async () => {
    const calls: Call[] = [];
    await writeNote(deps({ fetch: scriptedFetch(calls, okTrip()) }), {
      title: TITLE,
      body: "   ",
    });
    const payload = JSON.parse(String(calls[0]!.init.body));
    expect(payload.facts).toEqual({ "a:title": TITLE });
    expect(Object.keys(payload.facts)).not.toContain("a:label");
    expect(Object.keys(payload.facts)).not.toContain("a:body");
  });

  it("sends the injected Authorization as Bearer and does not reuse another vault's token", async () => {
    const calls: Call[] = [];
    await writeNote(
      deps({ authorization: TOKEN_B, fetch: scriptedFetch(calls, okTrip()) }),
      { title: TITLE, body: BODY },
    );
    for (const call of calls) {
      const headers = new Headers(call.init.headers);
      expect(headers.get("Authorization")).toBe(`Bearer ${TOKEN_B}`);
      expect(headers.get("Authorization")).not.toBe(`Bearer ${TOKEN_A}`);
    }
  });

  it("pairs the mint with F-OPEN of the minted id and F-LIVE ?type=NoteDocument (bare)", async () => {
    const calls: Call[] = [];
    await writeNote(deps({ fetch: scriptedFetch(calls, okTrip()) }), {
      title: TITLE,
      body: BODY,
    });
    expect(calls).toHaveLength(3);
    expect(calls[1]!.url).toBe(`${HOST_A}/lws/r/${MINTED_ID}`);
    expect(calls[1]!.init.method).toBe("GET");
    const live = new URL(calls[2]!.url);
    expect(live.origin).toBe(HOST_A);
    expect(live.pathname).toBe(`/lws/vault/${encodeURIComponent(VAULT_A)}/records`);
    expect(live.searchParams.get("type")).toBe("NoteDocument");
    expect(live.searchParams.get("type")).not.toBe("t:NoteDocument");
    expect(NOTE_FIND_TYPE_BARE).toBe("NoteDocument");
    expect(calls[2]!.url).not.toContain("type=t%3A");
  });

  it("addresses host A and vault A, not host B and vault B (fixture varies both keys)", async () => {
    const calls: Call[] = [];
    await writeNote(
      deps({
        host: HOST_A,
        vaultId: VAULT_A,
        fetch: scriptedFetch(calls, okTrip()),
      }),
      { title: TITLE },
    );
    const posted = calls.map((c) => c.url).join("\n");
    expect(posted).toContain(HOST_A);
    expect(posted).toContain(encodeURIComponent(VAULT_A));
    expect(posted).not.toContain(HOST_B);
    expect(posted).not.toContain(encodeURIComponent(VAULT_B));
  });

  it("moves the POST URL when the injected host and vaultId swap", async () => {
    const callsA: Call[] = [];
    await writeNote(
      deps({ host: HOST_A, vaultId: VAULT_A, fetch: scriptedFetch(callsA, okTrip()) }),
      { title: TITLE },
    );
    const callsB: Call[] = [];
    await writeNote(
      deps({
        host: HOST_B,
        vaultId: VAULT_B,
        fetch: scriptedFetch(callsB, [
          jsonResponse(201, {}, { location: `/lws/r/${MINTED_ID}` }),
          jsonResponse(200, {}),
          jsonResponse(200, { records: [], total: 0, complete: true }),
        ]),
      }),
      { title: TITLE },
    );
    expect(callsA[0]!.url).toBe(`${HOST_A}/lws/vault/${encodeURIComponent(VAULT_A)}/c`);
    expect(callsB[0]!.url).toBe(`${HOST_B}/lws/vault/${encodeURIComponent(VAULT_B)}/c`);
    expect(callsA[0]!.url).not.toBe(callsB[0]!.url);
  });

  it("refuses a missing title without calling fetch", async () => {
    const calls: Call[] = [];
    await expect(
      writeNote(deps({ fetch: scriptedFetch(calls, okTrip()) }), { title: "  " }),
    ).rejects.toBeInstanceOf(NoteWriteError);
    expect(calls).toHaveLength(0);
  });

  it("refuses a missing host without calling fetch", async () => {
    const calls: Call[] = [];
    await expect(
      writeNote(deps({ host: "", fetch: scriptedFetch(calls, okTrip()) }), { title: TITLE }),
    ).rejects.toBeInstanceOf(NoteWriteError);
    expect(calls).toHaveLength(0);
  });

  it("throws when W-MINT is refused", async () => {
    const calls: Call[] = [];
    await expect(
      writeNote(
        deps({ fetch: scriptedFetch(calls, [jsonResponse(403, { error: "no grant" })]) }),
        { title: TITLE },
      ),
    ).rejects.toMatchObject({ name: "NoteWriteError", status: 403 });
  });

  it("throws when F-OPEN of the minted id is refused", async () => {
    await expect(
      writeNote(
        deps({
          fetch: scriptedFetch(
            [],
            [
              jsonResponse(201, {}, { location: `/lws/r/${MINTED_ID}` }),
              jsonResponse(404, {}),
            ],
          ),
        }),
        { title: TITLE },
      ),
    ).rejects.toMatchObject({ name: "NoteWriteError", status: 404 });
  });

  it("unit source bakes no vault host", () => {
    const src = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), "writeNote.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/gilb\.com/i);
    expect(src).not.toMatch(/localhost/i);
    expect(src).not.toMatch(/127\.0\.0\.1/);
    expect(src).not.toMatch(/veda\./i);
  });
});
