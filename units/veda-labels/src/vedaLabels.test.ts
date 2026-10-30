// New tests (the source has none): the label reads, the once-per-term rule, the Bearer, and the failure cases.
// Each test loads a fresh copy of the module (and of base-origin and the auth seam beside it), so the module's
// caches start empty; `fetch` is a fake that records its calls.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeAuthHost, fakeFetch, gate, ORIGIN, type Reply } from "../test/support";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

async function fresh(opts: { origin?: string | null; auth?: "ok" | "throws" | "unset" } = {}) {
  vi.resetModules();
  const bo = await import("@kaigilb/gilbplatformcode-base-origin");
  const bridge = await import("@kaigilb/gilbplatformcode-lws-session-bridge");
  const mod = await import("./vedaLabels");
  if (opts.origin !== null) bo.setBaseOrigin(opts.origin ?? ORIGIN);
  const host = fakeAuthHost();
  if ((opts.auth ?? "ok") === "ok") bridge.setLwsAuth(host);
  else if (opts.auth === "throws") bridge.setLwsAuth({ ...host, bearerHeaderFor: async () => { throw new Error("not signed in"); } });
  return { mod, bo, bridge, host };
}

function install(answer: (url: string) => Reply) {
  const f = fakeFetch(answer);
  globalThis.fetch = f.fn;
  return f.calls;
}

const termAt = (kind: "t" | "a", name: string) => `${ORIGIN}/base/${kind}/${name}`;

describe("fetchTermLabel", () => {
  it("reads the term's document at the platform origin and answers its a:label", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "Person" } }));
    expect(await mod.fetchTermLabel("Person")).toBe("Person");
    expect(calls.map((c) => c.url)).toEqual([termAt("t", "Person")]);
  });

  it("sends the Bearer of the auth seam for that URL, and asks for JSON", async () => {
    const { mod, host } = await fresh();
    const calls = install(() => ({ body: { "a:label": "Person" } }));
    await mod.fetchTermLabel("Person");
    expect(calls[0]!.headers).toEqual({ authorization: `Bearer t-${termAt("t", "Person")}`, accept: "application/ld+json, application/json" });
    expect(host.asked).toEqual([termAt("t", "Person")]);
  });

  it("takes the bare name from a t: curie and from an address", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "X" } }));
    await mod.fetchTermLabel("t:Alpha");
    await mod.fetchTermLabel("https://other.example.test/base/t/Beta");
    expect(calls.map((c) => c.url)).toEqual([termAt("t", "Alpha"), termAt("t", "Beta")]);
  });

  it("encodes the name in the path", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "X" } }));
    await mod.fetchTermLabel("Odd?Name#1");
    expect(calls[0]!.url).toBe(`${ORIGIN}/base/t/${encodeURIComponent("Odd?Name#1")}`);
  });

  it("follows the origin set when the call is made, not when the module loaded", async () => {
    const { mod, bo } = await fresh();
    bo.setBaseOrigin("https://other.example.test");
    const calls = install(() => ({ body: { "a:label": "X" } }));
    await mod.fetchTermLabel("Person");
    expect(calls[0]!.url).toBe("https://other.example.test/base/t/Person");
  });

  it.each([
    ["a:label", { "a:label": "  Spaced  " }, "Spaced"],
    ["label", { label: "Plain" }, "Plain"],
    ["schema name", { "https://schema.org/name": "Named" }, "Named"],
  ])("reads the label from the %s key, trimmed", async (_k, body, want) => {
    const { mod } = await fresh();
    install(() => ({ body }));
    expect(await mod.fetchTermLabel("T")).toBe(want);
  });

  it("answers null for a document with no label (and keeps that answer)", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "   " } }));
    expect(await mod.fetchTermLabel("T")).toBeNull();
    expect(await mod.fetchTermLabel("T")).toBeNull();
    expect(calls).toHaveLength(1);
  });
});

