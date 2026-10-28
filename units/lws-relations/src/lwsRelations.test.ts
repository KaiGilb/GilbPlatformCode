// New. Pins the export list of the package, the small pure exports no ported case reaches, and the one setting the unit reads when
// a function is called (the ontology origin).
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as unit from "./index";
import { resetTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  vi.useRealTimers();
  tearDown();
});

describe("lws-relations exports", () => {
  it("are exactly these", () => {
    expect(Object.keys(unit).sort()).toEqual([
      "BoundTimeoutError",
      "GENERIC_PREDICATE_CURIE",
      "LINK_PLANES",
      "RELATION_CATEGORY_CURIE",
      "RelationSurvivedEndError",
      "__setCatalogForTest",
      "boundAwait",
      "catalogFromGraph",
      "endRelation",
      "entityUriForShare",
      "grantDirectUrl",
      "grantPublicOnRelation",
      "hostOfUri",
      "inheritFolderPublic",
      "isBoundTimeout",
      "isPublicFolder",
      "isPublicPrincipal",
      "listDirectShares",
      "listFolderPartMembers",
      "liveIsOfferable",
      "memberEntityUri",
      "mintRelationId",
      "onEntityShareChanged",
      "publicGrantee",
      "readRelationDoc",
      "readRelations",
      "readUserLinkPlaneCatalog",
      "relationDocFromJson",
      "relationsKey",
      "revokeDirectUrl",
      "revokeEntityShare",
      "revokePublicOnRelation",
      "setFolderTreePublic",
      "shareEntity",
      "uriTail",
      "writePairRelation",
    ]);
  });
  it("the functions are functions and the two predicate constants are the CURIEs the write door tests", () => {
    for (const name of ["readRelations", "readRelationDoc", "writePairRelation", "endRelation", "memberEntityUri", "relationsKey", "shareEntity", "revokeEntityShare"] as const) {
      expect(typeof unit[name]).toBe("function");
    }
    expect(unit.GENERIC_PREDICATE_CURIE).toBe("t:ConnectedTo");
    expect(unit.RELATION_CATEGORY_CURIE).toBe("t:Relation");
    expect(unit.LINK_PLANES).toEqual(["user", "process", "grant", "classification"]);
  });
});

describe("hostOfUri", () => {
  it("is the lower-cased host of a URL, with its port", () => {
    expect(unit.hostOfUri("https://Admin.Platform.Example.Test/base")).toBe("admin.platform.example.test");
    expect(unit.hostOfUri("http://rig.example.test:8787/x")).toBe("rig.example.test:8787");
  });
  it("is null for nothing, blank text, or text that is not a URL", () => {
    expect(unit.hostOfUri(null)).toBeNull();
    expect(unit.hostOfUri(undefined)).toBeNull();
    expect(unit.hostOfUri("   ")).toBeNull();
    expect(unit.hostOfUri("not a url")).toBeNull();
  });
  it("trims before it reads", () => {
    expect(unit.hostOfUri("  https://a.example.test/b  ")).toBe("a.example.test");
  });
});

describe("mintRelationId", () => {
  it("is 26 lower-case hex digits and is not the same twice", () => {
    const a = unit.mintRelationId();
    const b = unit.mintRelationId();
    expect(a).toMatch(/^[0-9a-f]{26}$/);
    expect(b).toMatch(/^[0-9a-f]{26}$/);
    expect(a).not.toBe(b);
  });
});

