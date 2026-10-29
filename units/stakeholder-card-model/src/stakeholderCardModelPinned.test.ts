// The unit's exports pinned, with a fake host and hand-made fields. The ported tests are in stakeholderCardModel.test.ts and partyName.test.ts.
import { describe, expect, it, vi } from "vitest";
import type { StakeholderCardVocabulary } from "@kaigilb/gilbplatformcode-stakeholder-card-vocabulary";
import type { StakeholderField, StakeholderFieldSets, KindFieldSet } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import type { StakeholderPredicates } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import * as unit from "./index";
import {
  cardFieldOf,
  cardPartyName,
  createWritesNameOnly,
  extraFactEditable,
  factsTheCardKeeps,
  isListedKind,
  kindFieldSetOf,
  kindsUnknownOf,
  legacyShownInNameBox,
  nameOnlyRetypeFacts,
  nameRuleFor,
  packageReferenceFactKeys,
  personKindNamesOf,
  registryFieldsBesideName,
  sessionKindNames,
  sessionKindNamesSettled,
  splitSetFields,
  stakeholderCardState,
  storedValuesOf,
  type CardField,
  type SessionKindsHost,
  type StakeholderCardState,
} from "./stakeholderCardModel";
import { PARTY_NAME_FLOOR, factKeyOfSpelling, partyNameKeys, partyNameOf, partySavePatch } from "./partyName";
import { fieldOfTerm, termName } from "./termFields";

const ORIGIN = "https://ontology.example.test/base";
const field = (writeKey: string | null, over: Partial<StakeholderField> = {}): StakeholderField => ({
  term: `${ORIGIN}/t/${(writeKey ?? "x").replace(/^a:/, "")}`,
  label: "L",
  readKeys: writeKey ? [writeKey, writeKey.replace(/^a:/, "")] : [],
  writeKey,
  writeKeyProblem: null,
  encoding: "inline-literal:text",
  many: false,
  declaredOn: [],
  record: null,
  ...over,
});
const card = (over: Partial<CardField> = {}): CardField => ({
  term: "t", label: null, factKeys: ["a"], slug: "a", writeKey: "a:a", mode: "card-edit", rule: null, shownBecause: null, many: false, ...over,
});
const kindSet = (name: string, fields: StakeholderField[]): KindFieldSet => ({ kind: `${ORIGIN}/t/${name}`, name, label: name, ancestors: [], fields });
const setsOf = (...kinds: KindFieldSet[]): StakeholderFieldSets =>
  ({ kinds: {} as never, byKind: Object.fromEntries(kinds.map((k) => [k.kind, k])), complete: true, incompleteAt: [], unreadable: [] }) as StakeholderFieldSets;
const spelling = (readKeys: string[], writeKey: string | null) => ({ readKeys, writeKey }) as never;
const predicates = {
  name: spelling(["a:name", "name"], "a:name"),
  label: spelling(["a:label", "label"], "a:label"),
} as unknown as StakeholderPredicates;

describe("the export list", () => {
  it("is the source's names and nothing else", () => {
    expect(Object.keys(unit).sort()).toEqual(
      [
        "PARTY_NAME_FLOOR", "cardFieldOf", "cardPartyName", "createWritesNameOnly", "extraFactEditable", "factKeyOfSpelling", "factsTheCardKeeps",
        "fieldOfTerm", "isListedKind", "kindFieldSetOf", "kindsUnknownOf", "legacyShownInNameBox", "nameOnlyRetypeFacts", "nameRuleFor",
        "packageReferenceFactKeys", "partyNameKeys", "partyNameOf", "partySavePatch", "personKindNamesOf", "registryFieldsBesideName",
        "sessionKindNames", "sessionKindNamesSettled", "splitSetFields", "stakeholderCardState", "storedValuesOf", "termName",
      ].sort(),
    );
  });
});