describe("one request per term", () => {
  it("callers asking at the same time share one request", async () => {
    const { mod } = await fresh();
    const g = gate();
    const calls = install(() => ({ body: { "a:label": "Person" }, gate: g.promise }));
    const all = Promise.all([1, 2, 3, 4, 5].map(() => mod.fetchTermLabel("Person")));
    g.open();
    expect(await all).toEqual(["Person", "Person", "Person", "Person", "Person"]);
    expect(calls).toHaveLength(1);
  });

  it("a later caller gets the kept label with no request", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "Person" } }));
    await mod.fetchTermLabel("Person");
    expect(await mod.fetchTermLabel("Person")).toBe("Person");
    expect(await mod.fetchTermLabel("t:Person")).toBe("Person"); // the same bare name
    expect(calls).toHaveLength(1);
  });

  it("different terms ask separately", async () => {
    const { mod } = await fresh();
    const calls = install((u) => ({ body: { "a:label": u.endsWith("/A") ? "Label A" : "Label B" } }));
    expect([await mod.fetchTermLabel("A"), await mod.fetchTermLabel("B")]).toEqual(["Label A", "Label B"]);
    expect(calls).toHaveLength(2);
  });

  it("a type and an attribute of the same name are two terms", async () => {
    const { mod } = await fresh();
    const calls = install((u) => ({ body: { "a:label": u.includes("/base/t/") ? "As type" : "As attribute" } }));
    expect(await mod.fetchTermLabel("Same")).toBe("As type");
    expect(await mod.fetchAttributeLabel("Same")).toBe("As attribute");
    expect(calls.map((c) => c.url)).toEqual([termAt("t", "Same"), termAt("a", "Same")]);
  });
});

describe("a failed read leaves the label empty", () => {
  it.each([[400], [404], [403]])("a %i answer is a definite null and is kept", async (status) => {
    const { mod } = await fresh();
    const calls = install(() => ({ status }));
    expect(await mod.fetchTermLabel("Gone")).toBeNull();
    expect(await mod.fetchTermLabel("Gone")).toBeNull();
    expect(calls).toHaveLength(1);
  });

  it.each([[500], [503], [302]])("a %i answer is null and is NOT kept: a later caller asks again", async (status) => {
    const { mod } = await fresh();
    let n = 0;
    const calls = install(() => (++n === 1 ? { status } : { body: { "a:label": "Back" } }));
    expect(await mod.fetchTermLabel("Flaky")).toBeNull();
    expect(await mod.fetchTermLabel("Flaky")).toBe("Back");
    expect(calls).toHaveLength(2);
  });

  it("an error answer that carries a label in its body gives no label", async () => {
    const { mod } = await fresh();
    install(() => ({ status: 500, body: { "a:label": "From an error page" } }));
    expect(await mod.fetchTermLabel("Err")).toBeNull();
    install(() => ({ status: 302, body: { "a:label": "From a redirect" } }));
    expect(await mod.fetchTermLabel("Err")).toBeNull();
  });

  it("a network failure is null and not kept", async () => {
    const { mod } = await fresh();
    let n = 0;
    const calls = install(() => (++n === 1 ? { fails: true } : { body: { "a:label": "Back" } }));
    expect(await mod.fetchTermLabel("Down")).toBeNull();
    expect(await mod.fetchTermLabel("Down")).toBe("Back");
    expect(calls).toHaveLength(2);
  });

  it("an answer that is not JSON is null and not kept", async () => {
    const { mod } = await fresh();
    let n = 0;
    install(() => (++n === 1 ? { badJson: true } : { body: { "a:label": "Back" } }));
    expect(await mod.fetchTermLabel("Bad")).toBeNull();
    expect(await mod.fetchTermLabel("Bad")).toBe("Back");
  });

  it("callers sharing a request that fails all get null, and the next one asks again", async () => {
    const { mod } = await fresh();
    const g = gate();
    let n = 0;
    const calls = install(() => (++n === 1 ? { fails: true, gate: g.promise } : { body: { "a:label": "Back" } }));
    const sharing = Promise.all([mod.fetchTermLabel("Down"), mod.fetchTermLabel("Down")]);
    g.open();
    expect(await sharing).toEqual([null, null]);
    expect(await mod.fetchTermLabel("Down")).toBe("Back");
    expect(calls).toHaveLength(2);
  });
});

