// New. `isPublicFolder` on its own, and the sentence for a failure that is not an Error.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as records from "@kaigilb/gilbplatformcode-lws-records";
import { isPublicFolder, publicGrantee, setFolderTreePublic } from "./index";
import { setUp, tearDown } from "../test/support";

vi.mock("@kaigilb/gilbplatformcode-lws-records", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  readRecord: vi.fn(),
}));
vi.mock("./entityShare", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  shareEntity: vi.fn(async () => {
    throw "plain text, not an Error";
  }),
}));

const DOOR = "https://v.platform.example.test/base/e/f1";
const FOLDER_TYPE = "https://platform.example.test/base/t/VirtualFolder";
const NOTE_TYPE = "https://platform.example.test/base/t/NoteDocument";
const rec = (typeUri: string, facts: Record<string, string>) => ({ id: "f1", typeUri, facts, opaqueFacts: [], etag: '"e"' }) as never;

beforeEach(() => {
  setUp();
  vi.mocked(records.readRecord).mockReset();
});
afterEach(() => tearDown());

describe("isPublicFolder", () => {
  it("is false for a record that cannot be read", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(null);
    await expect(isPublicFolder("f1", DOOR)).resolves.toBe(false);
    expect(records.readRecord).toHaveBeenCalledWith("f1", DOOR);
  });
  it("is false for a public record that is not a folder: part-of is a general link, the type of the target decides", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(rec(NOTE_TYPE, { directReader: publicGrantee() }));
    await expect(isPublicFolder("f1", DOOR)).resolves.toBe(false);
  });
  it("is false for a folder nobody has shared with everyone", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(rec(FOLDER_TYPE, { directReader: "https://a.platform.example.test/base" }));
    await expect(isPublicFolder("f1", null)).resolves.toBe(false);
    vi.mocked(records.readRecord).mockResolvedValue(rec(FOLDER_TYPE, {}));
    await expect(isPublicFolder("f1", null)).resolves.toBe(false);
  });
  it("is true for a folder whose readers include the public grantee", async () => {
    vi.mocked(records.readRecord).mockResolvedValue(rec(FOLDER_TYPE, { directReader: `https://a.platform.example.test/base, ${publicGrantee()}` }));
    await expect(isPublicFolder("f1", DOOR)).resolves.toBe(true);
  });
});

describe("setFolderTreePublic", () => {
  it("a refusal that is not an Error is reported as 'failed', and nothing below the folder is tried", async () => {
    const out = await setFolderTreePublic("f1", true, "https://v.platform.example.test/base", DOOR);
    expect(out).toEqual({ folder: false, members: 0, links: 0, failed: ["failed"] });
    expect(records.readRecord).not.toHaveBeenCalled();
  });
});

// ---- found by the mutation checks: two filters of `listFolderPartMembers` the ported shapes never discriminate.
import { listFolderPartMembers } from "./index";

describe("listFolderPartMembers: the filters the ported shapes leave to chance", () => {
  const H = "https://t.platform.example.test/vault";
  const e = (id: string) => `${H}/e/${id}`;
  const r = (id: string) => `${H}/r/${id}`;

  it("a typed row in which the folder is the SOURCE end is not a membership, even when another source is in it", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            relations: [
              {
                relation: r("odd"),
                role: "role:source",
                type: "t:PartOf",
                members: [
                  { member: e("folder"), role: "role:source" },
                  { member: e("other"), role: "role:source" },
                  { member: e("whole"), role: "role:target" },
                ],
              },
              { relation: r("real"), role: "role:target", type: "t:PartOf", members: [{ member: e("kid"), role: "role:source" }, { member: e("folder"), role: "role:target" }] },
            ],
          }),
          { status: 200 },
        ),
      ),
    );
    const out = await listFolderPartMembers("folder", H);
    expect(out.parts.map((p) => p.memberId)).toEqual(["kid"]);
    expect(out.unread).toEqual([]);
    vi.unstubAllGlobals();
  });

  it("an ENDED link is not a membership even when its document still frames both ends", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        const u = String(url);
        if (/\/relations$/.test(u)) return new Response(JSON.stringify({ relations: [{ relation: r("gone"), role: "role:target" }, { relation: r("live"), role: "role:target" }] }), { status: 200 });
        const ended = u.endsWith("/gone");
        return new Response(
          JSON.stringify({
            "@id": u,
            "@type": "t:PartOf",
            "role:source": { "@id": e(ended ? "old" : "kid") },
            "role:target": { "@id": e("folder") },
            ...(ended ? { "a:relationLifecycleState": "ended" } : {}),
          }),
          { status: 200 },
        );
      }),
    );
    const out = await listFolderPartMembers("folder", H);
    expect(out.parts.map((p) => p.memberId)).toEqual(["kid"]);
    vi.unstubAllGlobals();
  });
});
