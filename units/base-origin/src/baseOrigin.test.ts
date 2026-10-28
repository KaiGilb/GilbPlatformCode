import { afterEach, describe, expect, test, vi } from "vitest";
import {
  baseOrigin,
  localRigHosts,
  minOntologyQuery,
  ontologyApiOrigin,
  publicCorpusOrigin,
  resetBaseOrigin,
  resetLocalRigHosts,
  resetMinOntologyQuery,
  resetOntologyApiOrigin,
  resetPublicCorpusOrigin,
  resetSystemVaultHosts,
  setBaseOrigin,
  setLocalRigHosts,
  setMinOntologyQuery,
  setOntologyApiOrigin,
  setPublicCorpusOrigin,
  setSystemVaultHosts,
  systemVaultHosts,
} from "./baseOrigin";
import * as api from "./index";

afterEach(() => {
  resetBaseOrigin();
  resetSystemVaultHosts();
  resetOntologyApiOrigin();
  resetMinOntologyQuery();
  resetPublicCorpusOrigin();
  resetLocalRigHosts();
});

describe("setBaseOrigin / baseOrigin", () => {
  test("the value that was set is the value given back", () => {
    setBaseOrigin("https://platform.example.test");
    expect(baseOrigin()).toBe("https://platform.example.test");
  });

  test("http and a port that is not the default are kept", () => {
    setBaseOrigin("http://platform.example.test:8787");
    expect(baseOrigin()).toBe("http://platform.example.test:8787");
  });

  test("a trailing slash, an explicit default port and upper-case letters are normalised; the text is trimmed", () => {
    setBaseOrigin("  HTTPS://Platform.Example.TEST:443/ \n");
    expect(baseOrigin()).toBe("https://platform.example.test");
    setBaseOrigin("http://example.test:80");
    expect(baseOrigin()).toBe("http://example.test");
  });

  test("a second call replaces the first", () => {
    setBaseOrigin("https://one.example.test");
    setBaseOrigin("https://two.example.test");
    expect(baseOrigin()).toBe("https://two.example.test");
  });

  test.each([[""], ["   "], ["platform.example.test"], ["//platform.example.test"], ["https://"], ["ftp://example.test"], ["file:///x"], ["javascript:alert(1)"]])(
    "%j throws a TypeError that starts with base-origin: setBaseOrigin:",
    (bad) => {
      expect(() => setBaseOrigin(bad)).toThrow(TypeError);
      expect(() => setBaseOrigin(bad)).toThrow(/^base-origin: setBaseOrigin: /);
    },
  );

  test.each([
    ["https://example.test/base", /no path/],
    ["https://example.test//", /no path/],
    ["https://example.test?x=1", /no query/],
    ["https://example.test?", /no query/],
    ["https://example.test#top", /no fragment/],
    ["https://example.test/#", /no fragment/],
    ["https://user@example.test", /user name or password/],
    ["https://user:secret@example.test", /user name or password/],
    ["https://:secret@example.test", /user name or password/],
    ["ftp://example.test", /scheme must be http or https/],
    ["not a url", /not a URL/],
  ])("%j is refused with a message that says what is wrong", (bad, why) => {
    expect(() => setBaseOrigin(bad)).toThrow(why);
  });

  test("a refused value leaves the earlier value, or leaves it unset", () => {
    expect(() => setBaseOrigin("nope")).toThrow(TypeError);
    expect(() => baseOrigin()).toThrow("base-origin: call setBaseOrigin(<origin>) once at start-up");
    setBaseOrigin("https://one.example.test");
    expect(() => setBaseOrigin("nope")).toThrow(TypeError);
    expect(baseOrigin()).toBe("https://one.example.test");
  });

  test("never set: baseOrigin throws an Error (not a TypeError) that names setBaseOrigin", () => {
    expect(() => baseOrigin()).toThrow(Error);
    expect(() => baseOrigin()).not.toThrow(TypeError);
    expect(() => baseOrigin()).toThrow(/setBaseOrigin/);
  });

  test("resetBaseOrigin forgets the origin, and is harmless when nothing was set", () => {
    expect(() => resetBaseOrigin()).not.toThrow();
    setBaseOrigin("https://platform.example.test");
    resetBaseOrigin();
    expect(() => baseOrigin()).toThrow(/setBaseOrigin/);
  });
});