describe("boundAwait", () => {
  it("settles with the value when the promise settles first", async () => {
    await expect(unit.boundAwait(Promise.resolve(7), 1000, "reading")).resolves.toBe(7);
  });
  it("passes the rejection of the promise on, not a timeout", async () => {
    await expect(unit.boundAwait(Promise.reject(new Error("no")), 1000, "reading")).rejects.toThrow("no");
  });
  it("rejects with a BoundTimeoutError that names the wait and ends with 'timed out'", async () => {
    vi.useFakeTimers();
    const p = unit.boundAwait(new Promise<number>(() => {}), 500, "signing in");
    const seen = p.then(
      () => null,
      (e: unknown) => e,
    );
    await vi.advanceTimersByTimeAsync(499);
    let settled = false;
    void seen.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(2);
    const e = await seen;
    expect(e).toBeInstanceOf(unit.BoundTimeoutError);
    expect((e as Error).message).toBe("signing in timed out");
    expect((e as Error).name).toBe("BoundTimeoutError");
  });
  it("a late value after the timeout is ignored", async () => {
    vi.useFakeTimers();
    let release: (v: number) => void = () => {};
    const p = unit.boundAwait(new Promise<number>((r) => (release = r)), 100, "x");
    const seen = p.then(
      () => "value",
      () => "timeout",
    );
    await vi.advanceTimersByTimeAsync(101);
    release(1);
    await expect(seen).resolves.toBe("timeout");
  });
  it("isBoundTimeout is true for an Error whose message ends in 'timed out' and for nothing else", () => {
    expect(unit.isBoundTimeout(new unit.BoundTimeoutError("a"))).toBe(true);
    expect(unit.isBoundTimeout(new Error("the proof timed out"))).toBe(true);
    expect(unit.isBoundTimeout(new Error("timed out here"))).toBe(false);
    expect(unit.isBoundTimeout("timed out")).toBe(false);
    expect(unit.isBoundTimeout(null)).toBe(false);
  });
});

describe("publicGrantee and isPublicPrincipal", () => {
  it("the public grantee is the GilbVeda term PublicGrantee at the ontology origin that was set", () => {
    expect(unit.publicGrantee()).toBe("https://ontology.example.test/base/t/PublicGrantee");
  });
  it("it follows the setting when the setting changes (read when called, not when the module loads)", async () => {
    const { setTermOrigin } = await import("@kaigilb/gilbplatformcode-term-origin");
    setTermOrigin("https://other-ontology.example.test");
    expect(unit.publicGrantee()).toBe("https://other-ontology.example.test/base/t/PublicGrantee");
  });
  it("it throws, naming the setting, when the ontology origin was never set", () => {
    resetTermOrigin();
    expect(() => unit.publicGrantee()).toThrow(/setTermOrigin/);
  });
  it("is public only for EXACTLY that string: a near miss, a blank or nothing is not public", () => {
    const g = unit.publicGrantee();
    expect(unit.isPublicPrincipal(g)).toBe(true);
    expect(unit.isPublicPrincipal(g + "/")).toBe(false);
    expect(unit.isPublicPrincipal(g.toLowerCase().replace("publicgrantee", "PUBLICGRANTEE"))).toBe(false);
    expect(unit.isPublicPrincipal("")).toBe(false);
    expect(unit.isPublicPrincipal(null)).toBe(false);
    expect(unit.isPublicPrincipal(undefined)).toBe(false);
  });
});

describe("relationsKey", () => {
  it("is the id and the origin the question is asked at, under one head", () => {
    expect(unit.relationsKey("a", "https://v.platform.example.test/base/e/a")).toEqual(["base", "relations", "a", "https://v.platform.example.test"]);
    expect(unit.relationsKey(null, null)).toEqual(["base", "relations", null, "https://platform.example.test"]);
  });
});

describe("uriTail", () => {
  it("drops a query, a fragment and closing slashes, and decodes the tail", () => {
    expect(unit.uriTail("https://v.example.test/base/r/a%20b?x=1#y")).toBe("a b");
    expect(unit.uriTail("https://v.example.test/base/e/abc///")).toBe("abc");
  });
  it("gives back the text itself when no tail is left, and the raw tail when it cannot be decoded", () => {
    expect(unit.uriTail("///")).toBe("///");
    expect(unit.uriTail("https://v.example.test/base/r/%E0%A4%A")).toBe("%E0%A4%A");
  });
});
