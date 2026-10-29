// Pins for what the typed calls do at their edges and the two errors they throw, over a fake fetch (no network).
import { describe, expect, it } from "vitest";
import { PlatformError, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";
import { TagStringRefusedError, type TagGrammar, type TagWriteRule } from "@kaigilb/gilbplatformcode-tag-grammar";
import { addTag, ensureMasterTag, makeMainTag, readMasterTag, readTags, removeTag, TagRoleDerivedError, TagTakenError } from "./tagClient";

const ORIGIN = "https://holder.platform.example.test";
const REC = `${ORIGIN}/vault/e/r1`;
const AGENT = `${ORIGIN}/vault/e/app-example`;

type Reply = { status?: number; body?: unknown; text?: string };
function world(reply: Reply | ((n: number) => Reply)) {
  const sent: { url: string; method: string; body: Record<string, unknown> | null }[] = [];
  const platform: PlatformClient = {
    origin: ORIGIN,
    fetch: async (url, init) => {
      sent.push({ url, method: String(init?.method), body: init?.body ? (JSON.parse(String(init.body)) as Record<string, unknown>) : null });
      const r = typeof reply === "function" ? reply(sent.length) : reply;
      const text = r.text ?? (r.body === undefined ? "" : JSON.stringify(r.body));
      return new Response(text === "" ? null : text, { status: r.status ?? 200 });
    },
  };
  return { platform, sent };
}
const thrown = async (p: Promise<unknown>): Promise<unknown> => p.then(() => { throw new Error("did not throw"); }, (e: unknown) => e);

const grammar: TagGrammar = (() => {
  const lead = { position: 0, label: "lead", pattern: "^$", optional: true };
  const tag = { position: 1, label: "tag", pattern: "[^@]+", optional: false };
  const vaultName = { position: 2, label: "vault-name", pattern: "[a-z0-9]+", optional: false };
  return { standard: "https://ontology.platform.example.test/base/e/tag-standard", separator: "@", segments: [lead, tag, vaultName], tag, vaultName };
})();
const rule: TagWriteRule = {
  iri: "https://ontology.platform.example.test/base/e/rule",
  pattern: /^[a-z]{1,10}$/u,
  maxCharacters: 10,
  singleScript: true,
  statement: "",
};

describe("the errors", () => {
  it("TagTakenError names the tag and says it is used in the vault", () => {
    const e = new TagTakenError("ann");
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("TagTakenError");
    expect(e.tag).toBe("ann");
    expect(e.message).toBe('the tag "ann" is already used in this vault');
  });

  it("TagRoleDerivedError has a default sentence and takes another", () => {
    expect(new TagRoleDerivedError().name).toBe("TagRoleDerivedError");
    expect(new TagRoleDerivedError().message).toBe("the main tag follows a field of this record and cannot be changed here");
    expect(new TagRoleDerivedError("x").message).toBe("x");
  });
});

describe("readMasterTag: the edges", () => {
  it("a known master with an empty tag string or an empty handle is unreadable, not a master", async () => {
    expect(await readMasterTag(world({ body: { tagKnown: true, tagHandle: "h", tagString: "" } }).platform, REC)).toEqual({ status: "unreadable" });
    expect(await readMasterTag(world({ body: { tagKnown: true, tagHandle: "", tagString: "ann" } }).platform, REC)).toEqual({ status: "unreadable" });
  });

  it("tagKnown:false with a reason that is not one of the three is unreadable", async () => {
    expect(await readMasterTag(world({ body: { tagKnown: false, tagUnknownReason: "other" } }).platform, REC)).toEqual({ status: "unreadable" });
  });

  it("sends a GET to base/tag/master with the record encoded in targetEntity", async () => {
    const w = world({ body: { tagKnown: true, tagHandle: "h", tagString: "ann" } });
    await readMasterTag(w.platform, `${REC}?a=b&c`);
    expect(w.sent[0]!.method).toBe("GET");
    expect(w.sent[0]!.url).toBe(`${ORIGIN}/base/tag/master?targetEntity=${encodeURIComponent(`${REC}?a=b&c`)}`);
  });

  it("any status but 200 and 404 is a PlatformError", async () => {
    expect(await thrown(readMasterTag(world({ status: 500, text: "boom" }).platform, REC))).toBeInstanceOf(PlatformError);
  });
});

describe("ensureMasterTag: the edges", () => {
  it("an answer with no tag handle or no tag string is a PlatformError that says no tag was named", async () => {
    const err = await thrown(ensureMasterTag(world({ body: { tagString: "ann" } }).platform, REC, AGENT));
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as Error).message).toContain("named no tag");
  });

  it("tagRole defaults to master and changed is true only for true", async () => {
    const got = await ensureMasterTag(world({ body: { tagHandle: "h", tagString: "ann", changed: "yes" } }).platform, REC, AGENT);
    expect(got).toEqual({ tagHandle: "h", tagString: "ann", tagRole: "master", changed: false });
    const alt = await ensureMasterTag(world({ status: 201, body: { tagHandle: "h", tagString: "ann", tagRole: "alt", changed: true } }).platform, REC, AGENT);
    expect(alt).toEqual({ tagHandle: "h", tagString: "ann", tagRole: "alt", changed: true });
  });
});