describe("setSystemVaultHosts / systemVaultHosts", () => {
  test("the hosts that were set are answered as a set, with has()", () => {
    setSystemVaultHosts(["one.example.test", "two.example.test"]);
    const set = systemVaultHosts();
    expect(set.has("one.example.test")).toBe(true);
    expect(set.has("two.example.test")).toBe(true);
    expect(set.has("three.example.test")).toBe(false);
    expect(set.size).toBe(2);
  });

  test("names are trimmed and lower-cased, and a repeated name counts once", () => {
    setSystemVaultHosts(["  One.Example.Test ", "one.example.test"]);
    expect([...systemVaultHosts()]).toEqual(["one.example.test"]);
  });

  test("an empty list is allowed: no system host", () => {
    setSystemVaultHosts([]);
    expect(systemVaultHosts().size).toBe(0);
  });

  test("a second call replaces the first", () => {
    setSystemVaultHosts(["one.example.test"]);
    setSystemVaultHosts(["two.example.test"]);
    expect([...systemVaultHosts()]).toEqual(["two.example.test"]);
  });

  test.each([[""], ["  "], ["https://one.example.test"], ["one.example.test:8443"], ["one.example.test/base"], ["one example.test"], ["user@one.example.test"], ["one.example.test?x"], ["one.example.test#x"]])(
    "%j is not a bare host: a TypeError that starts with base-origin: setSystemVaultHosts:",
    (bad) => {
      expect(() => setSystemVaultHosts(["ok.example.test", bad])).toThrow(TypeError);
      expect(() => setSystemVaultHosts(["ok.example.test", bad])).toThrow(/^base-origin: setSystemVaultHosts: /);
    },
  );

  test("a value that is not a string is refused", () => {
    expect(() => setSystemVaultHosts([1 as unknown as string])).toThrow(/must be a string/);
  });

  test("a refused list leaves the earlier list, or leaves it unset", () => {
    expect(() => setSystemVaultHosts(["https://x"])).toThrow(TypeError);
    expect(() => systemVaultHosts()).toThrow(/setSystemVaultHosts/);
    setSystemVaultHosts(["one.example.test"]);
    expect(() => setSystemVaultHosts(["https://x"])).toThrow(TypeError);
    expect([...systemVaultHosts()]).toEqual(["one.example.test"]);
  });

  test("never set: systemVaultHosts throws an Error that names setSystemVaultHosts", () => {
    expect(() => systemVaultHosts()).toThrow(Error);
    expect(() => systemVaultHosts()).not.toThrow(TypeError);
    expect(() => systemVaultHosts()).toThrow("base-origin: call setSystemVaultHosts([...hosts]) once at start-up");
  });

  test("resetSystemVaultHosts forgets the list", () => {
    setSystemVaultHosts(["one.example.test"]);
    resetSystemVaultHosts();
    expect(() => systemVaultHosts()).toThrow(/setSystemVaultHosts/);
  });
});

describe("ontologyApiOrigin (optional)", () => {
  test("unset: undefined, no override", () => {
    expect(ontologyApiOrigin()).toBeUndefined();
  });

  test("set: the normalised origin; blank clears it", () => {
    setOntologyApiOrigin(" https://Ontology.Example.Test/ ");
    expect(ontologyApiOrigin()).toBe("https://ontology.example.test");
    setOntologyApiOrigin("  ");
    expect(ontologyApiOrigin()).toBeUndefined();
  });

  test("not an origin: a TypeError that starts with base-origin: setOntologyApiOrigin:, the earlier value stays", () => {
    setOntologyApiOrigin("https://ontology.example.test");
    expect(() => setOntologyApiOrigin("https://example.test/x")).toThrow(/^base-origin: setOntologyApiOrigin: .*no path/);
    expect(ontologyApiOrigin()).toBe("https://ontology.example.test");
  });

  test("reset forgets it", () => {
    setOntologyApiOrigin("https://ontology.example.test");
    resetOntologyApiOrigin();
    expect(ontologyApiOrigin()).toBeUndefined();
  });
});

describe("minOntologyQuery (optional)", () => {
  test("unset: 3", () => {
    expect(minOntologyQuery()).toBe(3);
  });

  test("set: the value, zero included", () => {
    setMinOntologyQuery(5);
    expect(minOntologyQuery()).toBe(5);
    setMinOntologyQuery(0);
    expect(minOntologyQuery()).toBe(0);
  });

  test.each([[-1], [1.5], [Number.NaN], [Number.POSITIVE_INFINITY]])("%s is refused with a TypeError, the earlier value stays", (bad) => {
    setMinOntologyQuery(4);
    expect(() => setMinOntologyQuery(bad)).toThrow(TypeError);
    expect(() => setMinOntologyQuery(bad)).toThrow(/^base-origin: setMinOntologyQuery: /);
    expect(minOntologyQuery()).toBe(4);
  });

  test("reset puts 3 back", () => {
    setMinOntologyQuery(7);
    resetMinOntologyQuery();
    expect(minOntologyQuery()).toBe(3);
  });
});