describe("cardFieldOf", () => {
  it("a field with a record of its own is shown, however its write spelling reads", () => {
    const f = cardFieldOf(field("a:memberOf", { record: { type: "t", typeName: null, many: false, fields: [] } }));
    expect(f).toMatchObject({ mode: "shown", rule: null });
    expect(f.shownBecause).toMatch(/record of its own/);
  });
  it("the four ruled references are the package's: held-party is shown, the others are added by its checked write", () => {
    expect(cardFieldOf(field("a:memberOf"))).toMatchObject({ mode: "reference-add", rule: "membership", shownBecause: null });
    expect(cardFieldOf(field("a:actsOnBehalfOf"))).toMatchObject({ mode: "reference-add", rule: "party" });
    expect(cardFieldOf(field("a:preferredChannel"))).toMatchObject({ mode: "reference-add", rule: "contact-term" });
    expect(cardFieldOf(field("a:heldParty"))).toMatchObject({ mode: "shown", rule: "held-party" });
  });
  it("a rule is looked up only for an `a:` spelling", () => {
    expect(cardFieldOf(field("memberOf", { encoding: "inline-literal:text" }))).toMatchObject({ rule: null });
  });
  it("an unruled reference encoding is shown", () => {
    expect(cardFieldOf(field("a:skill", { encoding: "reference:@id" }))).toMatchObject({ mode: "shown", rule: null });
    expect(cardFieldOf(field("a:skill", { encoding: "Reference-Edge" })).mode).toBe("shown");
  });
  it("no single declared encoding, no write spelling, an unaddressable spelling: each is shown with its reason, never guessed", () => {
    expect(cardFieldOf(field("a:x", { encoding: null })).shownBecause).toMatch(/does not guess/);
    expect(cardFieldOf(field(null, { writeKeyProblem: "two spellings" })).shownBecause).toBe("two spellings");
    expect(cardFieldOf(field(null)).shownBecause).toBe("the master names no spelling to write");
    expect(cardFieldOf(field("a:9bad")).shownBecause).toBe("this app cannot address its write spelling a:9bad");
    expect(cardFieldOf(field("owl:sameAs")).shownBecause).toBe("this app cannot address its write spelling owl:sameAs");
  });
  it("a literal is the card's own: its slug is the write spelling without `a:`, its fact keys are the addressable read keys once each", () => {
    const f = cardFieldOf(field("a:name", { readKeys: ["a:name", "name", "label", "a:name", "owl:x", "9z"], many: true }));
    expect(f).toMatchObject({ mode: "card-edit", slug: "name", writeKey: "a:name", many: true, rule: null, shownBecause: null });
    expect(f.factKeys).toEqual(["name", "label"]);
  });
});

describe("kindFieldSetOf", () => {
  it("finds the kind by the type's bare name in any spelling, or null", () => {
    const sets = setsOf(kindSet("Person", []), kindSet("Organization", []));
    expect(kindFieldSetOf(sets, "t:Person")?.name).toBe("Person");
    expect(kindFieldSetOf(sets, `${ORIGIN}/t/Organization`)?.name).toBe("Organization");
    expect(kindFieldSetOf(sets, "Person")?.name).toBe("Person");
    expect(kindFieldSetOf(sets, "t:Building")).toBeNull();
  });
});

describe("isListedKind, kindsUnknownOf", () => {
  it("the kind check is by bare name", () => {
    expect(isListedKind("t:Person", ["Person"])).toBe(true);
    expect(isListedKind(`${ORIGIN}/t/Person`, ["Person"])).toBe(true);
    expect(isListedKind("t:Person", ["Org"])).toBe(false);
    expect(isListedKind("t:Person", [])).toBe(false);
  });
  it("the kinds are not known in 'reading' and 'kinds-not-known' only", () => {
    const states: StakeholderCardState[] = [
      { state: "not-a-stakeholder-kind" }, { state: "reading" }, { state: "kinds-not-known", reason: "x" }, { state: "fields-not-known", reason: "x" },
      { state: "ready", kind: kindSet("P", []), fields: [], complete: true, incompleteAt: [] },
    ];
    expect(states.map(kindsUnknownOf)).toEqual([false, true, true, false, false]);
  });
});

