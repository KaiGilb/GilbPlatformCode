// `addReference` sends If-Match from the GET it built the value from, and on 412 re-reads, re-checks and retries, a bounded number of
// times the README states.
//
// A 412 leads to a re-read, a re-check and a retry. A target that no longer passes the check on the re-read is refused, with
// nothing written. Reaching the bound answers 'changed elsewhere', with 0 writes.
//
// The platform is `fixturePlatform`, modelling a platform that checks If-Match inside the write: each record GET carries its ETag,
// and a PATCH whose If-Match is not the record's ETag as it stands is 412 with nothing written. A write made elsewhere is FORCED
// into a named point of the sequence by `interleave` (on the Nth matching request), never timed. Expected values are literals.
import { describe, it, expect } from "vitest";
import type { ReferencePicker } from "./holderReference";
import { readFile } from "node:fs/promises";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { readReferenceReading } from "../test/readingOf";
import {
  ADD_REFERENCE_ATTEMPTS,
  addReference,
  conditionFromEtag,
  ReferenceChangedElsewhereError,
  ReferenceRefusedError,
  ReferenceUnknownError,
} from "./holderReference";
import { fixtureMaster, RIG, a } from "../test/support";
import { withTagStandard, withWritableFields } from "../test/fixtureTag";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, type FixtureOptions, type FixturePlatform } from "../test/fixturePlatform";

const VAULT = "https://ann.example.test/vault";
const OTHER_VAULT = "https://ann2.example.test/vault";
const AGENT = "https://id.example.test/base/p/0b6c9a52-agent";

async function setup(options: FixtureOptions = {}) {
  const m = withReferenceTerms(withWritableFields(withTagStandard(fixtureMaster())));
  const source = masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch });
  const reading = await readReferenceReading(source, await resolveFieldSets(source), { references: true });
  const p = fixturePlatform({ origin: new URL(VAULT).origin, ...options });
  p.reach.add(VAULT).add(OTHER_VAULT);
  const picker: ReferencePicker = { platform: { origin: p.origin, fetch: p.fetch }, reading, master: source };
  const w = {
    owners: p.seed(VAULT, "t:PartyGroup", { "a:name": "Owners" }),
    board: p.seed(VAULT, "t:PartyGroup", { "a:name": "Board" }),
    things: p.seed(VAULT, "t:ObjectGroup", { "a:name": "Things we keep" }),
  };
  // Ben starts as a member of Owners.
  const ben = p.seed(VAULT, "t:Person", { "a:name": "Ben", "a:email": "ben@example.test", "a:memberOf": { "@id": w.owners } });
  return { picker, p, w: { ...w, ben } };
}

const id = (iri: string) => iri.split("/").pop()!;
const patches = (p: FixturePlatform) => p.requests.filter((r) => r.method === "PATCH");
/** The carrier's own GETs (the reads a value is built from), not the LWS address proof. */
const carrierReads = (p: FixturePlatform, carrier: string) => p.requests.filter((r) => r.method === "GET" && r.path === `/base/e/${id(carrier)}`);
const memberOf = (p: FixturePlatform, record: string) => {
  const v = p.entities.get(record)!.facts["a:memberOf"];
  return (Array.isArray(v) ? v : [v]).map((x) => (x as { "@id": string })["@id"]);
};

async function outcome(promise: Promise<unknown>): Promise<string> {
  try {
    await promise;
  } catch (err) {
    if (err instanceof ReferenceRefusedError) return err.reason;
    if (err instanceof ReferenceUnknownError) return "unknown";
    if (err instanceof ReferenceChangedElsewhereError) return "changed-elsewhere";
    throw err;
  }
  return "resolved";
}

