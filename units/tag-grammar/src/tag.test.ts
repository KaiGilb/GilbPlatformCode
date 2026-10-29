// The full tag `@<tag>@<vault name>` is parsed and formatted from the TagStandard record read live; a tag string holds no `@` and the write side
// refuses one; the short form is used only inside the holder's own vault; the full form is derived and never stored.
//
// Expected values are LITERALS. The fixture is the record as the master served it, fetched
// through the real `masterSource` from a rig origin that differs from the identity host.
import { describe, it, expect } from "vitest";
import { masterSource, VocabularyUnavailableError } from "@kaigilb/gilbplatformcode-vocabulary-source";
import {
  assertTagString,
  formatFullTag,
  formatShortTag,
  formatTag,
  normalizeTag,
  parseFullTag,
  parseTag,
  readTagGrammar,
  TagGrammarUnreadableError,
  TagRefusedError,
  type TagGrammar,
} from "./tag";
import { fixtureMaster, RIG } from "../test/support";
import { servedTagStandard, TAG_STANDARD, withTagStandard } from "../test/tagStandard";


const read = (record?: unknown): Promise<TagGrammar> => {
  const m = withTagStandard(fixtureMaster(), record);
  return readTagGrammar(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
};
const reason = (p: ReturnType<typeof parseFullTag>) => (p.ok ? "ok" : p.reason);

describe("readTagGrammar — the grammar is the record, read live", () => {
  it("reads the separator and the three segments the master serves", async () => {
    const g = await read();
    expect(g.standard).toBe(TAG_STANDARD);
    expect(g.separator).toBe("@");
    expect(g.segments).toEqual([
      { position: 0, label: "lead", pattern: "^$", optional: true },
      { position: 1, label: "tag", pattern: "[^@]+", optional: false },
      { position: 2, label: "vault-name", pattern: "[a-z0-9]+", optional: false },
    ]);
    expect(g.tag.position).toBe(1);
    expect(g.vaultName.position).toBe(2);
  });

  it("fetches the record and its two grammar terms from the configured origin", async () => {
    const m = withTagStandard(fixtureMaster());
    await readTagGrammar(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    expect(m.requested.sort()).toEqual([
      `${RIG}/base/a/segments`,
      `${RIG}/base/a/separator`,
      `${RIG}/base/e/tag-standard-full-tag-at-vault`,
    ]);
  });

  it("reads the prefixed spelling too, and one fact served under both spellings once", async () => {
    const served = servedTagStandard();
    const prefixed = { "@id": served["@id"], "a:segments": served.segments, "a:separator": served.separator };
    expect((await read(prefixed)).segments).toHaveLength(3);
    const both = { ...prefixed, segments: served.segments, separator: served.separator };
    expect((await read(both)).segments).toHaveLength(3);
  });

  it("follows the record: another separator and another vault pattern change what parses", async () => {
    const served = servedTagStandard();
    const g = await read({
      ...served,
      separator: "#",
      segments: [
        { cardinality: "?", label: "lead", pattern: "^$", position: 0 },
        { label: "tag", pattern: "[^#]+", position: 1 },
        { label: "vault-name", pattern: "[A-Z]{3}", position: 2 },
      ],
    });
    expect(parseFullTag("#ann#HOM", g)).toEqual({ ok: true, form: "full", tag: "ann", vaultName: "HOM" });
    expect(reason(parseFullTag("@ann@home", g))).toBe("pattern");
    expect(reason(parseFullTag("#ann#home", g))).toBe("pattern");
    expect(formatFullTag({ tag: "ann@home", vaultName: "HOM" }, g)).toBe("#ann@home#HOM");
    expect(() => assertTagString("to#m", g)).toThrow(TagRefusedError);
  });

  it("refuses a record it cannot walk, and never falls back to a built-in grammar", async () => {
    const served = servedTagStandard();
    const bad: [string, unknown][] = [
      ["no segments", { ...served, segments: undefined }],
      ["an empty separator", { ...served, separator: "" }],
      ["no separator", { ...served, separator: undefined }],
      ["a code-table segment", { ...served, segments: [served.segments[0], { ...served.segments[1], codeTable: "units" }, served.segments[2]] }],
      ["no tag segment", { ...served, segments: [served.segments[0], { ...served.segments[1], label: "name" }, served.segments[2]] }],
      ["no vault-name segment", { ...served, segments: served.segments.slice(0, 2) }],
      ["the vault name not last", { ...served, segments: [{ ...served.segments[2], position: 0 }, { ...served.segments[1], position: 1 }, { ...served.segments[0], position: 2 }] }],
      ["a required third segment", { ...served, segments: [{ label: "lead", pattern: "x", position: 0 }, served.segments[1], served.segments[2]] }],
      ["a repeated position", { ...served, segments: [served.segments[0], served.segments[1], { ...served.segments[2], position: 1 }] }],
      ["an unusable pattern", { ...served, segments: [served.segments[0], { ...served.segments[1], pattern: "[" }, served.segments[2]] }],
      ["an optional tag", { ...served, segments: [served.segments[0], { ...served.segments[1], cardinality: "?" }, served.segments[2]] }],
    ];
    for (const [what, record] of bad) {
      await expect(read(record), what).rejects.toBeInstanceOf(TagGrammarUnreadableError);
    }
  });

  it("a record that cannot be fetched is 'could not read', not a default grammar", async () => {
    const m = withTagStandard(fixtureMaster());
    m.status.set(`${RIG}/base/e/tag-standard-full-tag-at-vault`, 503);
    await expect(readTagGrammar(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }))).rejects.toBeInstanceOf(VocabularyUnavailableError);
    const gone = fixtureMaster(); // the record was never put
    await expect(readTagGrammar(masterSource({ vedaOrigin: RIG, fetchImpl: gone.fetch }))).rejects.toBeInstanceOf(VocabularyUnavailableError);
  });
});