describe("personKindNamesOf", () => {
  const person = kindSet("Person", [field("a:givenName"), field("a:familyName")]);
  const org = kindSet("Organization", [field("a:givenName")]);
  const cardV = (fieldSets: StakeholderFieldSets | null) => ({ fieldSets }) as Pick<StakeholderCardVocabulary, "fieldSets">;
  it("is the kinds whose set holds both name terms, by term; null when the reading holds no field sets", () => {
    expect(personKindNamesOf(cardV(setsOf(person, org)))).toEqual(["Person"]);
    expect(personKindNamesOf(cardV(setsOf(org)))).toEqual([]);
    expect(personKindNamesOf(cardV(null))).toBeNull();
  });
  it("a kind that lists no editable slug for a name term is not a person kind", () => {
    const shown = kindSet("Odd", [field("a:givenName", { encoding: null }), field("a:familyName")]);
    expect(personKindNamesOf(cardV(setsOf(shown)))).toEqual([]);
  });
});

describe("stakeholderCardState", () => {
  const sets = setsOf(kindSet("Person", [field("a:name")]));
  const vocab = (over: Partial<StakeholderCardVocabulary> = {}) =>
    ({ kindNames: ["Person"], kindsComplete: true, fieldSets: sets, fieldSetsRefusal: null, ...over }) as StakeholderCardVocabulary;
  it("reading; kinds not known with the error's message, or the text of anything else, or a default", () => {
    expect(stakeholderCardState("t:Person", { pending: true })).toEqual({ state: "reading" });
    expect(stakeholderCardState("t:Person", { pending: false, error: new Error("503") })).toEqual({ state: "kinds-not-known", reason: "503" });
    expect(stakeholderCardState("t:Person", { pending: false, error: "boom" })).toEqual({ state: "kinds-not-known", reason: "boom" });
    expect(stakeholderCardState("t:Person", { pending: false })).toEqual({ state: "kinds-not-known", reason: "the read did not finish" });
  });
  it("ready, with the kind's fields as the card reads them and the set's completeness", () => {
    const s = stakeholderCardState("t:Person", { pending: false, data: vocab() });
    expect(s.state).toBe("ready");
    if (s.state === "ready") expect(s.fields.map((f) => f.slug)).toEqual(["name"]);
    const part = stakeholderCardState("t:Person", { pending: false, data: vocab({ fieldSets: { ...sets, complete: false, incompleteAt: ["x"] } }) });
    expect(part).toMatchObject({ state: "ready", complete: false, incompleteAt: ["x"] });
  });
  it("a listed kind without field sets, or whose set was not read, is 'fields-not-known' with the reason", () => {
    expect(stakeholderCardState("t:Person", { pending: false, data: vocab({ fieldSets: null, fieldSetsRefusal: "not known yet: x" }) })).toEqual({ state: "fields-not-known", reason: "not known yet: x" });
    expect(stakeholderCardState("t:Person", { pending: false, data: vocab({ fieldSets: null, fieldSetsRefusal: null }) })).toEqual({ state: "fields-not-known", reason: "the field sets were not read" });
    expect(stakeholderCardState("t:Person", { pending: false, data: vocab({ fieldSets: setsOf() }) })).toEqual({
      state: "fields-not-known",
      reason: "the master lists Person as a stakeholder kind, and its field set was not read",
    });
  });
  it("a type that is not listed is not a stakeholder kind", () => {
    expect(stakeholderCardState("t:Building", { pending: false, data: vocab() })).toEqual({ state: "not-a-stakeholder-kind" });
  });
});

