// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/contact/heldContactLabel.s8labels.test.ts`. A kind-of-contact chip on a HELD record is ONE private t:HeldPartyFieldClaim, and nothing else; every write is
// proved by what the in-memory vault holds afterwards.
// Changes: the module mocks of the app's record client, vault sets, find-by-attribute and term slots are replaced by the library's peers running over the fake
// platform of test/fakePlaceStore.ts (a `fetch` stub, test/support.ts) and a module mock of `term-slots`; the hosts are example.test hosts. One case is changed
// (the "no network call" case, see its title) and the refusal case also pins each message.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fake from "../test/fakePlaceStore";
import { setUp, stubNetwork, tearDown } from "../test/support";
vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});

import { listHeldClaimsAbout } from "@kaigilb/gilbplatformcode-held-notes";
import {
  __resetContactLabelVocab,
  addContactLabel,
  assertNeutralLabelFacts,
  contactLabelsOf,
  ownContactLabels,
  ContactLabelError,
  labelClaimFacts,
  removeContactLabel,
  resolveContactLabelVocab,
} from "./heldContactLabel";
import type { CatalogueEntry } from "@kaigilb/gilbplatformcode-contact-kind-model";

afterEach(tearDown);

const { VAULT, store } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
// RuleBaseappSourceIsAdder: the stater is the ADDER's own card, in THEIR vault (not the vault written to).
const STATER = "https://adder.platform.example.test/base/e/vsc-adder";
const claims = () => [...store.entries()].filter(([, e]) => e.type === "t:HeldPartyFieldClaim");
const FRIEND: CatalogueEntry = { id: `${M}/e/relationship-kind-friend`, label: "Friend", order: 5, playableBy: [`${M}/t/Person`], axis: "relationshipKind", own: false };
const INNER: CatalogueEntry = { id: `${M}/e/circle-label-professional-inner-circle`, label: "Professional · Inner Circle", order: 4, playableBy: [], axis: "circleLabel", own: false };

let party: string;
let other: string;
beforeEach(() => {
  setUp();
  stubNetwork();
  fake.resetStore();
  __resetContactLabelVocab();
  party = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Rita Larsen" })}`;
  other = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Walker Hayes" })}`;
});

describe("the claim of one chip", () => {
  it("a relationship kind is exactly: the party, the kind, the stater (the adder's own card), the holder as the tier row's subject, and the private row (claimSubject and the tier stay on the principal)", async () => {
    const v = await resolveContactLabelVocab();
    expect(labelClaimFacts(v, { subject: party, entry: FRIEND, stater: STATER, holder: HOLDER })).toEqual({
      "a:heldParty": { "@id": party },
      "a:relationshipKind": { "@id": FRIEND.id },
      "a:statedBy": { "@id": STATER },
      "a:claimSubject": { "@id": HOLDER },
      "a:visibilityTier": "private",
    });
  });

  it("a circle label is the same shape under its own term", async () => {
    const v = await resolveContactLabelVocab();
    expect(labelClaimFacts(v, { subject: party, entry: INNER, stater: STATER, holder: HOLDER })).toEqual({
      "a:heldParty": { "@id": party },
      "a:circleLabel": { "@id": INNER.id },
      "a:statedBy": { "@id": STATER },
      "a:claimSubject": { "@id": HOLDER },
      "a:visibilityTier": "private",
    });
  });
});

