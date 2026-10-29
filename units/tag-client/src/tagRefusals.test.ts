// The test platform answers a tag refusal EXACTLY as the real one: status, `error` and `message`.
// These tests pin that contract through the typed clients, and through a raw POST where the client would never send the string.
import { describe, expect, it } from "vitest";
import { PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { TagStringRefusedError } from "@kaigilb/gilbplatformcode-tag-grammar";
import { addTag, makeMainTag, readMainTags, removeTag, TagRoleDerivedError } from "./tagClient";
import { fixturePlatform, type FixturePlatform } from "../test/platformFixture";


const VAULT = "https://home.example.test/vault";
const AGENT = "https://home.example.test/vault/e/app-example";

function world(): { p: FixturePlatform; platform: PlatformClient; rec: (name: string) => Promise<string> } {
  const p = fixturePlatform({ origin: new URL(VAULT).origin });
  p.reach.add(VAULT);
  const rec = async (name: string): Promise<string> => {
    const res = await p.fetch(`${p.origin}/lws/vault/${encodeURIComponent(VAULT)}/c`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "t:Person", facts: { "a:name": name } }),
    });
    return ((await res.json()) as { "@id": string })["@id"].replace("/lws/r/", "/base/e/");
  };
  return { p, platform: { origin: p.origin, fetch: p.fetch }, rec };
}

const post = async (p: FixturePlatform, path: string, body: unknown) => {
  const res = await p.fetch(`${p.origin}${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: res.status, json: (await res.json()) as Record<string, unknown> };
};

/** What a PlatformError carries of the platform's answer. */
const answerOf = (e: unknown): { status: number; json: Record<string, unknown> } => {
  expect(e).toBeInstanceOf(PlatformError);
  const err = e as PlatformError;
  return { status: err.status, json: JSON.parse(err.body) as Record<string, unknown> };
};

describe("POST /base/tag/remove refusals, as the real platform answers them", () => {
  it("the master: 409 TagIsMasterError, and the client surfaces 'Make another tag main first.'", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    const err = await removeTag(platform, r, "ann-lee", AGENT).catch((e: unknown) => e);
    expect(answerOf(err)).toEqual({ status: 409, json: { error: "TagIsMasterError", message: "Make another tag main first." } });
    expect((err as PlatformError).message).toContain("Make another tag main first.");
    expect(p.handlesOf(r)).toHaveLength(1);
  });

  it("an assigned tag: 409 TagRoleDerivedError with the platform's sentence", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Plan");
    await addTag(platform, r, "carrier", AGENT);
    p.handlesOf(r).find((h) => h.facts["a:tagString"] === "carrier")!.facts["a:tagOrigin"] = "assigned";
    const err = await removeTag(platform, r, "carrier", AGENT).catch((e: unknown) => e);
    expect(answerOf(err)).toEqual({
      status: 409,
      json: {
        error: "TagRoleDerivedError",
        message: `tagString 'carrier' is an ASSIGNED TagHandle for ${r} - it follows the entity's carrier attribute and is removed by nobody. Change the carrier fact instead.`,
      },
    });
    expect((err as PlatformError).message).toContain("is an ASSIGNED TagHandle");
    expect(p.handlesOf(r)).toHaveLength(2);
  });

  it("an assigned MASTER is TagRoleDerivedError, not TagIsMasterError (the platform checks assigned first)", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Plan");
    p.handlesOf(r)[0]!.facts["a:tagOrigin"] = "assigned";
    const err = await removeTag(platform, r, "plan", AGENT).catch((e: unknown) => e);
    expect(answerOf(err).json.error).toBe("TagRoleDerivedError");
  });

  it("a string that is not a tag of the record, a missing record and an unreadable one are ONE 404 'No resource at <targetEntity>'", async () => {
    const { p, platform, rec } = world();
    const a = await rec("Ann");
    const b = await rec("Ben");
    const notMine = await removeTag(platform, a, "ben", AGENT).catch((e: unknown) => e); // ben is Ben's tag
    expect(answerOf(notMine)).toEqual({ status: 404, json: { error: "NotFound", message: `No resource at ${a}` } });
    const missingRec = `${b}-nope`;
    const missing = await removeTag(platform, missingRec, "ben", AGENT).catch((e: unknown) => e);
    expect(answerOf(missing)).toEqual({ status: 404, json: { error: "NotFound", message: `No resource at ${missingRec}` } });
    p.reach.delete(VAULT); // the caller can no longer read the record
    const unreadable = await removeTag(platform, b, "ben", AGENT).catch((e: unknown) => e);
    expect(answerOf(unreadable)).toEqual({ status: 404, json: { error: "NotFound", message: `No resource at ${b}` } });
  });

  it("the client has no branch of its own for a 409: it is a PlatformError with the platform's own text (not swallowed)", async () => {
    const { platform, rec } = world();
    const r = await rec("Home");
    await expect(removeTag(platform, r, "home", AGENT)).rejects.toMatchObject({ status: 409 });
  });
});