describe("publicCorpusOrigin (optional, no built-in value)", () => {
  test("never set: throws an Error that names setPublicCorpusOrigin", () => {
    expect(() => publicCorpusOrigin()).toThrow(Error);
    expect(() => publicCorpusOrigin()).not.toThrow(TypeError);
    expect(() => publicCorpusOrigin()).toThrow("base-origin: call setPublicCorpusOrigin(<origin>) once at start-up");
  });

  test("set: the normalised origin", () => {
    setPublicCorpusOrigin("https://Corpus.Example.Test:443/");
    expect(publicCorpusOrigin()).toBe("https://corpus.example.test");
  });

  test("not an origin: a TypeError that starts with base-origin: setPublicCorpusOrigin:, the earlier value stays", () => {
    setPublicCorpusOrigin("https://corpus.example.test");
    expect(() => setPublicCorpusOrigin("")).toThrow(/^base-origin: setPublicCorpusOrigin: /);
    expect(() => setPublicCorpusOrigin("https://u@corpus.example.test")).toThrow(TypeError);
    expect(publicCorpusOrigin()).toBe("https://corpus.example.test");
  });

  test("reset forgets it", () => {
    setPublicCorpusOrigin("https://corpus.example.test");
    resetPublicCorpusOrigin();
    expect(() => publicCorpusOrigin()).toThrow(/setPublicCorpusOrigin/);
  });
});

describe("setLocalRigHosts / localRigHosts (optional)", () => {
  test("unset: the empty set, so no rig branch is taken", () => {
    expect(localRigHosts().size).toBe(0);
    expect(localRigHosts().has("rig.example.test")).toBe(false);
  });

  test("a fresh copy of the module starts with the empty set", async () => {
    vi.resetModules();
    const fresh = await import("./baseOrigin");
    expect(fresh.localRigHosts().size).toBe(0);
  });

  test("set: the names, trimmed and lower-cased; an IPv6 literal keeps its brackets", () => {
    setLocalRigHosts([" Rig.Example.Test ", "127.0.0.1", "[::1]"]);
    expect([...localRigHosts()].sort()).toEqual(["127.0.0.1", "[::1]", "rig.example.test"]);
    expect(localRigHosts().has("rig.example.test")).toBe(true);
    expect(localRigHosts().has("other.example.test")).toBe(false);
  });

  test("an empty list clears it", () => {
    setLocalRigHosts(["rig.example.test"]);
    setLocalRigHosts([]);
    expect(localRigHosts().size).toBe(0);
  });

  test.each([[""], ["http://rig.example.test"], ["rig.example.test:8787"], ["rig.example.test/x"], ["rig example"]])(
    "%j is not a bare host: a TypeError that starts with base-origin: setLocalRigHosts:, the earlier list stays",
    (bad) => {
      setLocalRigHosts(["rig.example.test"]);
      expect(() => setLocalRigHosts([bad])).toThrow(TypeError);
      expect(() => setLocalRigHosts([bad])).toThrow(/^base-origin: setLocalRigHosts: /);
      expect([...localRigHosts()]).toEqual(["rig.example.test"]);
    },
  );

  test("a value that is not a string is refused", () => {
    expect(() => setLocalRigHosts([1 as unknown as string])).toThrow(/setLocalRigHosts: every host must be a string/);
  });

  test("reset puts the empty set back", () => {
    setLocalRigHosts(["rig.example.test"]);
    resetLocalRigHosts();
    expect(localRigHosts().size).toBe(0);
  });
});

describe("the settings are independent", () => {
  test("setting or resetting one leaves the others", () => {
    setBaseOrigin("https://platform.example.test");
    setSystemVaultHosts(["one.example.test"]);
    setOntologyApiOrigin("https://ontology.example.test");
    setMinOntologyQuery(9);
    setPublicCorpusOrigin("https://corpus.example.test");
    setLocalRigHosts(["rig.example.test"]);
    resetBaseOrigin();
    expect(localRigHosts().size).toBe(1);
    expect(systemVaultHosts().size).toBe(1);
    expect(ontologyApiOrigin()).toBe("https://ontology.example.test");
    expect(minOntologyQuery()).toBe(9);
    expect(publicCorpusOrigin()).toBe("https://corpus.example.test");
    resetMinOntologyQuery();
    expect(ontologyApiOrigin()).toBe("https://ontology.example.test");
    expect(publicCorpusOrigin()).toBe("https://corpus.example.test");
  });
});

describe("the export list", () => {
  test("is exactly these functions", () => {
    expect(Object.keys(api).sort()).toEqual([
      "baseOrigin",
      "localRigHosts",
      "minOntologyQuery",
      "ontologyApiOrigin",
      "publicCorpusOrigin",
      "resetBaseOrigin",
      "resetLocalRigHosts",
      "resetMinOntologyQuery",
      "resetOntologyApiOrigin",
      "resetPublicCorpusOrigin",
      "resetSystemVaultHosts",
      "setBaseOrigin",
      "setLocalRigHosts",
      "setMinOntologyQuery",
      "setOntologyApiOrigin",
      "setPublicCorpusOrigin",
      "setSystemVaultHosts",
      "systemVaultHosts",
    ]);
  });
});
