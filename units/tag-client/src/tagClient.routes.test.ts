// The typed clients of the platform's tag routes. Each sends the EXACT body and parses the EXACT answer of the routes as
// the platform serves them (`test/platformFixture.ts`). A platform without the routes is a hard NoTagRoutesError.
import { describe, expect, it } from "vitest";
import { PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { TagStringRefusedError } from "@kaigilb/gilbplatformcode-tag-grammar";
import {
  addTag,
  ensureMasterTag,
  isRouteMissing,
  makeMainTag,
  MASTERS_BATCH_MAX,
  NoTagRoutesError,
  readMainTags,
  readMasterTag,
  readTags,
  removeTag,
  TagRoleDerivedError,
  TagTakenError,
} from "./tagClient";
import { fixturePlatform, type FixturePlatform } from "../test/platformFixture";


const VAULT = "https://home.example.test/vault";
const AGENT = "https://home.example.test/vault/e/app-example";

function world(tags?: "auto" | "ensure-only" | "off"): { p: FixturePlatform; platform: PlatformClient; rec: (name: string) => Promise<string> } {
  const p = fixturePlatform({ origin: new URL(VAULT).origin, ...(tags ? { tags } : {}) });
  p.reach.add(VAULT);
  // A record made through the create door, so the fixture's platform gives it its master tag (as the real one does); `ensure-only` and `off` mint none.
  const rec = async (name: string): Promise<string> => {
    const res = await p.fetch(`${p.origin}/lws/vault/${encodeURIComponent(VAULT)}/c`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ type: "t:Person", facts: { "a:name": name } }),
    });
    const loc = ((await res.json()) as { "@id": string })["@id"];
    return loc.replace("/lws/r/", "/base/e/");
  };
  return { p, platform: { origin: p.origin, fetch: p.fetch }, rec };
}
const last = (p: FixturePlatform, path: string) => p.requests.filter((r) => r.path === path).at(-1)!;

describe("readMasterTag — GET /base/tag/master?targetEntity=", () => {
  it("answers the master when the platform knows it, and sends targetEntity (⛔ not entity)", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    const h = p.handlesOf(r)[0]!;
    expect(await readMasterTag(platform, r)).toEqual({ status: "master", tag: "ann-lee", tagHandle: h.id });
    const sent = new URL(last(p, "/base/tag/master").url);
    expect(sent.searchParams.get("targetEntity")).toBe(r);
    expect(sent.searchParams.has("entity")).toBe(false);
  });

  it("tagKnown:false is told by its reason: none, anomaly, hidden — and anomaly is never read as a tag or as none", async () => {
    const { p, platform, rec } = world("ensure-only");
    const none = await rec("None");
    expect(await readMasterTag(platform, none)).toEqual({ status: "unknown", reason: "none" });
    const two = await rec("Two");
    p.seedTag(VAULT, "a", two, "master");
    p.seedTag(VAULT, "b", two, "master");
    expect(await readMasterTag(platform, two)).toEqual({ status: "unknown", reason: "anomaly" });
    p.failNext("GET", "/base/tag/master", 200, { tagKnown: false, tagUnknownReason: "hidden" });
    expect(await readMasterTag(platform, two)).toEqual({ status: "unknown", reason: "hidden" });
  });

  it("the non-disclosing 404 of an unreadable record is `unreadable`, and an answer of neither shape is `unreadable` too", async () => {
    const { p, platform } = world();
    expect(await readMasterTag(platform, `${VAULT.replace("/vault", "")}/base/e/nothere`)).toEqual({ status: "unreadable" });
    p.failNext("GET", "/base/tag/master", 200, { none: true });
    expect(await readMasterTag(platform, "https://holder.example.test/base/e/x0001")).toEqual({ status: "unreadable" });
  });

  it("a platform without the route is a NoTagRoutesError (a PlatformError), not an unreadable record", async () => {
    const { platform, rec } = world("off");
    const err = await readMasterTag(platform, await rec("Ann")).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(NoTagRoutesError);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as Error).message).toBe("This platform does not make tags yet");
  });

  it("Fastify's own 404 is told from an entity 404 by the message, not by the status", () => {
    expect(isRouteMissing({ status: 404, json: { message: "Route GET:/base/tag/master not found" }, text: "" })).toBe(true);
    expect(isRouteMissing({ status: 404, json: { error: "NotFound", message: "No resource at x" }, text: "" })).toBe(false);
    expect(isRouteMissing({ status: 200, json: { message: "Route GET:/x not found" }, text: "" })).toBe(false);
  });
});

