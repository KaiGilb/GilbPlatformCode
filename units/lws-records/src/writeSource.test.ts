// New. `writeSource` and the two errors `factsAsServed` throws, pinned on their own (the ported cases reach them only through
// `factsAsServed`).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ServedLinkUnreadableError, ServedShortFormError, factsAsServed, writeSource, type ServedDocument } from "./records";
import { resetVaultContextCache } from "./vaultContext";
import { SERVED_CONTEXT } from "../test/servedContext.fixture";
import { setUp, tearDown } from "../test/support";

describe("writeSource", () => {
  it("a record with no served keys has none: an empty spread, so a write keeps its arity", () => {
    expect(writeSource({})).toEqual([]);
    expect(writeSource({ entityUri: "https://v.platform.example.test/base/e/a", servedKeys: [] })).toEqual([]);
    expect(((...rest: unknown[]) => rest.length)(...writeSource({ servedKeys: [] }))).toBe(0);
  });

  it("a record with served keys is one source: the record's own URI and the keys", () => {
    const keys = ["name", "c_geometry"];
    expect(writeSource({ entityUri: "https://v.platform.example.test/base/e/a", servedKeys: keys })).toEqual([
      { at: "https://v.platform.example.test/base/e/a", servedKeys: keys },
    ]);
  });

  it("served keys without an entity URI name no vault: `at` is null", () => {
    expect(writeSource({ servedKeys: ["name"] })).toEqual([{ at: null, servedKeys: ["name"] }]);
  });
});

describe("the errors a full-state write is refused with", () => {
  it("ServedShortFormError names the fact and the value, and its name", () => {
    const e = new ServedShortFormError("statedBy", "base:e/x");
    expect(e.name).toBe("ServedShortFormError");
    expect(e.message).toBe("This record holds a link this app cannot read in full (statedBy: base:e/x), so nothing was changed.");
  });

  it("ServedLinkUnreadableError names the fact and the value, and its name", () => {
    const e = new ServedLinkUnreadableError("fvParent", "https://v.platform.example.test/base/e/p");
    expect(e.name).toBe("ServedLinkUnreadableError");
    expect(e.message).toBe(
      "This app could not read the vault's description to tell whether fvParent (https://v.platform.example.test/base/e/p) is a link, so nothing was changed. Try again in a minute.",
    );
  });
});

// ---- New: two arms of `factsAsServed` the ported cases leave to chance (found by the mutation checks).
describe("factsAsServed: the two arms the ported cases do not pin", () => {
  const VAULT = "https://hv.platform.example.test";
  const AT = `${VAULT}/base/e/rec1`;
  const doc = (facts: Record<string, unknown>): ServedDocument => ({ facts, context: "https://www.w3.org/ns/lws/v1", etag: '"sha256:0"' });
  let asked: string[];
  beforeEach(() => {
    setUp();
    resetVaultContextCache();
    asked = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) => {
        asked.push(String(url));
        return new Response(JSON.stringify({ "@context": SERVED_CONTEXT["@context"] }), { status: 200 });
      }),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    tearDown();
  });

  it("a fact served as null is not a fact: it is left out, and no key is made for it", async () => {
    const { facts, keepEmpty } = await factsAsServed(doc({ name: "Ann", gone: null }), AT);
    expect(facts).toEqual({ name: "Ann" });
    expect("gone" in facts).toBe(false);
    expect(keepEmpty.size).toBe(0);
  });

  it("a LIST of bare addresses is address-shaped: the vault's context is read, and a term typed as a link sends each as a link", async () => {
    const a = `${VAULT}/base/e/a`;
    const b = `${VAULT}/base/e/b`;
    const { facts } = await factsAsServed(doc({ fvParent: [a, b] }), AT);
    expect(facts).toEqual({ fvParent: [{ "@id": a }, { "@id": b }] });
    expect(asked).toEqual([`${VAULT}/base/context.jsonld`]);
  });

  it("a list holding no address-shaped text asks nothing", async () => {
    const { facts } = await factsAsServed(doc({ tags: ["red", "two words"] }), AT);
    expect(facts).toEqual({ tags: ["red", "two words"] });
    expect(asked).toEqual([]);
  });
});