describe("the credential", () => {
  it("a seam that cannot form a credential still lets the read go out, with only the accept header", async () => {
    const { mod } = await fresh({ auth: "throws" });
    const calls = install(() => ({ body: { "a:label": "Open" } }));
    expect(await mod.fetchTermLabel("Person")).toBe("Open");
    expect(calls[0]!.headers).toEqual({ accept: "application/ld+json, application/json" });
  });

  it("an auth seam never set is the same: the read goes out without a credential", async () => {
    const { mod } = await fresh({ auth: "unset" });
    const calls = install(() => ({ body: { "a:label": "Open" } }));
    expect(await mod.fetchTermLabel("Person")).toBe("Open");
    expect(calls[0]!.headers.authorization).toBeUndefined();
  });
});

describe("with no platform origin set", () => {
  it("the read is refused with the error that names setBaseOrigin, and no request goes out", async () => {
    const { mod } = await fresh({ origin: null });
    const calls = install(() => ({ body: { "a:label": "X" } }));
    await expect(mod.fetchTermLabel("Person")).rejects.toThrow(/setBaseOrigin/);
    await expect(mod.fetchAttributeLabel("name")).rejects.toThrow(/setBaseOrigin/);
    expect(calls).toHaveLength(0);
  });
});

describe("fetchAttributeLabel", () => {
  it("reads /base/a/<slug> and strips an a: prefix", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "Status" } }));
    expect(await mod.fetchAttributeLabel("a:taskStatus")).toBe("Status");
    expect(await mod.fetchAttributeLabel("taskStatus")).toBe("Status");
    expect(calls.map((c) => c.url)).toEqual([termAt("a", "taskStatus")]);
  });

  it("encodes the slug and keeps its own failures out of the cache", async () => {
    const { mod } = await fresh();
    let n = 0;
    const calls = install(() => (++n === 1 ? { status: 500 } : { body: { "a:label": "Ok" } }));
    expect(await mod.fetchAttributeLabel("a b")).toBeNull();
    expect(await mod.fetchAttributeLabel("a b")).toBe("Ok");
    expect(calls[0]!.url).toBe(`${ORIGIN}/base/a/a%20b`);
    expect(calls).toHaveLength(2);
  });
});

describe("prefetchVedaLabels", () => {
  it("returns the labels found, keyed as asked, and leaves out terms with none", async () => {
    const { mod } = await fresh();
    install((u) => {
      if (u.endsWith("/t/Person")) return { body: { "a:label": "Person label" } };
      if (u.endsWith("/a/status")) return { body: { "a:label": "Status label" } };
      return { status: 404 };
    });
    const got = await mod.prefetchVedaLabels({ types: ["t:Person", "Ghost"], attrs: ["status", "a:nothing"] });
    expect([...got.types]).toEqual([["t:Person", "Person label"]]);
    expect([...got.attrs]).toEqual([["status", "Status label"]]);
  });

  it("with nothing asked returns two empty maps and makes no request", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: {} }));
    const got = await mod.prefetchVedaLabels({});
    expect(got.types.size).toBe(0);
    expect(got.attrs.size).toBe(0);
    expect(calls).toHaveLength(0);
  });

  it("a failed read is left out and does not fail the others", async () => {
    const { mod } = await fresh();
    install((u) => (u.endsWith("/t/Down") ? { fails: true } : { body: { "a:label": "Up label" } }));
    const got = await mod.prefetchVedaLabels({ types: ["Down", "Up"] });
    expect([...got.types]).toEqual([["Up", "Up label"]]);
  });

  it("uses the once-per-term rule: a term named twice is read once", async () => {
    const { mod } = await fresh();
    const calls = install(() => ({ body: { "a:label": "L" } }));
    await mod.prefetchVedaLabels({ types: ["Person", "t:Person"] });
    expect(calls).toHaveLength(1);
  });
});