describe("the neutrality guard — a label can never carry access", () => {
  const base = (v: Awaited<ReturnType<typeof resolveContactLabelVocab>>) => labelClaimFacts(v, { subject: party, entry: FRIEND, stater: STATER, holder: HOLDER });
  for (const [name, extra] of [
    ["a circle membership", { "a:audienceRungMember": { "@id": party } }],
    ["a reader group", { "a:readerGroup": { "@id": `${M}/e/g` } }],
    ["a reader that is the contact", { "a:directReader": party }],
    ["a reader that is the holder (no grant predicate at all)", { "a:directReader": HOLDER }],
    ["a writer that is the holder", { "a:directWriter": HOLDER }],
    ["a writer that is the contact", { "a:directWriter": party }],
    ["a vault reader", { "a:vaultReader": party }],
    ["a rung context", { "a:audienceContext": "professional" }],
    ["a find key", { "a:networkFindKey": "x" }],
    ["a claim subject that is the contact", { "a:claimSubject": { "@id": party } }],
    ["a claim subject that is a bare string", { "a:claimSubject": HOLDER }],
    ["a tier that is not private", { "a:visibilityTier": "t:PublicGrantee" }],
    ["any other fact", { "a:note": "x" }],
  ] as [string, Record<string, unknown>][]) {
    it(`refuses ${name}`, async () => {
      const v = await resolveContactLabelVocab();
      expect(() => assertNeutralLabelFacts({ ...base(v), ...extra } as never, v, HOLDER)).toThrow(ContactLabelError);
    });
  }
  it("refuses a claim with no private row (the row is what keeps a first read grant from exposing it)", async () => {
    const v = await resolveContactLabelVocab();
    const { ["a:visibilityTier"]: _t, ...rest } = base(v);
    expect(() => assertNeutralLabelFacts(rest as never, v, HOLDER)).toThrow(/private/);
  });
  it("accepts the one shape it writes", async () => {
    const v = await resolveContactLabelVocab();
    expect(() => assertNeutralLabelFacts(base(v) as never, v, HOLDER)).not.toThrow();
  });
});

describe("adding and removing a chip, proved by the vault", () => {
  it("adds ONE claim of type HeldPartyFieldClaim, with the private row, and writes nothing else", async () => {
    const before = new Map([...store.entries()].map(([k, v]) => [k, JSON.stringify(v)]));
    const res = await addContactLabel({ vaultId: VAULT, subject: party, entry: FRIEND, existing: [], stater: STATER, holder: HOLDER });
    expect(res.kind).toBe("create");
    expect(claims().length).toBe(1);
    const [, c] = claims()[0]!;
    expect(c.facts["a:visibilityTier"]).toBe("private");
    expect(c.facts["a:relationshipKind"]).toEqual({ "@id": FRIEND.id });
    // The party's record and every other entity are byte-unchanged: a label is not an edit of the contact.
    for (const [k, v] of before) expect(JSON.stringify(store.get(k))).toBe(v);
    expect(store.size).toBe(before.size + 1);
    expect(fake.patchRecord).not.toHaveBeenCalled();
    expect(fake.deleteRecord).not.toHaveBeenCalled();
  });

  it("a label already on the contact is not written twice", async () => {
    const first = await addContactLabel({ vaultId: VAULT, subject: party, entry: FRIEND, existing: [], stater: STATER, holder: HOLDER });
    expect(first.kind).toBe("create");
    const v = await resolveContactLabelVocab();
    const existing = contactLabelsOf(await listHeldClaimsAbout(VAULT, party), v, party);
    const again = await addContactLabel({ vaultId: VAULT, subject: party, entry: FRIEND, existing, stater: STATER, holder: HOLDER });
    expect(again.kind).toBe("none");
    expect(claims().length).toBe(1);
  });

  it("two different labels are two claims; removing one deletes only that one", async () => {
    await addContactLabel({ vaultId: VAULT, subject: party, entry: FRIEND, existing: [], stater: STATER, holder: HOLDER });
    const v = await resolveContactLabelVocab();
    const one = contactLabelsOf(await listHeldClaimsAbout(VAULT, party), v, party);
    await addContactLabel({ vaultId: VAULT, subject: party, entry: INNER, existing: one, stater: STATER, holder: HOLDER });
    expect(claims().length).toBe(2);
    const both = contactLabelsOf(await listHeldClaimsAbout(VAULT, party), v, party);
    expect(both.map((c) => c.axis).sort()).toEqual(["circleLabel", "relationshipKind"]);
    await removeContactLabel(VAULT, [both.find((c) => c.axis === "relationshipKind")!]);
    expect(claims().length).toBe(1);
    expect(claims()[0]![1].facts["a:circleLabel"]).toEqual({ "@id": INNER.id });
  });

  it("refuses to write without a vault, a stater, a holder, or a party", async () => {
    for (const [bad, said] of [
      [{ vaultId: "" }, /no vault named/],
      [{ stater: "" }, /no stater/],
      [{ holder: "" }, /no signed-in holder/],
      [{ subject: "" }, /about no one/],
    ] as const) {
      const args = { vaultId: VAULT, subject: party, entry: FRIEND, existing: [], stater: STATER, holder: HOLDER };
      await expect(addContactLabel({ ...args, ...bad })).rejects.toThrow(said);
      await expect(addContactLabel({ ...args, ...bad })).rejects.toThrow(ContactLabelError);
    }
    expect(claims().length).toBe(0);
  });

  it("makes no call of its own beyond the one create: no membership route, no grant route (changed from the source: the real client sends the create over fetch, so the test pins the routes instead of 'no call')", async () => {
    const vocab = await resolveContactLabelVocab();
    const spy = globalThis.fetch as unknown as { mockClear(): void; mock: { calls: Array<[unknown, RequestInit | undefined]> } };
    spy.mockClear();
    await addContactLabel({ vaultId: VAULT, subject: party, entry: INNER, existing: [], stater: STATER, holder: HOLDER });
    expect(vocab.visibilityTier).toBe("a:visibilityTier");
    const calls = spy.mock.calls.map(([u, i]) => `${i?.method ?? "GET"} ${new URL(String(u)).pathname}`);
    expect(calls).toEqual([`POST /lws/vault/${encodeURIComponent(VAULT)}/c`]);
  });
});