describe("storedValuesOf", () => {
  it("collects display strings under every fact key, once, in order: strings, `@id` objects, other values as JSON; blanks left out", () => {
    const f = card({ factKeys: ["a", "b"] });
    const facts = { a: ["x", { "@id": "https://h.example.test/e/1" }, 7, "  ", "x"], b: "y", c: "z" } as never;
    expect(storedValuesOf(f, facts)).toEqual(["x", "https://h.example.test/e/1", "7", "y"]);
    expect(storedValuesOf(f, { a: null } as never)).toEqual([]);
    expect(storedValuesOf(card({ factKeys: ["a"] }), { b: "q" })).toEqual([]);
  });
});

describe("splitSetFields", () => {
  const f = card({ factKeys: ["a", "b"], slug: "a" });
  it("a field with only its own slug filled is editable; a field of another mode goes to the others", () => {
    const shown = card({ mode: "shown", slug: null, factKeys: ["z"] });
    const r = splitSetFields([f, shown], { a: "1" });
    expect(r.editable).toEqual([f]);
    expect(r.other).toEqual([shown]);
  });
  it("a value held under another spelling makes it shown, with that spelling in the reason", () => {
    const r = splitSetFields([f], { b: "1" });
    expect(r.editable).toEqual([]);
    expect(r.other[0]).toMatchObject({ mode: "shown", shownBecause: "its value is held under b, and the card writes only a" });
  });
  it("more than one value under the slug makes it shown; one value in a list stays editable; a blank is not filled", () => {
    expect(splitSetFields([f], { a: ["1", "2"] as never }).other[0]!.shownBecause).toBe("it holds several values, and the card edits one value");
    expect(splitSetFields([f], { a: ["1"] as never }).editable).toEqual([f]);
    expect(splitSetFields([f], { b: "  " }).editable).toEqual([f]);
    expect(splitSetFields([f], { b: [] as never }).editable).toEqual([f]);
  });
  it("a card-edit field with no slug goes to the others", () => {
    const noSlug = card({ slug: null });
    expect(splitSetFields([noSlug], {}).other).toEqual([noSlug]);
  });
});

describe("the package's reference fields, and what a card keeps while the kinds are not known", () => {
  it("packageReferenceFactKeys is the names of the package's rules", () => {
    expect([...packageReferenceFactKeys()].sort()).toEqual(["actsOnBehalfOf", "heldParty", "memberOf", "preferredChannel"]);
  });
  const reading: StakeholderCardState = { state: "reading" };
  it("extraFactEditable: never on a ready card; by name while unknown; always otherwise", () => {
    const ready: StakeholderCardState = { state: "ready", kind: kindSet("P", []), fields: [], complete: true, incompleteAt: [] };
    expect(extraFactEditable("phone", false, ready)).toBe(false);
    expect(extraFactEditable("phone", false, reading)).toBe(true);
    expect(extraFactEditable("phone", true, reading)).toBe(false);
    expect(extraFactEditable("memberOf", false, reading)).toBe(false);
    expect(extraFactEditable("memberOf", true, { state: "fields-not-known", reason: "x" })).toBe(true);
    expect(extraFactEditable("custom", false, reading, new Set(["custom"]))).toBe(false);
  });
  it("factsTheCardKeeps: the reference-named facts present, only while unknown; an own key set may be given", () => {
    expect(factsTheCardKeeps(reading, { memberOf: "a", phone: "1", heldParty: "h" })).toEqual(["memberOf", "heldParty"]);
    expect(factsTheCardKeeps({ state: "not-a-stakeholder-kind" }, { memberOf: "a" })).toEqual([]);
    expect(factsTheCardKeeps(reading, { phone: "1", memberOf: "a" }, new Set(["phone"]))).toEqual(["phone"]);
  });
});