describe("POST /base/tag/reassign-master refusals, as the real platform answers them", () => {
  it("the new main is assigned: 409 TagRoleDerivedError (a TagRoleDerivedError of the client)", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Plan");
    await addTag(platform, r, "carrier", AGENT);
    p.handlesOf(r).find((h) => h.facts["a:tagString"] === "carrier")!.facts["a:tagOrigin"] = "assigned";
    await expect(makeMainTag(platform, r, "carrier", AGENT)).rejects.toBeInstanceOf(TagRoleDerivedError);
    const raw = await post(p, "/base/tag/reassign-master", { targetEntity: r, tagString: "carrier", agent: AGENT });
    expect(raw.status).toBe(409);
    expect(raw.json.error).toBe("TagRoleDerivedError");
    expect(String(raw.json.message)).toContain("is an ASSIGNED TagHandle");
  });

  it("the demoted main is assigned: 409 TagRoleDerivedError; a string the record does not hold: 400 InvalidDatomError", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Plan");
    p.handlesOf(r)[0]!.facts["a:tagOrigin"] = "assigned";
    await addTag(platform, r, "other", AGENT);
    const raw = await post(p, "/base/tag/reassign-master", { targetEntity: r, tagString: "other", agent: AGENT });
    expect(raw.status).toBe(409);
    expect(String(raw.json.message)).toContain("may not be demoted by a re-assignment");
    const none = await post(p, "/base/tag/reassign-master", { targetEntity: r, tagString: "ghost", agent: AGENT });
    expect(none.status).toBe(400);
    expect(none.json.error).toBe("InvalidDatomError");
  });
});

describe("a padded or invisible NEW tag string is REFUSED by the platform, never trimmed", () => {
  it("raw POST /base/tag/handle: leading or trailing space is 400 tag-string-refused white-space; a BOM is invisible-or-control; nothing is stored", async () => {
    const { p, rec } = world();
    const r = await rec("Ann");
    for (const [tagString, reason] of [[" pad", "white-space"], ["pad ", "white-space"], ["﻿pad", "invisible-or-control"], ["pad​", "invisible-or-control"], ["", "empty"], ["a@b", "at-sign"]] as const) {
      const res = await post(p, "/base/tag/handle", { tagString, tagRole: "alt", targetEntity: r, agent: AGENT });
      expect(res.status, JSON.stringify(tagString)).toBe(400);
      expect(res.json).toMatchObject({ error: "tag-string-refused", reason });
      expect(typeof res.json.rule).toBe("string");
      expect(Object.keys(res.json).sort()).toEqual(["error", "reason", "rule"]); // exactly these keys: no `message`
    }
    expect(p.handlesOf(r)).toHaveLength(1); // only the master
    const ok = await post(p, "/base/tag/handle", { tagString: "pad", tagRole: "alt", targetEntity: r, agent: AGENT });
    expect(ok.status).toBe(201);
  });

  it("the string over 64 characters is 400 too-long carrying maxCharacters 64", async () => {
    const { p, rec } = world();
    const r = await rec("Ann");
    const res = await post(p, "/base/tag/handle", { tagString: "x".repeat(65), tagRole: "alt", targetEntity: r, agent: AGENT });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ error: "tag-string-refused", reason: "too-long", maxCharacters: 64 });
  });

  it("the client SURFACES the platform's refusal (a TagStringRefusedError with its reason) when it did not refuse first", async () => {
    const { platform, rec } = world();
    const r = await rec("Ann");
    // No rule and no grammar are given, so the client's own check does not run; the inner space reaches the platform.
    const err = await addTag(platform, r, "in ner", AGENT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({ reason: "white-space" });
  });

  it("what the CLIENT does with a padded string today: it trims what it was given before it sends (`newTagString` in tagClient.ts), so a padded string never reaches the platform from addTag", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann");
    expect(await addTag(platform, r, "  padded  ", AGENT)).toEqual({ tag: "padded", changed: true });
    expect(p.requests.filter((q) => q.path === "/base/tag/handle").at(-1)!.body!.tagString).toBe("padded");
  });
});

describe("POST /base/tag/masters, as the real platform answers it", () => {
  it("a missing, an unreadable and an other-vault record are the one row {tagString:null, tagKnown:false, tagUnknownReason:'none'}", async () => {
    const { p, platform, rec } = world();
    const mine = await rec("Mine");
    const other = "https://home.example.test/other/e/z0001";
    const got = await readMainTags(platform, VAULT, [mine, `${mine}-nope`, other]);
    expect(got.get(mine)).toEqual({ tag: "mine", known: true });
    expect(got.get(`${mine}-nope`)).toEqual({ tag: null, known: false, reason: "none" });
    expect(got.get(other)).toEqual({ tag: null, known: false, reason: "none" });
    const raw = await post(p, "/base/tag/masters", { vault: VAULT, targetEntities: [`${mine}-nope`] });
    expect(raw.json.masterTags).toEqual([{ targetEntity: `${mine}-nope`, tagString: null, tagKnown: false, tagUnknownReason: "none" }]);
  });

  it("an empty list and more than 50 are 400 BadRequest with the platform's sentences", async () => {
    const { p } = world();
    expect(await post(p, "/base/tag/masters", { vault: VAULT, targetEntities: [] })).toEqual({
      status: 400,
      json: { error: "BadRequest", message: "declare `targetEntities`: a list of 1 to 50 record addresses" },
    });
    expect(await post(p, "/base/tag/masters", { vault: VAULT, targetEntities: Array.from({ length: 51 }, (_, i) => `${VAULT}/e/r${i}`) })).toEqual({
      status: 400,
      json: { error: "BadRequest", message: "ask for at most 50 records in one call" },
    });
  });
});