describe("ensureMasterTag — POST /base/tag/ensure", () => {
  it("sends exactly {targetEntity, agent} and parses {tagHandle, tagString, tagRole, changed}", async () => {
    const { p, platform, rec } = world("ensure-only");
    const r = await rec("Ann Lee");
    const made = await ensureMasterTag(platform, r, AGENT);
    expect(last(p, "/base/tag/ensure").body).toEqual({ targetEntity: r, agent: AGENT });
    expect(made).toEqual({ tagHandle: p.handlesOf(r)[0]!.id, tagString: "ann-lee", tagRole: "master", changed: true });
    // A record that has its master: the platform answers changed:false, and the same tag.
    expect(await ensureMasterTag(platform, r, AGENT)).toMatchObject({ tagString: "ann-lee", changed: false });
    expect(p.handlesOf(r)).toHaveLength(1);
  });

  it("a 403 is the caller's and is thrown (⛔ never swallowed); a missing route is a NoTagRoutesError", async () => {
    const { p, platform, rec } = world("ensure-only");
    const r = await rec("Ann");
    p.failNext("POST", "/base/tag/ensure", 403, { error: "WriteForbiddenError" });
    const err = await ensureMasterTag(platform, r, AGENT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformError).status).toBe(403);
    const off = world("off");
    expect(await ensureMasterTag(off.platform, await off.rec("x"), AGENT).catch((e: unknown) => e)).toBeInstanceOf(NoTagRoutesError);
  });
});

describe("readTags — GET /base/tag/list?targetEntity=", () => {
  it("parses {tagHandles:[{tagHandle, tagString, tagRole, tagOrigin}]} and sends targetEntity", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    const alt = p.seedTag(VAULT, "annie", r, "alt");
    const master = p.handlesOf(r).find((h) => h.facts["a:tagRole"] === "master")!;
    const tags = await readTags(platform, r);
    expect(new URL(last(p, "/base/tag/list").url).searchParams.get("targetEntity")).toBe(r);
    expect(tags).toEqual([
      { tagHandle: master.id, tagString: "ann-lee", tagRole: "master", tagOrigin: "registered" },
      { tagHandle: alt, tagString: "annie", tagRole: "alt", tagOrigin: "registered" },
    ]);
  });

  it("an answer with no tagHandles list is a PlatformError (⛔ never an empty list)", async () => {
    const { p, platform, rec } = world();
    p.failNext("GET", "/base/tag/list", 200, { handles: [] });
    await expect(readTags(platform, await rec("Ann"))).rejects.toBeInstanceOf(PlatformError);
  });
});

describe("addTag — POST /base/tag/handle, role alt", () => {
  it("sends exactly {tagString, tagRole: alt, targetEntity, agent}; the record then lists it as an alt, and its master is unchanged", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    expect(await addTag(platform, r, "annie", AGENT)).toEqual({ tag: "annie", changed: true });
    expect(last(p, "/base/tag/handle").body).toEqual({ tagString: "annie", tagRole: "alt", targetEntity: r, agent: AGENT });
    const roles = (await readTags(platform, r)).map((t) => [t.tagString, t.tagRole]);
    expect(roles).toEqual(expect.arrayContaining([["ann-lee", "master"], ["annie", "alt"]]));
  });

  it("a collision with another record's tag is a TagTakenError; the platform's 400 is a TagStringRefusedError with its number", async () => {
    const { p, platform, rec } = world();
    const a = await rec("Ann");
    const b = await rec("Ben");
    await addTag(platform, a, "shared", AGENT);
    const taken = await addTag(platform, b, "shared", AGENT).catch((e: unknown) => e);
    expect(taken).toBeInstanceOf(TagTakenError);
    p.failNext("POST", "/base/tag/handle", 400, { error: "tag-string-refused", reason: "too-long", rule: "https://ontology.platform.example.test/base/e/rule", maxCharacters: 12 });
    const refused = await addTag(platform, b, "x", AGENT).catch((e: unknown) => e);
    expect(refused).toBeInstanceOf(TagStringRefusedError);
    expect(refused).toMatchObject({ reason: "too-long", maxCharacters: 12 });
  });
});