describe("cardPartyName", () => {
  const ready = (editable = true): { state: StakeholderCardState; vocab: StakeholderCardVocabulary } => ({
    state: { state: "ready", kind: kindSet("P", []), fields: [], complete: true, incompleteAt: [] },
    vocab: { kindNames: ["P"], kindsComplete: true, fieldSetsRefusal: null, fieldSets: { ...setsOf(), kinds: { predicates } as never } } as StakeholderCardVocabulary,
  });
  it("ready and the name field offered: the name slot is its slug, the rule the session's keys", () => {
    const r = ready();
    const out = cardPartyName(r.state, r.vocab, { name: "Ann" }, ["name"], false);
    expect(out).toEqual({ nameSlot: "name", name: "Ann", rule: { keys: { name: "name", legacy: ["label"] } }, notKnownYet: false });
  });
  it("ready and the name field not editable: no name slot, the party rule still applies", () => {
    const r = ready();
    expect(cardPartyName(r.state, r.vocab, { name: "Ann" }, [], false)).toMatchObject({ nameSlot: null, name: "Ann", notKnownYet: false, rule: { keys: { name: "name" } } });
  });
  it("a stakeholder kind whose fields are not known: bound to the name home when held there, else shown and 'not known yet'", () => {
    const s: StakeholderCardState = { state: "fields-not-known", reason: "x" };
    expect(cardPartyName(s, undefined, { name: "Ann" }, [], false)).toEqual({ nameSlot: "name", name: "Ann", rule: { keys: PARTY_NAME_FLOOR }, notKnownYet: false });
    expect(cardPartyName(s, undefined, { label: "Ann Berg" }, [], false)).toEqual({ nameSlot: null, name: "Ann Berg", rule: { keys: PARTY_NAME_FLOOR }, notKnownYet: true });
  });
  it("while the kinds are not known: a registry-marked type is a party; any other is saved name-only without retracting the label", () => {
    const s: StakeholderCardState = { state: "reading" };
    expect(cardPartyName(s, undefined, { label: "Ann Berg" }, [], true)).toMatchObject({ nameSlot: null, notKnownYet: true });
    expect(cardPartyName(s, undefined, { label: "Ann Berg" }, [], false)).toEqual({
      nameSlot: "name", name: "Ann Berg", rule: { keys: PARTY_NAME_FLOOR, retractLegacy: false }, notKnownYet: false,
    });
  });
  it("a record not known to be a party that holds a name under its home is saved name-only; one that holds none has no name rule", () => {
    const s: StakeholderCardState = { state: "not-a-stakeholder-kind" };
    expect(cardPartyName(s, undefined, { name: "Ann" }, [], false)).toMatchObject({ nameSlot: "name", rule: { retractLegacy: false } });
    expect(cardPartyName(s, undefined, { name: "  " }, [], false)).toEqual({ nameSlot: null, name: null, rule: null, notKnownYet: false });
    expect(cardPartyName(s, undefined, { label: "x" }, [], false)).toEqual({ nameSlot: null, name: null, rule: null, notKnownYet: false });
  });
});