describe("reading a contact's chips", () => {
  it("lists the chips about THIS contact whoever stated them; the viewer's OWN are the ones whose claim subject is their principal, whoever stated them; another kind of held claim is not a chip", async () => {
    const v = await resolveContactLabelVocab();
    await addContactLabel({ vaultId: VAULT, subject: party, entry: FRIEND, existing: [], stater: STATER, holder: HOLDER });
    await addContactLabel({ vaultId: VAULT, subject: other, entry: INNER, existing: [], stater: STATER, holder: HOLDER });
    // a held skill claim about the same contact; a chip the viewer wrote earlier (stated by a vault card); and another member's chip
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:skill": { "@id": `${M}/t/Nursing` }, "a:statedBy": { "@id": STATER } });
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:circleLabel": { "@id": INNER.id }, "a:statedBy": { "@id": `${VAULT}/e/vsc-oldvaultcard` }, "a:claimSubject": { "@id": HOLDER } });
    fake.seed("t:HeldPartyFieldClaim", { "a:heldParty": { "@id": party }, "a:relationshipKind": { "@id": FRIEND.id }, "a:statedBy": { "@id": STATER }, "a:claimSubject": { "@id": "https://id.platform.example.test/base/p/someone-else" } });
    const all = contactLabelsOf(await listHeldClaimsAbout(VAULT, party), v, party);
    expect(all.map((c) => [c.axis, c.entry])).toEqual([["relationshipKind", FRIEND.id], ["circleLabel", INNER.id], ["relationshipKind", FRIEND.id]]);
    const mine = ownContactLabels(all, HOLDER);
    expect(mine.map((c) => [c.axis, c.entry])).toEqual([["relationshipKind", FRIEND.id], ["circleLabel", INNER.id]]);
    expect(mine[0]!.statedBy).toEqual([STATER]); // a new chip: the adder's card is the source ...
    expect(mine[0]!.claimSubject).toEqual([HOLDER]); // ... and the principal is whose it is
    expect(mine[1]!.statedBy).toEqual([`${VAULT}/e/vsc-oldvaultcard`]); // the old chip is still the viewer's
    expect(ownContactLabels(all, null)).toEqual([]);
    // the viewer's card is not the match: a chip is no one's by its source
    expect(ownContactLabels(all, STATER)).toEqual([]);
  });
});