describe("makeMainTag — POST /base/tag/reassign-master", () => {
  it("sends exactly {targetEntity, tagString, agent} to reassign-master (⛔ not the attach body); the alt becomes the main and the old main an alt", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    await addTag(platform, r, "annie", AGENT);
    expect(await makeMainTag(platform, r, "annie", AGENT)).toEqual({ changed: true });
    expect(last(p, "/base/tag/reassign-master").body).toEqual({ targetEntity: r, tagString: "annie", agent: AGENT });
    expect(p.count("POST", "/base/tag/handle")).toBe(1); // the add only
    expect(await readMasterTag(platform, r)).toMatchObject({ status: "master", tag: "annie" });
  });

  it("a record whose master is assigned answers 409 TagRoleDerived, which is a TagRoleDerivedError", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Plan");
    p.handlesOf(r)[0]!.facts["a:tagOrigin"] = "assigned";
    await addTag(platform, r, "other", AGENT);
    await expect(makeMainTag(platform, r, "other", AGENT)).rejects.toBeInstanceOf(TagRoleDerivedError);
  });
});

describe("removeTag — POST /base/tag/remove", () => {
  it("sends exactly {targetEntity, tagString, agent} to /base/tag/remove (⛔ not /handle), parses {changed, tagString}, and frees the string", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    await addTag(platform, r, "annie", AGENT);
    expect(await removeTag(platform, r, "annie", AGENT)).toEqual({ changed: true, tagString: "annie" });
    expect(last(p, "/base/tag/remove").body).toEqual({ targetEntity: r, tagString: "annie", agent: AGENT });
    expect(p.count("POST", "/base/tag/handle")).toBe(1);
    // The string is free again for another record.
    await expect(addTag(platform, await rec("Other"), "annie", AGENT)).resolves.toMatchObject({ tag: "annie" });
  });

  it("the master is refused by the platform (409): a PlatformError saying so, and the master stays", async () => {
    const { p, platform, rec } = world();
    const r = await rec("Ann Lee");
    const err = await removeTag(platform, r, "ann-lee", AGENT).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as PlatformError).status).toBe(409);
    expect(p.handlesOf(r)).toHaveLength(1);
  });
});

describe("readMainTags — POST /base/tag/masters, in chunks of 50", () => {
  it("120 records are 3 calls (50, 50, 20), each with {vault, targetEntities}; the answers are joined", async () => {
    const { p, platform, rec } = world();
    const records: string[] = [];
    for (let i = 0; i < 120; i++) records.push(await rec(`Person ${i}`));
    const got = await readMainTags(platform, VAULT, records);
    const calls = p.requests.filter((r) => r.path === "/base/tag/masters");
    expect(calls).toHaveLength(3);
    expect(calls.map((c) => (c.body!.targetEntities as string[]).length)).toEqual([50, 50, 20]);
    expect(calls.every((c) => c.body!.vault === VAULT && Object.keys(c.body!).sort().join() === "targetEntities,vault")).toBe(true);
    expect(MASTERS_BATCH_MAX).toBe(50);
    expect(got.size).toBe(120);
    expect(got.get(records[0]!)).toEqual({ tag: "person-0", known: true });
    expect(got.get(records[119]!)).toEqual({ tag: "person-119", known: true });
  });

  it("tagKnown:false carries its reason; an empty list makes no call; a platform without the route is a NoTagRoutesError", async () => {
    const { p, platform, rec } = world("ensure-only");
    const r = await rec("No tag");
    expect((await readMainTags(platform, VAULT, [r])).get(r)).toEqual({ tag: null, known: false, reason: "none" });
    p.requests.length = 0;
    expect((await readMainTags(platform, VAULT, [])).size).toBe(0);
    expect(p.requests).toHaveLength(0);
    const off = world("off");
    await expect(readMainTags(off.platform, VAULT, [await off.rec("x")])).rejects.toBeInstanceOf(NoTagRoutesError);
  });
});