describe("parseFullTag — the 12 known answers", () => {
  it("decodes the three that decode", async () => {
    const g = await read();
    expect(parseFullTag("@ann@home", g)).toEqual({ ok: true, form: "full", tag: "ann", vaultName: "home" });
    expect(parseFullTag("@ann.lee@home", g)).toEqual({ ok: true, form: "full", tag: "ann.lee", vaultName: "home" });
    expect(parseFullTag("@Ann Lee@home", g)).toEqual({ ok: true, form: "full", tag: "Ann Lee", vaultName: "home" });
  });

  it("refuses the nine that are refused, each for its own reason", async () => {
    const g = await read();
    expect(reason(parseFullTag("ann@home", g))).toBe("pattern"); // no leading @: "ann" sits where the empty lead must be
    expect(reason(parseFullTag("x@ann@home", g))).toBe("pattern"); // text before the leading @
    expect(reason(parseFullTag("@ann@Home", g))).toBe("pattern"); // a vault name is [a-z0-9]+
    expect(reason(parseFullTag("@ann@home.no", g))).toBe("pattern");
    expect(reason(parseFullTag("@t@m@home", g))).toBe("surplus-token"); // a tag holds no @
    expect(reason(parseFullTag("@@home", g))).toBe("missing-token");
    expect(reason(parseFullTag("@ann@", g))).toBe("missing-token");
    expect(reason(parseFullTag("ann@home.no", g))).toBe("pattern"); // an email address
    expect(reason(parseFullTag("@ann", g))).toBe("missing-token"); // the short form is not the full form
  });
});

describe("an email address is not read as a tag", () => {
  it("in the holder's own vault or anywhere else", async () => {
    const g = await read();
    for (const email of ["ann@home.no", "home@example.test", "first.last@example.org", "sales@shop.example.test", "ann@home"]) {
      expect(parseTag(email, g, { ownVaultName: "home" }).ok, email).toBe(false);
      expect(parseTag(email, g, { ownVaultName: null }).ok, email).toBe(false);
    }
  });
});

describe("round trip — format, then parse, gives the same tag and vault", () => {
  const tags = ["ann", "ann.lee", "Ann Lee", "owner.home", "appuser.flyfisher", "Ærø Å. Bjørn", "a b.c d", "ann-2", "o'neil", "x"];
  const vaults = ["home", "away", "pod1a2b3c", "0"];

  it("for every seeded tag, dots and spaces included, in every vault", async () => {
    const g = await read();
    for (const tag of tags) {
      for (const vaultName of vaults) {
        const text = formatFullTag({ tag, vaultName }, g);
        expect(text).toBe(`@${tag}@${vaultName}`);
        expect(parseFullTag(text, g)).toEqual({ ok: true, form: "full", tag, vaultName });
      }
    }
  });

  it("normalises a tag the way the platform stores one: NFC, then trim", async () => {
    const g = await read();
    expect(normalizeTag("  ann  ")).toBe("ann");
    expect(normalizeTag("José")).toBe("José");
    expect(formatFullTag({ tag: "  ann ", vaultName: "home" }, g)).toBe("@ann@home");
    expect(parseFullTag("@ ann @home", g)).toEqual({ ok: true, form: "full", tag: "ann", vaultName: "home" });
    expect(parseFullTag("@José@home", g)).toEqual({ ok: true, form: "full", tag: "José", vaultName: "home" });
    expect(reason(parseFullTag("@   @home", g))).toBe("empty");
  });
});

