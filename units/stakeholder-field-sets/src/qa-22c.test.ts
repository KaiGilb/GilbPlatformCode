// Ported from `gilb-stakeholders` `test/qa-c214-22c.test.ts` at 0a261488: 3 of its 4 tests (Q4 reads the app's cached vocabulary, which is not
// in this unit). Gap tests of the carrier read:
//
//   Q1  a consumer fetch that writes onto the init it was handed must not change what a later, separate source sends (the init was once one
//       module-level object; each read now gets a fresh one, and this test pins that)
//   Q2  the walk mode checks back too
//   Q3  a binding whose FIRST segment is the retired spelling still asks one narrowed request and finds the carriers stored under the
//       current spelling
import { describe, it, expect } from "vitest";
import { masterSource, type TermFetch } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "./fieldSets";
import { fixtureMaster, RIG, t } from "../test/support";

const fieldsOf = (sets: Awaited<ReturnType<typeof resolveFieldSets>>, kind: string) => sets.byKind[t(kind)]!.fields.map((f) => f.term);

describe("Q1: a consumer that writes onto the init it was handed", () => {
  it("a header one source's fetch adds does not ride on a later, separate source's reads", async () => {
    const m = fixtureMaster();
    // A host fetch that passes init on, as the contract asks, and adds its own header by writing
    // onto the object it received (a common wrapper shape).
    const adding: TermFetch = (u, init) => {
      if (init) (init as { headers?: Record<string, string> }).headers = { "x-app-a": "token-a" };
      return m.fetch(u, init);
    };
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: adding }));
    // A second source in the same process, with a fetch that adds nothing.
    const m2 = fixtureMaster();
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m2.fetch }));
    expect(m2.inits.every((i) => i?.cache === "no-cache")).toBe(true);
    expect(m2.inits.some((i) => i && "headers" in i)).toBe(false);
  });
});

describe("Q2: the walk checks back as well", () => {
  it("every read of carriers: 'walk' is sent with cache no-cache", async () => {
    const m = fixtureMaster();
    await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch, carriers: "walk" }));
    const listing = m.requested.map((u, i) => [u, m.inits[i]] as const).filter(([u]) => u.includes("/base/vocab?"));
    expect(listing.length).toBeGreaterThan(1);
    expect(listing.every(([, i]) => i?.cache === "no-cache")).toBe(true);
  });
});

describe("Q3: a binding that lists its retired spelling first", () => {
  it("asks once, by the first segment, and still finds the carriers under the current spelling", async () => {
    const m = fixtureMaster();
    const at = `${RIG}/base/a/fieldOf`;
    const doc = m.docs.get(at) as Record<string, unknown>;
    expect(doc).toBeTruthy();
    m.docs.set(at, { ...doc, "a:predicateAttribute": "a:fieldOfOld|a:fieldOf", "a:deprecatedNotation": "a:fieldOfOld" });
    const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    // The declarations listing only, not the named type reads.
    const listing = m.requested.filter((u) => u.includes("/base/vocab?") && !new URL(u).searchParams.has("type"));
    expect(listing).toEqual([`${RIG}/base/vocab?status=all&carries=a%3AfieldOfOld&limit=100`]);
    expect(fieldsOf(sets, "Person")).toEqual([t("Email"), t("Name"), t("PlanguageLevel")]);
  });
});