describe("readTags: the edges", () => {
  it("skips a row that lacks a handle or a string or has a role outside the three, and defaults the origin to registered", async () => {
    const w = world({
      body: {
        tagHandles: [
          { tagHandle: "h1", tagString: "a", tagRole: "master", tagOrigin: "assigned" },
          { tagHandle: "h2", tagString: "b", tagRole: "alt", tagOrigin: "other" },
          { tagHandle: "h3", tagString: "c", tagRole: "hidden" },
          { tagHandle: "h4", tagString: "d", tagRole: "boss", tagOrigin: "assigned" },
          { tagHandle: 5, tagString: "e", tagRole: "alt" },
          { tagHandle: "h6", tagRole: "alt" },
          null,
        ],
      },
    });
    expect(await readTags(w.platform, REC)).toEqual([
      { tagHandle: "h1", tagString: "a", tagRole: "master", tagOrigin: "assigned" },
      { tagHandle: "h2", tagString: "b", tagRole: "alt", tagOrigin: "registered" },
      { tagHandle: "h3", tagString: "c", tagRole: "hidden", tagOrigin: "registered" },
    ]);
  });
});

describe("addTag: the edges", () => {
  it("with no rule and no grammar it trims and normalises (NFC) what it was given, and refuses text that is empty or not text", async () => {
    const w = world({ status: 201, body: { changed: true } });
    expect(await addTag(w.platform, REC, "  José  ", AGENT)).toEqual({ tag: "José", changed: true });
    expect(w.sent[0]!.body).toEqual({ tagString: "José", tagRole: "alt", targetEntity: REC, agent: AGENT });
    expect(await thrown(addTag(w.platform, REC, "   ", AGENT))).toBeInstanceOf(TypeError);
    expect(await thrown(addTag(w.platform, REC, 5 as unknown as string, AGENT))).toBeInstanceOf(TypeError);
    expect(w.sent).toHaveLength(1);
  });

  it("changed is true for a 201, or a 200 that says changed: true, and false for a 200 that says nothing", async () => {
    expect((await addTag(world({ status: 201, body: {} }).platform, REC, "ann", AGENT)).changed).toBe(true);
    expect((await addTag(world({ status: 200, body: { changed: true } }).platform, REC, "ann", AGENT)).changed).toBe(true);
    expect((await addTag(world({ status: 200, body: { changed: false } }).platform, REC, "ann", AGENT)).changed).toBe(false);
    expect((await addTag(world({ status: 200, body: {} }).platform, REC, "ann", AGENT)).changed).toBe(false);
  });

  it("with a grammar alone it applies the grammar (text holding the separator is refused before a request)", async () => {
    const w = world({ status: 201, body: {} });
    expect(await thrown(addTag(w.platform, REC, "a@b", AGENT, { grammar }))).toMatchObject({ name: "TagRefusedError", reason: "pattern" });
    expect(w.sent).toHaveLength(0);
    expect(await addTag(w.platform, REC, " ann ", AGENT, { grammar })).toEqual({ tag: "ann", changed: true });
  });

  it("with a rule alone it applies the rule and answers the rule's normalised string; a refusal carries the rule's number", async () => {
    const w = world({ status: 201, body: {} });
    expect(await addTag(w.platform, REC, " ann ", AGENT, { rule })).toEqual({ tag: "ann", changed: true });
    const err = await thrown(addTag(w.platform, REC, "x".repeat(11), AGENT, { rule }));
    expect(err).toBeInstanceOf(TagStringRefusedError);
    expect(err).toMatchObject({ reason: "too-long", rule: rule.iri, maxCharacters: 10 });
    expect(w.sent).toHaveLength(1);
  });

  it("with both, the rule speaks first: a string the rule refuses never reaches the grammar", async () => {
    const w = world({ status: 201, body: {} });
    expect(await thrown(addTag(w.platform, REC, "a b", AGENT, { rule, grammar }))).toMatchObject({ name: "TagStringRefusedError", reason: "white-space" });
    expect(w.sent).toHaveLength(0);
  });

  it("a 400 tag-string-refused that lacks a known reason or a rule address is a plain PlatformError, and a negative or fractional number is dropped", async () => {
    const odd = (body: unknown) => thrown(addTag(world({ status: 400, body }).platform, REC, "ann", AGENT));
    expect(await odd({ error: "tag-string-refused", reason: "nope", rule: "r" })).toBeInstanceOf(PlatformError);
    expect(await odd({ error: "tag-string-refused", reason: "too-long", rule: "" })).toBeInstanceOf(PlatformError);
    expect(await odd({ error: "other", reason: "too-long", rule: "r" })).toBeInstanceOf(PlatformError);
    expect(await odd({ error: "tag-string-refused", reason: "too-long", rule: "r", maxCharacters: -1 })).toMatchObject({ name: "TagStringRefusedError", maxCharacters: undefined });
    expect(await odd({ error: "tag-string-refused", reason: "too-long", rule: "r", maxCharacters: 2.5 })).toMatchObject({ maxCharacters: undefined });
    expect(await odd({ error: "tag-string-refused", reason: "too-long", rule: "r", maxCharacters: 0 })).toMatchObject({ maxCharacters: 0 });
  });

  it("a 409 that is not a collision is a PlatformError, and the collision carries the normalised tag", async () => {
    expect(await thrown(addTag(world({ status: 409, body: { error: "entity-has-master" } }).platform, REC, "ann", AGENT))).toBeInstanceOf(PlatformError);
    const taken = await thrown(addTag(world({ status: 409, body: { error: "TagStringCollisionError" } }).platform, REC, " ann ", AGENT));
    expect(taken).toBeInstanceOf(TagTakenError);
    expect(taken).toMatchObject({ tag: "ann" });
  });
});