describe("the session's kinds, through the host", () => {
  const typeSet = { names: ["Person", "Org"], complete: true, types: [] };
  const hostOf = (over: Partial<SessionKindsHost> = {}): SessionKindsHost & { log: string[] } => {
    const log: string[] = [];
    return {
      log,
      cardVocabulary: () => (log.push("card"), undefined),
      typeSet: () => (log.push("set"), undefined),
      fetchTypeSet: async () => (log.push("fetch"), typeSet),
      ...over,
    };
  };
  it("the card's reading first, without asking for the type set", () => {
    const h = hostOf({ cardVocabulary: () => ({ kindNames: ["A"] }) as StakeholderCardVocabulary });
    expect(sessionKindNames(h)).toEqual(["A"]);
    expect(h.log).toEqual([]);
  });
  it("then the type set; null when it holds neither; each asked at the call, in that order", () => {
    const h = hostOf();
    expect(sessionKindNames(h)).toBeNull();
    expect(h.log).toEqual(["card", "set"]);
    expect(sessionKindNames(hostOf({ typeSet: () => typeSet }))).toEqual(["Person", "Org"]);
  });
  it("is read at each call, not once", () => {
    let held: typeof typeSet | undefined;
    const h = hostOf({ typeSet: () => held });
    expect(sessionKindNames(h)).toBeNull();
    held = typeSet;
    expect(sessionKindNames(h)).toEqual(["Person", "Org"]);
  });
  it("settled: held kinds answer at once with no fetch; otherwise the host's fetch answers", async () => {
    const held = hostOf({ typeSet: () => typeSet });
    expect(await sessionKindNamesSettled(held)).toEqual(["Person", "Org"]);
    expect(held.log).not.toContain("fetch");
    const h = hostOf();
    expect(await sessionKindNamesSettled(h)).toEqual(["Person", "Org"]);
    expect(h.log).toEqual(["card", "set", "fetch"]);
  });
  it("settled: a failed fetch, or one past the time, is null; the timer is cleared", async () => {
    expect(await sessionKindNamesSettled(hostOf({ fetchTypeSet: async () => Promise.reject(new Error("down")) }))).toBeNull();
    vi.useFakeTimers();
    try {
      const never = hostOf({ fetchTypeSet: () => new Promise(() => {}) });
      const p = sessionKindNamesSettled(never, 2500);
      await vi.advanceTimersByTimeAsync(2499);
      let done = false;
      void p.then(() => (done = true));
      await vi.advanceTimersByTimeAsync(0);
      expect(done).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      expect(await p).toBeNull();
      expect(vi.getTimerCount()).toBe(0);
      const quick = sessionKindNamesSettled(hostOf(), 10);
      await vi.advanceTimersByTimeAsync(0);
      expect(await quick).toEqual(["Person", "Org"]);
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });
  it("settled: the default wait is 2.5 seconds", async () => {
    vi.useFakeTimers();
    try {
      const p = sessionKindNamesSettled(hostOf({ fetchTypeSet: () => new Promise(() => {}) }));
      await vi.advanceTimersByTimeAsync(2499);
      expect(vi.getTimerCount()).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(await p).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("nameRuleFor, createWritesNameOnly", () => {
  it("a registry entry of the stakeholder package is a party; one with its own name field is generic; else by the session's kinds", () => {
    expect(nameRuleFor("t:Task", { fieldsFrom: "stakeholder-package", nameField: "title" }, null)).toBe("party");
    expect(nameRuleFor("t:Task", { nameField: "title" }, ["Task"])).toBe("generic");
    expect(nameRuleFor("t:Task", null, null)).toBe("unknown");
    expect(nameRuleFor("t:Person", undefined, ["Person"])).toBe("party");
    expect(nameRuleFor("t:Task", undefined, ["Person"])).toBe("generic");
  });
  it("a create writes the name under its home only unless the rule is generic", () => {
    expect(createWritesNameOnly("t:Person", null, ["Person"])).toBe(true);
    expect(createWritesNameOnly("t:Task", null, null)).toBe(true);
    expect(createWritesNameOnly("t:Task", { nameField: "title" }, null)).toBe(false);
  });
});

describe("nameOnlyRetypeFacts", () => {
  it("party: the name moves to its home (the home's value first, else the slot's, else the shown name); the legacy slots are dropped; others stay", () => {
    expect(nameOnlyRetypeFacts({ label: "Old", title: "T", phone: "1" }, "label", null)).toEqual({ name: "Old", title: "T", phone: "1" });
    expect(nameOnlyRetypeFacts({ name: "Home", label: "Old" }, "label", "Shown")).toEqual({ name: "Home" });
    expect(nameOnlyRetypeFacts({ title: "T" }, "title", "Shown")).toEqual({ name: "T" });
    expect(nameOnlyRetypeFacts({ phone: "1" }, "label", "  Shown ")).toEqual({ phone: "1", name: "Shown" });
    expect(nameOnlyRetypeFacts({}, "label", null)).toEqual({});
  });
  it("party: the slot is dropped only when it is `title` or a legacy key; another slot stays", () => {
    expect(nameOnlyRetypeFacts({ nick: "N" }, "nick", null)).toEqual({ name: "N", nick: "N" });
    expect(nameOnlyRetypeFacts({ name: "A", title: "A" }, "name", null)).toEqual({ name: "A", title: "A" });
  });
  it("unknown: nothing is left out", () => {
    expect(nameOnlyRetypeFacts({ label: "Old", title: "T" }, "label", null, "unknown")).toEqual({ name: "Old", label: "Old", title: "T" });
  });
  it("does not change its input", () => {
    const facts = { label: "Old" };
    nameOnlyRetypeFacts(facts, "label", null);
    expect(facts).toEqual({ label: "Old" });
  });
});

describe("registryFieldsBesideName, legacyShownInNameBox", () => {
  const fields = [{ slug: "name" }, { slug: "title" }, { slug: "phone" }];
  it("the registry's own name field is not offered beside the Name box", () => {
    expect(registryFieldsBesideName(fields, "title", "name").map((f) => f.slug)).toEqual(["name", "phone"]);
    expect(registryFieldsBesideName(fields, "name", "name")).toBe(fields);
    expect(registryFieldsBesideName(fields, "title", null)).toBe(fields);
    expect(registryFieldsBesideName(fields, undefined, "name")).toBe(fields);
    expect(registryFieldsBesideName(undefined, "title", "name")).toEqual([]);
  });
  it("a legacy label is the Name box's value, not listed twice, only on the window path while nothing is held under the home", () => {
    const party = { nameSlot: "name", rule: { keys: { name: "name", legacy: ["label"] }, retractLegacy: false } };
    expect(legacyShownInNameBox("label", party, { name: "" })).toBe(true);
    expect(legacyShownInNameBox("label", party, {})).toBe(true);
    expect(legacyShownInNameBox("label", party, { name: "Ann" })).toBe(false);
    expect(legacyShownInNameBox("phone", party, {})).toBe(false);
    expect(legacyShownInNameBox("label", { ...party, nameSlot: null }, {})).toBe(false);
    expect(legacyShownInNameBox("label", { ...party, rule: { keys: party.rule.keys } }, {})).toBe(false);
    expect(legacyShownInNameBox("label", { nameSlot: "name", rule: null }, {})).toBe(false);
  });
});

describe("partyName", () => {
  it("the floor: name first, legacy label, the date it was read", () => {
    expect(PARTY_NAME_FLOOR).toMatchObject({ capturedAt: "2026-10-04T16:11:28Z", name: "name", legacy: ["label"] });
    expect(PARTY_NAME_FLOOR.source).toMatch(/zzqqnotanattr/);
  });
  it("factKeyOfSpelling strips one `a:`", () => {
    expect(factKeyOfSpelling("a:name")).toBe("name");
    expect(factKeyOfSpelling("a:a:name")).toBe("a:name");
    expect(factKeyOfSpelling("name")).toBe("name");
  });
  it("partyNameKeys: the floor without predicates; the master's spellings with them, the name left out of the legacy keys, deduplicated", () => {
    expect(partyNameKeys()).toBe(PARTY_NAME_FLOOR);
    expect(partyNameKeys(null)).toBe(PARTY_NAME_FLOOR);
    expect(partyNameKeys(predicates)).toEqual({ name: "name", legacy: ["label"] });
    const other = { name: spelling(["a:fullName"], "a:fullName"), label: spelling(["a:fullName", "a:nick", "nick"], "a:nick") } as never;
    expect(partyNameKeys(other)).toEqual({ name: "fullName", legacy: ["nick"] });
    // Only one `a:` is stripped: a full IRI spelling stays as a key of its own (the master serves `a:` forms).
    const iri = { name: spelling(["a:name"], "a:name"), label: spelling([`${ORIGIN}/a/label`], null) } as never;
    expect(partyNameKeys(iri)).toEqual({ name: "name", legacy: [`${ORIGIN}/a/label`] });
    const noWrite = { name: spelling([], null), label: spelling([], null) } as never;
    expect(partyNameKeys(noWrite)).toEqual({ name: "name", legacy: ["label"] });
  });
  it("partyNameOf without predicates: the trimmed name, else the trimmed label, else null; never the title", () => {
    expect(partyNameOf(null)).toBeNull();
    expect(partyNameOf(undefined)).toBeNull();
    expect(partyNameOf({ name: " Ann " })).toBe("Ann");
    expect(partyNameOf({ name: "  ", label: " Ann Berg" })).toBe("Ann Berg");
    expect(partyNameOf({ name: 3, label: "Ann" })).toBe("Ann");
    expect(partyNameOf({ title: "Ann" })).toBeNull();
  });
  it("partyNameOf with predicates: the package's readPartyName over the spellings present, trimmed; a blank is null", () => {
    expect(partyNameOf({ name: "Ann", label: "x" }, predicates)).toBe("Ann");
    expect(partyNameOf({ label: " Ann Berg " }, predicates)).toBe("Ann Berg");
    expect(partyNameOf({}, predicates)).toBeNull();
    expect(partyNameOf({ name: "  " }, predicates)).toBeNull();
  });
  it("partySavePatch: sends changes only; never the legacy keys or the title; retracts the label when the name changes", () => {
    const rule = { keys: partyNameKeys(null) };
    expect(partySavePatch({ name: "A", label: "A" }, { name: "B", label: "A", title: "x" }, rule)).toEqual({ name: "B", label: null });
    expect(partySavePatch({ name: "A" }, { name: "A", phone: "1" }, rule)).toEqual({ phone: "1" });
    expect(partySavePatch({ phone: "1" }, { phone: "" }, rule)).toEqual({ phone: null });
    expect(partySavePatch({ name: "A", label: "  " }, { name: "B" }, rule)).toEqual({ name: "B" });
  });
  it("partySavePatch: a fact the editor dropped is retracted only when `retractable` says so; kept facts never", () => {
    const rule = { keys: partyNameKeys(null) };
    expect(partySavePatch({ phone: "1", mail: "m" }, {}, rule)).toEqual({ phone: null, mail: null });
    expect(partySavePatch({ phone: "1", mail: "m" }, {}, rule, { retractable: (k) => k === "phone" })).toEqual({ phone: null });
    expect(partySavePatch({ phone: "1", title: "t", label: "l" }, {}, rule)).toEqual({ phone: null });
    expect(partySavePatch({ phone: "1" }, {}, rule, { keep: new Set(["phone"]) })).toEqual({});
  });
});

describe("termName, fieldOfTerm", () => {
  it("termName: the name from an IRI or CURIE, first letter lower-cased; null when there is none", () => {
    expect(termName("https://ontology.example.test/base/a/email")).toBe("email");
    expect(termName("https://ontology.example.test/base/t/GivenName")).toBe("givenName");
    expect(termName("a:email")).toBe("email");
    expect(termName("a/givenName")).toBe("givenName");
    expect(termName("t/GivenName")).toBe("givenName");
    expect(termName("  a:email ")).toBe("email");
    expect(termName("email")).toBeNull();
    expect(termName("https://x.example.test/base/a/e/")).toBeNull();
    expect(termName("")).toBeNull();
    expect(termName(null)).toBeNull();
    expect(termName(undefined)).toBeNull();
  });
  it("fieldOfTerm: the field whose write spelling names the term first, then the one whose listing IRI does, else null", () => {
    const a = { term: "t/OnlineAccount", slug: "account", label: null, writeKey: "a:account" };
    const b = { term: "t/Account", slug: "acc2", label: null, writeKey: null };
    expect(fieldOfTerm([b, a], "account")).toBe(a);
    expect(fieldOfTerm([b], "account")).toBe(b);
    expect(fieldOfTerm([{ term: "t/Other", slug: null, label: null }], "account")).toBeNull();
    expect(fieldOfTerm([], "account")).toBeNull();
  });
});