describe("If-Match from the GET the value was built from", () => {
  it("the merge patch carries If-Match equal to the ETag the carrier's GET answered, and the GET is never answered from a cache", async () => {
    const { picker, p, w } = await setup();
    const etag = p.etagOf(w.ben);
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    expect(patches(p)).toHaveLength(1);
    expect(patches(p)[0]!.headers["if-match"]).toBe(etag);
    expect(patches(p)[0]!.body).toEqual({ "a:memberOf": [{ "@id": w.owners }, { "@id": w.board }] });
    expect(carrierReads(p, w.ben)).toHaveLength(1);
    expect(memberOf(p, w.ben)).toEqual([w.owners, w.board]);
  });

  it("a carrier GET that names no ETag is 'not known yet', with nothing sent; an unconditional patch is never sent in its place", async () => {
    const { picker, p, w } = await setup();
    const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await p.fetch(url, init);
      if (!new URL(url).pathname.startsWith("/base/e/")) return res;
      const headers = new Headers(res.headers);
      headers.delete("etag");
      return new Response(await res.text(), { status: res.status, headers });
    };
    const noEtag: ReferencePicker = { ...picker, platform: { origin: picker.platform.origin, fetch } };
    expect(await outcome(addReference(noEtag, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("unknown");
    expect(patches(p)).toHaveLength(0);
    // Control: the same call with the ETag served is written once.
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    expect(patches(p)).toHaveLength(1);
  });

  it("in a host whose fetch caches the record GET (public, max-age=60), the read is made with cache mode no-store: a change made after an earlier read is kept", async () => {
    const { picker, p, w } = await setup({ httpCache: true });
    // The app read Ben earlier through the same fetch (cache mode default): the cache now holds it.
    await p.fetch(`${p.origin}/base/e/${id(w.ben)}`);
    // Then Ben joined Things elsewhere.
    p.edit(w.ben, { "a:memberOf": [{ "@id": w.owners }, { "@id": w.things }] });
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    expect(patches(p)).toHaveLength(1);
    expect(memberOf(p, w.ben)).toEqual([w.owners, w.things, w.board]);
  });
});

describe("on 412: re-read, re-check, retry", () => {
  it("a membership added elsewhere between the read and the patch: the first patch is 412 and writes nothing, the second is built from a re-read and both memberships survive", async () => {
    const { picker, p, w } = await setup();
    // Forced, not timed: the other writer commits just before this call's first PATCH is served.
    p.interleave({ method: "PATCH", prefix: "/lws/r/", nth: 1, run: () => p.edit(w.ben, { "a:memberOf": [{ "@id": w.owners }, { "@id": w.things }] }) });
    const before = p.etagOf(w.ben);
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    const sent = patches(p);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.headers["if-match"]).toBe(before);
    expect(sent[0]!.body).toEqual({ "a:memberOf": [{ "@id": w.owners }, { "@id": w.board }] });
    // The second patch is conditioned on the re-read and carries the other writer's membership.
    expect(sent[1]!.headers["if-match"]).not.toBe(before);
    expect(sent[1]!.body).toEqual({ "a:memberOf": [{ "@id": w.owners }, { "@id": w.things }, { "@id": w.board }] });
    expect(carrierReads(p, w.ben)).toHaveLength(2);
    expect(memberOf(p, w.ben)).toEqual([w.owners, w.things, w.board]);
  });

  it("a target that no longer passes on the re-read is refused, with nothing written: the target moved to another vault", async () => {
    const { picker, p, w } = await setup();
    p.interleave({
      method: "PATCH",
      prefix: "/lws/r/",
      nth: 1,
      run: () => {
        p.entities.get(w.board)!.vault = OTHER_VAULT;
        p.edit(w.ben, { "a:name": "Ben B." });
      },
    });
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("not-in-vault");
    expect(patches(p)).toHaveLength(1);
    expect(memberOf(p, w.ben)).toEqual([w.owners]);
    expect(p.entities.get(w.ben)!.facts["a:name"]).toBe("Ben B.");
  });

  it("a target that no longer passes on the re-read is refused, with nothing written: the carrier no longer holds the channel it would prefer", async () => {
    const { picker, p, w } = await setup();
    p.interleave({ method: "PATCH", prefix: "/lws/r/", nth: 1, run: () => p.edit(w.ben, { "a:email": null }) });
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:preferredChannel", target: a("email") }))).toBe("carrier-holds-no-value");
    expect(patches(p)).toHaveLength(1);
    expect(p.entities.get(w.ben)!.facts["a:preferredChannel"]).toBeUndefined();
  });

  it("a carrier that is no longer in the named vault on the re-read is refused, with nothing written", async () => {
    const { picker, p, w } = await setup();
    p.interleave({
      method: "PATCH",
      prefix: "/lws/r/",
      nth: 1,
      run: () => {
        p.entities.get(w.ben)!.vault = OTHER_VAULT;
        p.edit(w.ben, { "a:name": "Ben (moved)" });
      },
    });
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("not-in-vault");
    expect(patches(p)).toHaveLength(1);
    expect(memberOf(p, w.ben)).toEqual([w.owners]);
  });
});

describe("the bound", () => {
  it("the bound is 3 patches, and the README states it", async () => {
    expect(ADD_REFERENCE_ATTEMPTS).toBe(3);
    const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
    expect(readme).toContain("at most **3** merge patches");
  });

  it("changed elsewhere before every patch: after 3 patches, each 412, the answer is 'changed elsewhere' and nothing of this call is written", async () => {
    const { picker, p, w } = await setup();
    for (const nth of [1, 2, 3, 4])
      p.interleave({ method: "PATCH", prefix: "/lws/r/", nth, run: () => p.edit(w.ben, { "a:name": `Ben, edit ${nth}` }) });
    let err: unknown;
    try {
      await addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board });
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(ReferenceChangedElsewhereError);
    expect((err as ReferenceChangedElsewhereError).attempts).toBe(3);
    expect((err as ReferenceChangedElsewhereError).carrier).toBe(w.ben);
    expect(patches(p)).toHaveLength(3);
    expect(carrierReads(p, w.ben)).toHaveLength(3);
    // 0 writes: the membership is as it was, and the other writer's last edit stands.
    expect(memberOf(p, w.ben)).toEqual([w.owners]);
    expect(p.entities.get(w.ben)!.facts["a:name"]).toBe("Ben, edit 3");
  });

  it("control: changed elsewhere before the first two patches only, the third is written", async () => {
    const { picker, p, w } = await setup();
    for (const nth of [1, 2])
      p.interleave({ method: "PATCH", prefix: "/lws/r/", nth, run: () => p.edit(w.ben, { "a:name": `Ben, edit ${nth}` }) });
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    expect(patches(p)).toHaveLength(3);
    expect(memberOf(p, w.ben)).toEqual([w.owners, w.board]);
    expect(p.entities.get(w.ben)!.facts["a:name"]).toBe("Ben, edit 2");
  });

  it("a platform that ignores If-Match (one that does not check it) answers the conditional patch 200: written once, the header sent", async () => {
    const { picker, p, w } = await setup({ ifMatch: false });
    const before = p.etagOf(w.ben);
    expect(await outcome(addReference(picker, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    expect(patches(p)).toHaveLength(1);
    expect(patches(p)[0]!.headers["if-match"]).toBe(before);
    expect(memberOf(p, w.ben)).toEqual([w.owners, w.board]);
  });
});

describe("the ETag the production edge serves", () => {
  const TAG = `"sha256:${"62ac8c909f3875c5cc78feb5a7cf08646ce951894bdff29c37653f6ce76d438c"}"`;
  it("a strong tag is sent as it is; W/ before the platform's own tag form gives that tag; any other weak tag, or a malformed one, gives nothing", () => {
    expect(conditionFromEtag(TAG)).toBe(TAG);
    expect(conditionFromEtag(`W/${TAG}`)).toBe(TAG);
    expect(conditionFromEtag('W/"sha256:62ac"')).toBeNull();
    expect(conditionFromEtag('W/"v7"')).toBeNull();
    expect(conditionFromEtag(`W/${TAG.toUpperCase()}`)).toBeNull();
    expect(conditionFromEtag("sha256:abc")).toBeNull();
    expect(conditionFromEtag("")).toBeNull();
  });

  it("a weak tag that is not the platform's own form is 'not known yet', with nothing sent", async () => {
    const { picker, p, w } = await setup();
    const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await p.fetch(url, init);
      if (!new URL(url).pathname.startsWith("/base/e/")) return res;
      const headers = new Headers(res.headers);
      headers.set("etag", 'W/"v7"');
      return new Response(await res.text(), { status: res.status, headers });
    };
    const foreign: ReferencePicker = { ...picker, platform: { origin: picker.platform.origin, fetch } };
    expect(await outcome(addReference(foreign, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("unknown");
    expect(patches(p)).toHaveLength(0);
  });

  it("through the edge, the patch carries the platform's strong tag, and a membership added elsewhere still survives", async () => {
    const { picker, p, w } = await setup();
    const fetch = async (url: string, init?: RequestInit): Promise<Response> => {
      const res = await p.fetch(url, init);
      const etag = res.headers.get("etag");
      if ((init?.method ?? "GET") !== "GET" || !etag) return res;
      const headers = new Headers(res.headers);
      headers.set("etag", `W/${etag}`);
      return new Response(await res.text(), { status: res.status, headers });
    };
    const edge: ReferencePicker = { ...picker, platform: { origin: picker.platform.origin, fetch } };
    p.interleave({ method: "PATCH", prefix: "/lws/r/", nth: 1, run: () => p.edit(w.ben, { "a:memberOf": [{ "@id": w.owners }, { "@id": w.things }] }) });
    const before = p.etagOf(w.ben);
    expect(await outcome(addReference(edge, { vaultId: VAULT, agent: AGENT, carrier: w.ben, field: "a:memberOf", target: w.board }))).toBe("resolved");
    expect(patches(p)).toHaveLength(2);
    expect(patches(p)[0]!.headers["if-match"]).toBe(before);
    expect(patches(p)[1]!.headers["if-match"]).not.toBe(before);
    expect(patches(p)[0]!.headers["if-match"]!.startsWith("W/")).toBe(false);
    expect(patches(p)[1]!.headers["if-match"]!.startsWith("W/")).toBe(false);
    expect(memberOf(p, w.ben)).toEqual([w.owners, w.things, w.board]);
  });
});