describe("makeMainTag: the edges", () => {
  it("a 409 whose error says TagRoleDerived (any case, any prefix) is a TagRoleDerivedError; any other 409 is a PlatformError", async () => {
    expect(await thrown(makeMainTag(world({ status: 409, body: { error: "TagRoleDerivedError" } }).platform, REC, "ann", AGENT))).toBeInstanceOf(TagRoleDerivedError);
    expect(await thrown(makeMainTag(world({ status: 409, body: { error: "tagroleDERIVED" } }).platform, REC, "ann", AGENT))).toBeInstanceOf(TagRoleDerivedError);
    const other = await thrown(makeMainTag(world({ status: 409, body: { error: "Else" } }).platform, REC, "ann", AGENT));
    expect(other).toBeInstanceOf(PlatformError);
    expect(other).not.toBeInstanceOf(TagRoleDerivedError);
  });

  it("changed is true only for true; the tag string is sent as given (not trimmed)", async () => {
    const w = world({ body: { changed: 1 } });
    expect(await makeMainTag(w.platform, REC, " ann ", AGENT)).toEqual({ changed: false });
    expect(w.sent[0]!.body).toEqual({ targetEntity: REC, tagString: " ann ", agent: AGENT });
  });
});

describe("removeTag: the edges", () => {
  it("answers the tag string the platform names, or the one asked when it names none", async () => {
    expect(await removeTag(world({ body: { changed: true, tagString: "norm" } }).platform, REC, "asked", AGENT)).toEqual({ changed: true, tagString: "norm" });
    expect(await removeTag(world({ body: { changed: true } }).platform, REC, "asked", AGENT)).toEqual({ changed: true, tagString: "asked" });
    expect(await removeTag(world({ status: 201, body: null }).platform, REC, "asked", AGENT)).toEqual({ changed: false, tagString: "asked" });
  });

  it("does not map a missing route to NoTagRoutesError (it surfaces the PlatformError of the answer)", async () => {
    const err = await thrown(removeTag(world({ status: 404, body: { message: "Route POST:/base/tag/remove not found" } }).platform, REC, "ann", AGENT));
    expect(err).toBeInstanceOf(PlatformError);
    expect((err as Error).name).toBe("PlatformError");
  });
});