describe("a tag string holds no @ — refused on the write side", () => {
  it("assertTagString refuses one, and formatting refuses to emit one", async () => {
    const g = await read();
    for (const bad of ["t@m", "@ann", "ann@", "ann@home", "@"]) {
      expect(() => assertTagString(bad, g), bad).toThrow(TagRefusedError);
      expect(() => formatFullTag({ tag: bad, vaultName: "home" }, g), bad).toThrow(TagRefusedError);
      expect(() => formatShortTag(bad, g), bad).toThrow(TagRefusedError);
    }
  });

  it("refuses the separator even under a record whose tag segment states no pattern", async () => {
    const served = servedTagStandard();
    const g = await read({ ...served, segments: [served.segments[0], { label: "tag", position: 1 }, served.segments[2]] });
    expect(g.tag.pattern).toBeNull();
    expect(() => assertTagString("t@m", g)).toThrow(TagRefusedError);
    expect(assertTagString("ann", g)).toBe("ann");
  });

  it("refuses an empty or non-text tag string, and keeps dots and spaces", async () => {
    const g = await read();
    expect(() => assertTagString("", g)).toThrow(TagRefusedError);
    expect(() => assertTagString("   ", g)).toThrow(TagRefusedError);
    expect(() => assertTagString(42, g)).toThrow(TagRefusedError);
    expect(assertTagString(" Ann Lee ", g)).toBe("Ann Lee");
    expect(assertTagString("ann.lee", g)).toBe("ann.lee");
  });

  it("refuses a vault name the record's pattern does not allow", async () => {
    const g = await read();
    for (const bad of ["Home", "home.no", "", "k@i", "home lee"]) {
      expect(() => formatFullTag({ tag: "ann", vaultName: bad }, g), bad).toThrow(TagRefusedError);
    }
  });
});

describe("the short form — inside the holder's own vault only", () => {
  it("is accepted in the holder's own vault and means that vault", async () => {
    const g = await read();
    expect(parseTag("@ann", g, { ownVaultName: "home" })).toEqual({ ok: true, form: "short", tag: "ann", vaultName: "home" });
    expect(parseTag("@Ann Lee", g, { ownVaultName: "home" })).toEqual({ ok: true, form: "short", tag: "Ann Lee", vaultName: "home" });
  });

  it("is refused in another vault's context: there a tag resolves only in full form", async () => {
    const g = await read();
    expect(parseTag("@ann", g, { ownVaultName: null })).toEqual({ ok: false, reason: "short-form-outside-own-vault" });
    expect(parseTag("@ann@home", g, { ownVaultName: null })).toEqual({ ok: true, form: "full", tag: "ann", vaultName: "home" });
  });

  it("the full form names its own vault even when typed inside another", async () => {
    const g = await read();
    expect(parseTag("@ann@away", g, { ownVaultName: "home" })).toEqual({ ok: true, form: "full", tag: "ann", vaultName: "away" });
  });

  it("a bare word, a lone @ and a trailing @ are not the short form", async () => {
    const g = await read();
    for (const text of ["ann", "@", "@ann@", "ann@", ""]) {
      expect(parseTag(text, g, { ownVaultName: "home" }).ok, JSON.stringify(text)).toBe(false);
    }
  });

  it("formatTag shows the short form in the holder's own vault and the full form elsewhere", async () => {
    const g = await read();
    expect(formatTag({ tag: "ann", vaultName: "home" }, g, { ownVaultName: "home" })).toBe("@ann");
    expect(formatTag({ tag: "ann", vaultName: "home" }, g, { ownVaultName: null })).toBe("@ann@home");
    expect(formatTag({ tag: "ann", vaultName: "away" }, g, { ownVaultName: "home" })).toBe("@ann@away");
    expect(formatShortTag("ann.lee", g)).toBe("@ann.lee");
  });
});
