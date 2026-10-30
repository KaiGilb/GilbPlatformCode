// @vitest-environment jsdom
// Ported, at the hook: the save assertions of the source's `RecordDetail.carrier` (12 cases), `RecordDetail.objectFact` (the save
// cases) and `RecordDetail.crossAppFact` (6 cases, 10 tests), and the party-save cases of `RecordDetail.stakeholderCard.c214`.
// The source drives them through the whole record screen; here `useUpdateRecord` is handed what that screen handed it (the record,
// and the facts map the editor held after the person's edit) and every assertion stays on THE TRANSMITTED DOCUMENT: the bytes
// handed to `fetch`, through the real `lws-records` `patchRecord`, over a fake platform (test/support.ts). Nothing is spied.
// What the screen did (typing into a box, tabbing out, the notice it drew) is left out and listed in the README.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { RecordConflictError, type BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { typeUri } from "@kaigilb/gilbplatformcode-record-types";
import { PARTY_NAME_FLOOR, type PartySaveRule } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { listRecordRefs, purgeWorkingSet } from "@kaigilb/gilbplatformcode-working-set-store";
import {
  CARRIER_ONLY_SLUGS,
  CARRIER_PRESERVE_SLUGS,
  CarrierRenameRefusedError,
  OWN_SAVE_WAIT_MS,
  RECORD_UPDATE_KEY,
  TAG_CARRIER_SLUGS,
  TAG_QUALIFIER_SLUGS,
  factsAfterPatch,
  latestCachedRecord,
  recordSavesSettled,
  useUpdateRecord,
  type UpdateRecordVars,
} from "./index";
import { APEX, VAULT_ORIGIN, fakePlatform, gate, setUp, tearDown } from "../test/support";

const VID = "vault-1";

beforeEach(() => setUp());
afterEach(async () => {
  vi.useRealTimers();
  await purgeWorkingSet();
  tearDown();
});

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
const wrap = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;

type World = ReturnType<typeof fakePlatform>;
/** Every PATCH body put on the wire, parsed, in order. */
const bodies = (w: World) => w.patches().map((p) => p.body as Record<string, unknown>);
/** The merged view of every attribute transmitted across all PATCHes. */
const transmitted = (w: World) => Object.assign({}, ...bodies(w)) as Record<string, unknown>;
const keys = (w: World) => Object.keys(transmitted(w));

const rec = (over: Partial<BaseRecord> & { id: string }): BaseRecord => ({ typeUri: typeUri("Note"), facts: {}, opaqueFacts: [], etag: '"sha256:aa"', ...over });

/** Runs one save; resolves with what the mutation gave or threw. */
async function save(qc: QueryClient, vars: UpdateRecordVars, vaultId = VID) {
  const h = renderHook(() => useUpdateRecord(vaultId), { wrapper: wrap(qc) });
  let value: { etag: string | null } | undefined;
  let error: unknown;
  await act(async () => {
    try {
      value = await h.result.current.mutateAsync(vars);
    } catch (e) {
      error = e;
    }
  });
  return { value, error };
}
const seedList = (qc: QueryClient, records: BaseRecord[], vaultId = VID) =>
  qc.setQueryData(recordsKey(vaultId), { pages: [{ records: records.map((r) => ({ ...r, updatedAt: 1 })), total: records.length, complete: true, pageSize: 50, offset: 0 }], pageParams: [0] });
const listRow = (qc: QueryClient, id: string, vaultId = VID) =>
  (qc.getQueryData<{ pages: { records: BaseRecord[] }[] }>(recordsKey(vaultId))?.pages[0]?.records ?? []).find((r) => r.id === id);

// ── carrier (ported: RecordDetail.carrier.test.tsx, P0..P7) ──────────────────────────────────────────────────────────
// A step-shaped record carrying BOTH fields named in the requirement. `readRecord` strips exactly one `a:`, so a vault-served
// `a:unitTag` reaches the app as the BARE slug `unitTag`.
const stepRecord = (overrides: Record<string, string> = {}): BaseRecord =>
  rec({ id: "vdc-step1", facts: { title: "Establish the Value", unitTag: "vdc-step1", tagScope: "KaiZen", ...overrides } });
/** What the editor holds after the person edits the title: the record's own facts, the title changed. */
const editedTitle = (r: BaseRecord) => {
  // The editor admits only bare slugs; a colon-bearing served key (`a:unitTag`) never reaches its facts map.
  const held: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.facts)) if (!k.includes(":")) held[k] = v;
  return { ...held, title: "Establish the Value (edited)" };
};

describe("P0 — instrument controls (the file can see a PATCH, its body, and a null)", () => {
  it("CONTROL a merge PATCH to the record is observed and its body read", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    const { error } = await save(newQc(), { record: r, facts: editedTitle(r) });
    expect(error).toBeUndefined();
    expect(w.patches()).toHaveLength(1);
    expect(w.patches()[0]!.method).toBe("PATCH");
    expect(w.patches()[0]!.url).toContain("/lws/r/vdc-step1");
    expect(transmitted(w)["a:title"]).toBe("Establish the Value (edited)");
  });

  it("CONTROL a retraction reaches the wire as an explicit null and this file reads it", async () => {
    const w = fakePlatform();
    const r = stepRecord({ phone: "555-1234" });
    await save(newQc(), { record: r, facts: { ...r.facts, phone: "" } });
    expect(transmitted(w)).toHaveProperty("a:phone", null);
  });
});

describe("P1 — an in-place RENAME of a served carrier is REFUSED", () => {
  it("a new value over a served `unitTag` is refused with CarrierRenameRefusedError and NOTHING is sent", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, unitTag: "vdc-step9-RENAMED" } });
    expect(error).toBeInstanceOf(CarrierRenameRefusedError);
    expect(w.seen).toEqual([]);
    const e = error as CarrierRenameRefusedError;
    expect(e.slug).toBe("unitTag");
    expect(e.served).toBe("vdc-step1");
    expect(e.attempted).toBe("vdc-step9-RENAMED");
    expect(e.name).toBe("CarrierRenameRefusedError");
  });

  it("the same refusal covers `ruleId`, the second member of the carrier set", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    delete r.facts.unitTag;
    r.facts.ruleId = "RuleBasetagCarrierClosedSet";
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, ruleId: "RuleSomethingElse" } });
    expect(error).toBeInstanceOf(CarrierRenameRefusedError);
    expect((error as CarrierRenameRefusedError).slug).toBe("ruleId");
    expect(w.seen).toEqual([]);
  });

  it("and the colon-bearing spelling `a:unitTag` is refused the same way", async () => {
    const w = fakePlatform();
    const r = rec({ id: "c1", facts: { title: "T", "a:unitTag": "one" } });
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, "a:unitTag": "two" } });
    expect(error).toBeInstanceOf(CarrierRenameRefusedError);
    expect(w.seen).toEqual([]);
  });

  it("a rename is judged on the trimmed values: only whitespace around the same tag is no rename", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, unitTag: "  vdc-step1  " } });
    expect(error).toBeUndefined();
    expect(w.patches()).toHaveLength(1);
  });
});

describe("P2 — the sweep cannot null `a:unitTag` off a unit that had it", () => {
  it("a colon-bearing served carrier (the double-prefix shape) is NOT swept to null", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    delete r.facts.unitTag;
    // One strip in readRecord leaves the app holding the colon-bearing `a:unitTag`, which the editor's slug regex rejects, so the
    // editor's facts lack it and only the sweep decides its fate.
    r.facts["a:unitTag"] = "vdc-step1";
    await save(newQc(), { record: r, facts: editedTitle(r) });
    expect(w.patches()).toHaveLength(1);
    expect(keys(w)).not.toContain("a:a:unitTag");
    expect(keys(w)).not.toContain("a:unitTag");
  });
});

describe("P3 — the sweep cannot null `a:tagScope` off a unit that had it", () => {
  it("a colon-bearing served `tagScope` is NOT swept to null (it is a qualifier, not a carrier, and is guarded all the same)", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    delete r.facts.tagScope;
    r.facts["a:tagScope"] = "KaiZen";
    await save(newQc(), { record: r, facts: editedTitle(r) });
    expect(keys(w)).not.toContain("a:a:tagScope");
    expect(keys(w)).not.toContain("a:tagScope");
  });
});

describe("P4 — lawful RELEASE is preserved (the guard must not merely loosen)", () => {
  it("CLEARING the carrier still transmits an explicit null (release via the carrier stays lawful)", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, unitTag: "" } });
    expect(error).toBeUndefined();
    expect(transmitted(w)).toHaveProperty("a:unitTag", null);
  });

  it("SETTING a carrier on a unit that had none is lawful", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    delete r.facts.unitTag;
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, unitTag: "vdc-new" } });
    expect(error).toBeUndefined();
    expect(transmitted(w)["a:unitTag"]).toBe("vdc-new");
  });

  it("an ordinary edit on a unit with no carrier goes through", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    delete r.facts.unitTag;
    await save(newQc(), { record: r, facts: editedTitle(r) });
    expect(transmitted(w)["a:title"]).toBe("Establish the Value (edited)");
  });
});

describe("P5 — an ordinary edit still round-trips both fields untouched", () => {
  it("editing the title leaves `a:unitTag` and `a:tagScope` at their served values", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    await save(newQc(), { record: r, facts: editedTitle(r) });
    const t = transmitted(w);
    expect(t["a:unitTag"]).toBe("vdc-step1");
    expect(t["a:tagScope"]).toBe("KaiZen");
    expect(t["a:title"]).toBe("Establish the Value (edited)");
  });

  it("a NON-carrier extra field is still freely renameable: the guard is carrier-scoped", async () => {
    const w = fakePlatform();
    const r = stepRecord({ phone: "555-1234" });
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, phone: "555-9999" } });
    expect(error).toBeUndefined();
    expect(transmitted(w)["a:phone"]).toBe("555-9999");
  });
});

describe("P6 — the refusal is disclosed honestly", () => {
  it("the error says the carrier is frozen at assignment and how to release it, and is not a conflict or a generic failure", async () => {
    fakePlatform();
    const r = stepRecord();
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, unitTag: "vdc-step9-RENAMED" } });
    const e = error as Error;
    expect(e.message).toMatch(/frozen at assignment/);
    expect(e.message).toMatch(/cannot be renamed in place/);
    expect(e.message).toContain('served "vdc-step1"');
    expect(e.message).toContain('edited "vdc-step9-RENAMED"');
    expect(e.message).toContain("Clear the field to release the tag");
    expect(e).not.toBeInstanceOf(RecordConflictError);
  });

  it("the message names the slug once with `a:`, whichever spelling was refused", () => {
    expect(new CarrierRenameRefusedError("unitTag", "a", "b").message.startsWith("a:unitTag is frozen")).toBe(true);
    expect(new CarrierRenameRefusedError("a:unitTag", "a", "b").message.startsWith("a:unitTag is frozen")).toBe(true);
  });

  it("a refused rename rolls the cache back to the record it had and writes nothing into the replica", async () => {
    fakePlatform();
    const qc = newQc();
    const r = stepRecord();
    seedList(qc, [r]);
    await save(qc, { record: r, facts: { ...r.facts, unitTag: "vdc-step9-RENAMED" } });
    expect(listRow(qc, "vdc-step1")!.facts.unitTag).toBe("vdc-step1");
    expect(await listRecordRefs(VID)).toEqual([]);
  });
});

describe("P7 — the generic Data-section write stays a merge PATCH", () => {
  it("issues PATCH application/merge-patch+json and never a PUT", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    await save(newQc(), { record: r, facts: editedTitle(r) });
    for (const s of w.seen) expect(s.method).toBe("PATCH");
    expect(w.patches()[0]!.headers["content-type"]).toBe("application/merge-patch+json");
  });
});

// ── crossAppFact (ported: RecordDetail.crossAppFact.test.tsx, X0..X5) ────────────────────────────────────────────────
const SKOS_EXACT_MATCH = "http://www.w3.org/2004/02/skos/core#exactMatch";
const OWL_SAME_AS = "owl:sameAs";
const ROLE_SOURCE = "role:source";
const FILECTL_BYTE_SIZE = "filectl:byteSize";
/** A record as the app holds one after `readRecord`: ordinary bare slugs, PLUS the foreign predicates another app wrote. */
const foreignRecord = (extra: Record<string, string> = {}): BaseRecord =>
  rec({
    id: "vdc-note1",
    entityUri: `${VAULT_ORIGIN}/base/e/vdc-note1`,
    facts: {
      title: "Design well paths",
      [SKOS_EXACT_MATCH]: "http://data.europa.eu/esco/skill/119535c6",
      [OWL_SAME_AS]: "https://example.org/other#thing",
      [ROLE_SOURCE]: "https://vault.example.test/base/e/src1",
      [FILECTL_BYTE_SIZE]: "4096",
      ...extra,
    },
  });
/** What the editor holds: only the keys it admits (`isAppAddressableSlug`), the title edited. */
const editorOf = (r: BaseRecord, edit: Record<string, string>) => {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(r.facts)) if (/^[A-Za-z][A-Za-z0-9_]*$/.test(k)) out[k] = v;
  return { ...out, ...edit };
};

describe("X0 — instrument control", () => {
  it("CONTROL a merge PATCH is observed at the record's own node and its body read", async () => {
    const w = fakePlatform();
    const r = foreignRecord();
    await save(newQc(), { record: r, facts: editorOf(r, { title: "Design well paths (edited)" }) });
    expect(w.patches()[0]!.method).toBe("PATCH");
    expect(w.patches()[0]!.url).toBe(`${VAULT_ORIGIN}/lws/r/vdc-note1`);
    expect(transmitted(w)["a:title"]).toBe("Design well paths (edited)");
  });
});

describe("X1 — a foreign predicate is never retracted by this write", () => {
  it.each([
    ["skos:exactMatch (full IRI)", SKOS_EXACT_MATCH],
    ["owl:sameAs (CURIE)", OWL_SAME_AS],
    ["role:source (the relation-role plane)", ROLE_SOURCE],
    ["filectl:byteSize (the file-control plane)", FILECTL_BYTE_SIZE],
  ])("editing the title puts NO retraction of %s on the wire", async (_name, slug) => {
    const w = fakePlatform();
    const r = foreignRecord();
    await save(newQc(), { record: r, facts: editorOf(r, { title: "Design well paths (edited)" }) });
    expect(w.patches()).toHaveLength(1);
    // The app cannot address this fact, so it is preserved by OMISSION: the key must not be on the wire AT ALL.
    expect(keys(w)).not.toContain("a:" + slug);
    expect(keys(w)).not.toContain(slug);
  });
});

describe("X2 — preserving a foreign fact does not start asserting it", () => {
  it("its VALUE never reaches the wire", async () => {
    const w = fakePlatform();
    const r = foreignRecord();
    await save(newQc(), { record: r, facts: editorOf(r, { title: "Design well paths (edited)" }) });
    const values = Object.values(transmitted(w)).map((v) => String(v));
    expect(values).not.toContain("http://data.europa.eu/esco/skill/119535c6");
    expect(values).not.toContain("https://example.org/other#thing");
    expect(values).not.toContain("4096");
  });
});

describe("X3 — verb three of the cross-app pickup rule: this app keeps working on a record another app wrote", () => {
  it("its own field lands and the other app's fact is untouched", async () => {
    const w = fakePlatform();
    const r = foreignRecord();
    await save(newQc(), { record: r, facts: editorOf(r, { title: "Design well paths (edited)" }) });
    expect(transmitted(w)["a:title"]).toBe("Design well paths (edited)");
    expect(keys(w).some((k) => k.includes("skos/core#exactMatch"))).toBe(false);
  });
});

describe("X4 — the sweep still retracts what the editor ADMITTED and the save DROPPED", () => {
  it("a dropped ordinary slug is transmitted as an explicit null, not silently omitted", async () => {
    const w = fakePlatform();
    const r = rec({ id: "vdc-note2", facts: { title: "A", body: "gone soon", [SKOS_EXACT_MATCH]: "http://x/1" }, etag: null });
    await save(newQc(), { record: r, facts: { title: "A" } });
    expect(transmitted(w)).toHaveProperty("a:body", null);
    // ...and in the SAME body the foreign fact is still left alone.
    expect(keys(w)).not.toContain("a:" + SKOS_EXACT_MATCH);
  });
});

describe("X5 — the carrier exemption still discriminates on the BARE arm", () => {
  it("a dropped BARE `unitTag` is NOT retracted, though a dropped `body` beside it is", async () => {
    const w = fakePlatform();
    const r = rec({ id: "vdc-note3", facts: { title: "A", body: "gone soon", unitTag: "vdc-step1", tagScope: "KaiZen" }, etag: null });
    await save(newQc(), { record: r, facts: { title: "A" } });
    // A DROP is not a CLEAR: a caller that simply did not carry the key must not free a vault-wide tag name.
    expect(keys(w)).not.toContain("a:unitTag");
    expect(keys(w)).not.toContain("a:tagScope");
    expect(transmitted(w)).toHaveProperty("a:body", null);
  });
});

// ── objectFact (ported: RecordDetail.objectFact.test.tsx, the save cases) ────────────────────────────────────────────
const ALT_LABEL_BY_LANG = "altLabelByLang";
const SANSKRIT_LABEL = "sanskritLabel";
const ENTRY_CONDITION = "entryCondition";
/** A record as the app holds one after `readRecord` coerced an object-valued fact: the stand-in in `facts`, the slug in `opaqueFacts`. */
const objectRecord = (over: Partial<BaseRecord> = {}): BaseRecord =>
  rec({
    id: "obj-note1",
    entityUri: `${VAULT_ORIGIN}/base/e/obj-note1`,
    facts: { title: "Design well paths", body: "an ordinary editable fact", [ALT_LABEL_BY_LANG]: "", [SANSKRIT_LABEL]: "", [ENTRY_CONDITION]: ", " },
    opaqueFacts: [ALT_LABEL_BY_LANG, SANSKRIT_LABEL, ENTRY_CONDITION],
    ...over,
  });

describe("O0 — instrument control", () => {
  it("CONTROL a merge PATCH is observed and its body read", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { ...r.facts, title: "Design well paths (edited)" } });
    expect(w.patches()[0]!.method).toBe("PATCH");
    expect(w.patches()[0]!.url).toContain("/lws/r/obj-note1");
    expect(transmitted(w)["a:title"]).toBe("Design well paths (edited)");
  });
});

describe("O1 — the grid rename never retracts an object-valued fact", () => {
  it.each([
    ["altLabelByLang", ALT_LABEL_BY_LANG],
    ["sanskritLabel", SANSKRIT_LABEL],
    ["entryCondition (a structured array)", ENTRY_CONDITION],
  ])("renaming the row puts NO retraction of %s on the wire", async (_name, slug) => {
    const w = fakePlatform();
    const r = objectRecord();
    // EXACTLY the call an inline rename makes: it spreads the WHOLE `record.facts`, with no slug filter.
    await save(newQc(), { record: r, facts: { ...r.facts, title: "Renamed in the grid" } });
    expect(transmitted(w)["a:title"]).toBe("Renamed in the grid");
    expect(transmitted(w)).not.toHaveProperty(`a:${slug}`, null);
    expect(keys(w)).not.toContain(`a:${slug}`);
  });
});

describe("O2 — the detail autosave never retracts an object-valued fact", () => {
  it("editing the title (the editor's facts, which lack the blank opaque stand-ins) leaves every opaque fact off the wire", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { title: "Design well paths (edited)", body: "an ordinary editable fact" } });
    expect(transmitted(w)["a:title"]).toBe("Design well paths (edited)");
    for (const slug of [ALT_LABEL_BY_LANG, SANSKRIT_LABEL, ENTRY_CONDITION]) expect(keys(w)).not.toContain(`a:${slug}`);
  });
});

describe("O3 — the app publishes no stand-in for a value it never read", () => {
  it("transmits neither the empty string, nor null, nor [object Object]", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { ...r.facts, title: "Renamed" } });
    for (const slug of [ALT_LABEL_BY_LANG, SANSKRIT_LABEL, ENTRY_CONDITION]) {
      expect(Object.prototype.hasOwnProperty.call(transmitted(w), `a:${slug}`)).toBe(false);
    }
    expect(JSON.stringify(transmitted(w))).not.toContain("[object Object]");
  });
});

describe("O4 — a person who edits an opaque field still gets their value written", () => {
  it("the guard keys on UNCHANGED, not on opaque: a typed value reaches the wire", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { ...r.facts, [ALT_LABEL_BY_LANG]: "a deliberate replacement" } });
    expect(transmitted(w)[`a:${ALT_LABEL_BY_LANG}`]).toBe("a deliberate replacement");
    expect(keys(w)).not.toContain(`a:${SANSKRIT_LABEL}`);
  });
});

describe("O5 — a lossy array join is preserved, not overwritten with its fragment", () => {
  it("a non-empty but lossy stand-in is still omitted", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    expect(r.facts[ENTRY_CONDITION]).toBe(", ");
    await save(newQc(), { record: r, facts: { ...r.facts, title: "T" } });
    expect(keys(w)).not.toContain(`a:${ENTRY_CONDITION}`);
    expect(JSON.stringify(transmitted(w))).not.toContain('", "');
  });
});

describe("O6 — readRecord marks what it could not represent, and the save honours exactly that", () => {
  it("a record READ from the platform with object-valued facts is saved without them", async () => {
    // The served document as the platform gives it; the read goes through the real `readRecord` (lws-records).
    const served = {
      label: "Karya",
      approvedBy: { "@id": "base:p/veda-system" },
      [SANSKRIT_LABEL]: { "a:lang": "sa", "a:role": "secondary-label" },
      [ALT_LABEL_BY_LANG]: { ar: ["x"], en: ["manage textile process"] },
      [ENTRY_CONDITION]: [{ text: "the vault grants write" }, { text: "the etag matches" }],
    };
    const w = fakePlatform({ held: { "73j0": { origin: VAULT_ORIGIN, facts: served, etag: '"sha256:z"' } } });
    const { readRecord } = await import("@kaigilb/gilbplatformcode-lws-records");
    const r = (await readRecord("73j0", `${VAULT_ORIGIN}/base/e/73j0`))!;
    expect([...r.opaqueFacts].sort()).toEqual([ALT_LABEL_BY_LANG, ENTRY_CONDITION, SANSKRIT_LABEL].sort());
    await save(newQc(), { record: r, facts: { ...r.facts, label: "Karya renamed" } });
    expect(transmitted(w)["a:label"]).toBe("Karya renamed");
    for (const slug of [SANSKRIT_LABEL, ALT_LABEL_BY_LANG, ENTRY_CONDITION]) expect(keys(w)).not.toContain(`a:${slug}`);
    expect(transmitted(w)).not.toHaveProperty("a:approvedBy", null);
    expect(w.patches()[0]!.headers["if-match"]).toBeUndefined();
  });
});

describe("O7 — an ordinary fact is still retracted (the sweep is narrowed, not deleted)", () => {
  it("a fact the editor HELD and the save DROPPED is still nulled, while the opaque ones are not", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { title: "T" } });
    expect(transmitted(w)).toHaveProperty("a:body", null);
    expect(keys(w)).not.toContain(`a:${ALT_LABEL_BY_LANG}`);
  });

  it("a person who CLEARS an ordinary field still retracts it", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { ...r.facts, body: "" } });
    expect(transmitted(w)).toHaveProperty("a:body", null);
  });
});

describe("O10 — a record reached through a search hit (a different stand-in) cannot have its opaque fact overwritten by a rename", () => {
  it("the fan-out stand-in `[object Object]` on a marked slug is omitted from the rename body", async () => {
    const w = fakePlatform();
    const asRecord = rec({
      id: "s1",
      entityUri: `${VAULT_ORIGIN}/base/e/s1`,
      etag: null,
      facts: { title: "Milk run", [SANSKRIT_LABEL]: "[object Object]" },
      opaqueFacts: [SANSKRIT_LABEL],
    });
    await save(newQc(), { record: asRecord, facts: { ...asRecord.facts, title: "Renamed from a search hit" } });
    expect(transmitted(w)["a:title"]).toBe("Renamed from a search hit");
    expect(keys(w)).not.toContain(`a:${SANSKRIT_LABEL}`);
    expect(JSON.stringify(transmitted(w))).not.toContain("[object Object]");
  });
});

describe("O9 — verb three: another app's structured fact survives this app's edit", () => {
  it("this app edits a record and the other app's structured fact survives untouched", async () => {
    const w = fakePlatform();
    const r = objectRecord();
    await save(newQc(), { record: r, facts: { ...r.facts, title: "App B renamed this" } });
    expect(transmitted(w)["a:title"]).toBe("App B renamed this");
    expect(keys(w)).not.toContain(`a:${SANSKRIT_LABEL}`);
  });
});

// ── the sweep, one rule at a time (new) ──────────────────────────────────────────────────────────────────────────────
describe("the sweep: which dropped facts a save may retract (new, one rule at a time)", () => {
  const dropped = async (facts: Record<string, string>, extra: Partial<UpdateRecordVars> = {}, over: Partial<BaseRecord> = {}) => {
    const w = fakePlatform();
    const r = rec({ id: "sw", etag: null, facts: { title: "A", ...facts }, ...over });
    await save(newQc(), { record: r, facts: { title: "A" }, ...extra });
    return w;
  };

  it("retracts a dropped app-addressable slug", async () => {
    expect(transmitted(await dropped({ phone: "1" }))).toHaveProperty("a:phone", null);
  });
  it.each(["directReader", "directWriter", "readerGroup", "writerGroup", "a:directReader", "a:directWriter", "a:readerGroup", "a:writerGroup"])(
    "never retracts the authorization grant %s (nulling it would revoke a share on the next body edit)",
    async (slug) => {
      const w = await dropped({ [slug]: "someone" });
      expect(keys(w)).not.toContain(slug);
      expect(keys(w)).not.toContain("a:" + slug);
    },
  );
  it.each(["unitTag", "ruleId", "tagScope", "a:unitTag", "a:ruleId", "a:tagScope"])("never retracts the guarded tag attribute %s", async (slug) => {
    const w = await dropped({ [slug]: "x" });
    expect(keys(w).filter((k) => k.endsWith(slug.replace(/^a:/, "")))).toEqual([]);
  });
  it("never retracts a slug the editor cannot address (a foreign predicate, a colon-bearing key)", async () => {
    const w = await dropped({ "skos:exactMatch": "x", "a:other": "y", "has space": "z" });
    expect(keys(w).filter((k) => /skos|other|space/.test(k))).toEqual([]);
  });
  it("never retracts an opaque fact it dropped", async () => {
    const w = await dropped({ ...{ blob: "" } }, {}, { opaqueFacts: ["blob"] });
    expect(keys(w)).not.toContain("a:blob");
  });
  it("never retracts a fact named in `keep`, and never writes it either", async () => {
    const w = fakePlatform();
    const r = rec({ id: "sw2", etag: null, facts: { title: "A", memberOf: "Acme team", phone: "1" } });
    await save(newQc(), { record: r, facts: { title: "B", memberOf: "changed" }, keep: ["memberOf", "phone"] });
    expect(keys(w)).not.toContain("a:memberOf");
    expect(keys(w)).not.toContain("a:phone");
    expect(transmitted(w)["a:title"]).toBe("B");
  });
  it("sends a fact the editor holds that the record does not (a new field)", async () => {
    const w = fakePlatform();
    const r = rec({ id: "sw3", etag: null, facts: { title: "A" } });
    await save(newQc(), { record: r, facts: { title: "A", phone: "5" } });
    expect(transmitted(w)["a:phone"]).toBe("5");
  });
  it("an empty value is an explicit null, a non-empty value is itself", async () => {
    const w = fakePlatform();
    const r = rec({ id: "sw4", etag: null, facts: { title: "A", email: "e" } });
    await save(newQc(), { record: r, facts: { title: "A", email: "" } });
    expect(transmitted(w)["a:email"]).toBeNull();
  });
  it("copies the name field to the label and the title (the cross-app display name) on a non-plan, non-party record", async () => {
    const w = fakePlatform();
    const r = rec({ id: "sw5", etag: null, typeUri: typeUri("NoteDocument"), facts: { label: "Old" } });
    await save(newQc(), { record: r, facts: { label: "New name" } });
    expect(transmitted(w)["a:label"]).toBe("New name");
    expect(transmitted(w)["a:title"]).toBe("New name");
  });
  it("on a Plan record the name is its Tag: nothing is copied into a label, and the write is conditional on the version read", async () => {
    const w = fakePlatform();
    const r = rec({ id: "pl1", typeUri: typeUri("Function"), etag: '"sha256:plan"', facts: { unitTag: "F1", title: "T" } });
    await save(newQc(), { record: r, facts: { unitTag: "F1", title: "T2" } });
    expect(keys(w)).not.toContain("a:label");
    expect(w.patches()[0]!.headers["if-match"]).toBe('"sha256:plan"');
  });
  it("on a Plan record the cache keeps the facts as sent (no copied label)", async () => {
    fakePlatform();
    const qc = newQc();
    const r = rec({ id: "pl2", typeUri: typeUri("Function"), etag: '"sha256:plan"', facts: { unitTag: "F1", body: "x" } });
    seedList(qc, [r]);
    await save(qc, { record: r, facts: { unitTag: "F1", body: "y" } });
    expect(listRow(qc, "pl2")!.facts).toEqual({ unitTag: "F1", body: "y" });
  });
  it("a note's write sends no If-Match (a full-version precondition raced with its own debounce)", async () => {
    const w = fakePlatform();
    const r = rec({ id: "nt1", etag: '"sha256:aa"', facts: { title: "A" } });
    await save(newQc(), { record: r, facts: { title: "B" } });
    expect(w.patches()[0]!.headers["if-match"]).toBeUndefined();
  });
  it("the write goes to the record's own address, or to the base address when it has none", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: rec({ id: "ad1", entityUri: `${VAULT_ORIGIN}/base/e/ad1`, facts: { title: "A" } }), facts: { title: "B" } });
    await save(newQc(), { record: rec({ id: "ad2", facts: { title: "A" } }), facts: { title: "B" } });
    expect(w.patches().map((p) => p.url)).toEqual([`${VAULT_ORIGIN}/lws/r/ad1`, `${APEX}/lws/r/ad2`]);
  });
  it("tells the device's replica: the record is remembered under the vault saved in", async () => {
    fakePlatform();
    await save(newQc(), { record: rec({ id: "ws1", facts: { title: "A" } }), facts: { title: "B" } });
    const refs = await listRecordRefs(VID);
    expect(refs.map((r) => r.id)).toEqual(["ws1"]);
    expect(refs[0]!.typeUri).toBe(typeUri("Note"));
  });
  it("resolves with the ETag the platform gave", async () => {
    fakePlatform({ patch: () => ({ status: 200, etag: '"sha256:new"' }) });
    const { value } = await save(newQc(), { record: rec({ id: "et1", facts: { title: "A" } }), facts: { title: "B" } });
    expect(value).toEqual({ etag: '"sha256:new"' });
  });
});


describe("the sweep on the party arm and the guards the mutation checks found open (new)", () => {
  it.each(["directReader", "directWriter", "readerGroup", "writerGroup"])("a party save never retracts the grant %s it dropped", async (slug) => {
    const w = fakePlatform();
    await save(newQc(), { record: person("gr-" + slug, { name: "Tom", [slug]: "someone" }), facts: { name: "Tom" }, party: RULE });
    expect(keys(w)).not.toContain("a:" + slug);
  });
  it("a party save never retracts a foreign predicate it dropped", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("fp1", { name: "Tom", [SKOS_EXACT_MATCH]: "http://x/1", "owl:sameAs": "y" }), facts: { name: "Tom" }, party: RULE });
    expect(keys(w)).toEqual([]);
  });
  it("a refusal is judged on the trimmed SERVED value too: the same tag with a trailing space served is no rename", async () => {
    const w = fakePlatform();
    const r = stepRecord({ unitTag: "vdc-step1 " });
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, unitTag: "vdc-step1" } });
    expect(error).toBeUndefined();
    expect(w.patches()).toHaveLength(1);
  });
  it("the scope qualifier `tagScope` is guarded against a sweep but NOT frozen: it may be renamed", async () => {
    const w = fakePlatform();
    const r = stepRecord();
    const { error } = await save(newQc(), { record: r, facts: { ...r.facts, tagScope: "Other" } });
    expect(error).toBeUndefined();
    expect(transmitted(w)["a:tagScope"]).toBe("Other");
  });
  it("a record of a type the registry does not know has its name in `title`: the label copy follows it", async () => {
    const w = fakePlatform();
    const qc = newQc();
    const r = rec({ id: "uk1", typeUri: "https://types.example.test/base/t/NoSuchType", facts: { title: "Old" } });
    seedList(qc, [r]);
    await save(qc, { record: r, facts: { title: "Hello" } });
    expect(transmitted(w)["a:label"]).toBe("Hello");
    expect(listRow(qc, "uk1")!.facts.label).toBe("Hello");
  });
  it("the name field of a type the registry does not know is `title`: where title and label differ, the label follows the title", async () => {
    const w = fakePlatform();
    const r = rec({ id: "uk2", typeUri: "https://types.example.test/base/t/NoSuchType", facts: { title: "T", label: "L" } });
    const qc = newQc();
    await save(qc, { record: r, facts: { title: "T", label: "L" } });
    expect(transmitted(w)["a:label"]).toBe("T");
    expect(transmitted(w)["a:title"]).toBe("T");
    expect(listRow(qc, "uk2")!.facts).toEqual({ title: "T", label: "T" });
  });
  it("a record read with served keys hands them to the write (the write asks the vault's description first); a record with none asks nothing", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: { ...rec({ id: "sk1", entityUri: `${VAULT_ORIGIN}/base/e/sk1`, facts: { title: "A" } }), servedKeys: ["title"] }, facts: { title: "B" } });
    expect(w.seen.some((s) => s.method === "GET")).toBe(true);
    const w2 = fakePlatform();
    await save(newQc(), { record: rec({ id: "sk2", entityUri: `${VAULT_ORIGIN}/base/e/sk2`, facts: { title: "A" } }), facts: { title: "B" } });
    expect(w2.seen.map((s) => s.method)).toEqual(["PATCH"]);
  });
  it("a save changes the row of ITS record only: another record's row in the same list is untouched", async () => {
    fakePlatform();
    const qc = newQc();
    const a = rec({ id: "ro1", facts: { title: "A" }, etag: '"a"' });
    const b = rec({ id: "ro2", facts: { title: "B" }, etag: '"b"' });
    seedList(qc, [a, b]);
    await save(qc, { record: a, facts: { title: "A2" } });
    expect(listRow(qc, "ro1")!.facts.title).toBe("A2");
    expect(listRow(qc, "ro2")!.facts.title).toBe("B");
    expect(listRow(qc, "ro2")!.etag).toBe('"b"');
  });
});

// ── the party path (ported: RecordDetail.stakeholderCard.c214, the save assertions) ──────────────────────────────────
const RULE: PartySaveRule = { keys: PARTY_NAME_FLOOR };
const RULE_UNKNOWN_KIND: PartySaveRule = { keys: PARTY_NAME_FLOOR, retractLegacy: false };
const person = (id: string, facts: Record<string, string>, typeName = "Person"): BaseRecord =>
  rec({ id, typeUri: typeUri(typeName), entityUri: `${VAULT_ORIGIN}/base/e/${id}`, facts, etag: '"sha256:0"' });
/** The state of the record after the body is applied (RFC 7386), as the platform stores it. */
const storedAfter = (served: Record<string, string>, w: World) => {
  const body: Record<string, string | null> = {};
  for (const b of bodies(w)) for (const [k, v] of Object.entries(b)) body[k.replace(/^a:/, "")] = v as string | null;
  return { body, stored: factsAfterPatch(served, body) };
};

describe("D1 — a rename reaches the list (T1, T2, T5)", () => {
  it("T1: a person held under the legacy label, renamed: a:name only, a:label null, no a:title key, If-Match the version read; the list shows the new name", async () => {
    const w = fakePlatform();
    const qc = newQc();
    const served = { label: "Tom Gilb", title: "Tom Gilb" };
    const r = person("tg", served);
    seedList(qc, [r]);
    await save(qc, { record: r, facts: { name: "Thomas", label: "Tom Gilb", title: "Tom Gilb" }, party: RULE });
    const raw = bodies(w)[0]!;
    expect(raw["a:name"]).toBe("Thomas");
    expect(raw["a:label"]).toBeNull();
    expect("a:title" in raw).toBe(false);
    expect(Object.keys(raw).sort()).toEqual(["a:label", "a:name"]);
    expect(w.patches()[0]!.headers["if-match"]).toBe('"sha256:0"');
    expect(listRow(qc, "tg")!.facts).toEqual({ title: "Tom Gilb", name: "Thomas" });
    expect(storedAfter(served, w).stored).toEqual({ title: "Tom Gilb", name: "Thomas" });
  });

  it("T2 (control): a person held under a:name, renamed: no a:label and no a:title key", async () => {
    const w = fakePlatform();
    const r = person("tn", { name: "Tom" });
    await save(newQc(), { record: r, facts: { name: "Thomas" }, party: RULE });
    expect(storedAfter({ name: "Tom" }, w).body).toEqual({ name: "Thomas" });
  });

  it("T5: the title is not retracted: after the rename a:title still reads the old value and the label is gone", async () => {
    const w = fakePlatform();
    const served = { label: "Tom Gilb", title: "Tom Gilb" };
    await save(newQc(), { record: person("t5", served), facts: { name: "Thomas", label: "Tom Gilb", title: "Tom Gilb" }, party: RULE });
    const { stored } = storedAfter(served, w);
    expect(stored.title).toBe("Tom Gilb");
    expect(stored.label).toBeUndefined();
  });
});

describe("W3 and D7 — the kept facts and a record not known to be a party", () => {
  it("D7: a memberOf fact the card does not edit is neither re-sent nor retracted on a save of the name (`keep`)", async () => {
    const w = fakePlatform();
    const r = person("org1", { label: "Acme", memberOf: "Acme group" }, "Organization");
    await save(newQc(), { record: r, facts: { name: "Acme AS", label: "Acme" }, party: RULE, keep: ["memberOf"] });
    expect(keys(w)).not.toContain("a:memberOf");
  });

  it("QG1 (control): an Organization held under a:name, renamed: the body is a:name only", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("o1", { name: "Acme" }, "Organization"), facts: { name: "Acme Two" }, party: RULE });
    expect(storedAfter({ name: "Acme" }, w).body).toEqual({ name: "Acme Two" });
  });

  it("QG2: an Organization held under a:name, a save of another fact: the body holds that fact only, no a:label, no a:title", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("o2", { name: "Acme", phone: "1" }, "Organization"), facts: { name: "Acme", phone: "2" }, party: RULE_UNKNOWN_KIND });
    expect(storedAfter({ name: "Acme", phone: "1" }, w).body).toEqual({ phone: "2" });
  });

  it("RB1: a t:Project holding name, label and title, kinds not known, renamed: a:name only, the label is NOT retracted, no a:title", async () => {
    const w = fakePlatform();
    const served = { name: "Alpha", label: "Alpha", title: "Alpha" };
    await save(newQc(), { record: person("pj", served, "Project"), facts: { name: "Beta", label: "Alpha", title: "Alpha" }, party: RULE_UNKNOWN_KIND });
    const { body, stored } = storedAfter(served, w);
    expect(body).toEqual({ name: "Beta" });
    expect(stored.label).toBe("Alpha");
  });

  it("RB1 control: a Person (a party) in the same window still retracts its legacy label", async () => {
    const w = fakePlatform();
    const served = { name: "Tom", label: "Tom Gilb" };
    await save(newQc(), { record: person("pp", served), facts: { name: "Thomas", label: "Tom Gilb" }, party: RULE });
    expect(storedAfter(served, w).body).toEqual({ name: "Thomas", label: null });
  });
});

describe("W5 and the fallback guard (K1..K5, RC1)", () => {
  it("K1: a t:Project holding name, label and title = Alpha, renamed: a:name only; the stored record holds name Beta, label Alpha, title Alpha", async () => {
    const w = fakePlatform();
    const served = { name: "Alpha", label: "Alpha", title: "Alpha" };
    await save(newQc(), { record: person("k1", served, "Project"), facts: { name: "Beta", label: "Alpha", title: "Alpha" }, party: RULE_UNKNOWN_KIND });
    expect(Object.keys(transmitted(w))).toEqual(["a:name"]);
    expect(storedAfter(served, w).stored).toEqual({ name: "Beta", label: "Alpha", title: "Alpha" });
  });

  it("K3: a t:Task holding name and label = Do it, renamed: the body is a:name only; no a:label, no a:title", async () => {
    const w = fakePlatform();
    const served = { name: "Do it", label: "Do it" };
    await save(newQc(), { record: person("k3", served, "Task"), facts: { name: "Done", label: "Do it" }, party: RULE_UNKNOWN_KIND });
    const raw = transmitted(w);
    expect(raw["a:name"]).toBe("Done");
    expect("a:label" in raw).toBe(false);
    expect("a:title" in raw).toBe(false);
  });

  it("K4 (control): a t:Project holding label and title but no a:name, saved with no party rule: the title is written and the label copy runs", async () => {
    const w = fakePlatform();
    const r = person("k4", { label: "Alpha", title: "Alpha" }, "Project");
    await save(newQc(), { record: r, facts: { label: "Alpha", title: "Beta" } });
    const raw = transmitted(w);
    expect(raw["a:title"]).toBe("Beta");
    expect("a:name" in raw).toBe(false);
  });

  it("K5 (control): a t:Person holding name Tom and label Tom Gilb: the rename sends a:name Thomas and a:label null", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("k5", { name: "Tom", label: "Tom Gilb" }), facts: { name: "Thomas", label: "Tom Gilb" }, party: RULE });
    expect(transmitted(w)).toEqual({ "a:name": "Thomas", "a:label": null });
  });

  it("the guard: an email saved on a Person whose set offers no editable name: the body holds the email only", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("g1", { name: "Tom", title: "Dr Tom" }), facts: { name: "Tom", title: "Dr Tom", email: "tom@example.test" }, party: RULE });
    expect(transmitted(w)).toEqual({ "a:email": "tom@example.test" });
  });

  it("RC1 window: a t:Organization holding only label Acme, kinds not known, renamed: a:name only; stored name Acme Two, label Acme", async () => {
    const w = fakePlatform();
    const served = { label: "Acme" };
    await save(newQc(), { record: person("rc1", served, "Organization"), facts: { name: "Acme Two", label: "Acme" }, party: RULE_UNKNOWN_KIND });
    expect(transmitted(w)).toEqual({ "a:name": "Acme Two" });
    expect(storedAfter(served, w).stored).toEqual({ name: "Acme Two", label: "Acme" });
  });

  it("RC1 control: the same record known as a party: a:name and a:label null", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("rc2", { label: "Acme" }, "Organization"), facts: { name: "Acme Two", label: "Acme" }, party: RULE });
    expect(transmitted(w)).toEqual({ "a:name": "Acme Two", "a:label": null });
  });
});

describe("the party path, more (new)", () => {
  it("sends only facts the person changed", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("pm1", { name: "Tom", email: "e", phone: "1" }), facts: { name: "Tom", email: "e", phone: "2" }, party: RULE });
    expect(transmitted(w)).toEqual({ "a:phone": "2" });
  });
  it("a dropped ordinary fact is retracted, a dropped opaque, carrier or grant fact is not", async () => {
    const w = fakePlatform();
    const r = { ...person("pm2", { name: "Tom", note: "n", blob: "", unitTag: "T", directReader: "x" }), opaqueFacts: ["blob"] };
    await save(newQc(), { record: r, facts: { name: "Tom" }, party: RULE });
    expect(transmitted(w)).toEqual({ "a:note": null });
  });
  it("is conditional on the version read; the version is the record's etag, and none is sent when the record holds none", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("pm3", { name: "Tom" }), facts: { name: "T2" }, party: RULE });
    await save(newQc(), { record: { ...person("pm4", { name: "Tom" }), etag: null }, facts: { name: "T2" }, party: RULE });
    expect(w.patches()[0]!.headers["if-match"]).toBe('"sha256:0"');
    expect(w.patches()[1]!.headers["if-match"]).toBeUndefined();
  });
  it("skipEmpty: a party save with nothing left to send sends NO request and resolves with the etag it read", async () => {
    const w = fakePlatform();
    const { value, error } = await save(newQc(), { record: person("pm5", { name: "Tom" }), facts: { name: "Tom" }, party: RULE, skipEmpty: true });
    expect(error).toBeUndefined();
    expect(w.seen).toEqual([]);
    expect(value).toEqual({ etag: '"sha256:0"' });
    expect(await listRecordRefs(VID)).toEqual([]);
  });
  it("without skipEmpty the same save still sends its (empty) patch", async () => {
    const w = fakePlatform();
    await save(newQc(), { record: person("pm6", { name: "Tom" }), facts: { name: "Tom" }, party: RULE });
    expect(w.patches()).toHaveLength(1);
    expect(bodies(w)[0]).toEqual({});
  });
  it("skipEmpty with a record that holds no etag resolves with null", async () => {
    fakePlatform();
    const { value } = await save(newQc(), { record: { ...person("pm7", { name: "Tom" }), etag: null }, facts: { name: "Tom" }, party: RULE, skipEmpty: true });
    expect(value).toEqual({ etag: null });
  });
  it("the replica is told after a party write", async () => {
    fakePlatform();
    await save(newQc(), { record: person("pm8", { name: "Tom" }), facts: { name: "T2" }, party: RULE });
    expect((await listRecordRefs(VID)).map((r) => r.id)).toEqual(["pm8"]);
  });
  it("the cache row of a party save is the party body applied, not the old label copy", async () => {
    fakePlatform();
    const qc = newQc();
    const r = person("pm9", { name: "Tom", label: "Tom Gilb" });
    seedList(qc, [r]);
    await save(qc, { record: r, facts: { name: "Thomas", label: "Tom Gilb" }, party: RULE });
    expect(listRow(qc, "pm9")!.facts).toEqual({ name: "Thomas" });
  });
});

// ── the caches (new) ─────────────────────────────────────────────────────────────────────────────────────────────────
describe("the caches a save keeps in step", () => {
  it("onMutate: the list row shows the new facts at once and keeps the pre-save ETag (a worse ETag mid-edit would give a false 412)", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: () => g.promise });
    const qc = newQc();
    const r = rec({ id: "cm1", facts: { title: "A" }, etag: '"sha256:old"' });
    seedList(qc, [r]);
    const h = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = h.result.current.mutateAsync({ record: r, facts: { title: "B" } });
    });
    await waitFor(() => expect(listRow(qc, "cm1")!.facts.title).toBe("B"));
    expect(listRow(qc, "cm1")!.etag).toBe('"sha256:old"');
    await act(async () => {
      g.release({ status: 200, etag: '"sha256:new"' });
      await p;
    });
  });

  it("onSuccess: the list row and every record read of it carry the facts and the new ETag; no read entry is made", async () => {
    fakePlatform({ patch: () => ({ status: 200, etag: '"sha256:new"' }) });
    const qc = newQc();
    const r = rec({ id: "cm2", facts: { title: "A" }, etag: '"sha256:old"' });
    seedList(qc, [r]);
    qc.setQueryData(["base", "record", "cm2", VAULT_ORIGIN], r);
    qc.setQueryData(["base", "record", "cm2", APEX], null);
    await save(qc, { record: r, facts: { title: "B" } });
    expect(listRow(qc, "cm2")!.etag).toBe('"sha256:new"');
    expect(listRow(qc, "cm2")!.facts.title).toBe("B");
    const read = qc.getQueryData<BaseRecord>(["base", "record", "cm2", VAULT_ORIGIN])!;
    expect(read.etag).toBe('"sha256:new"');
    expect(read.facts.title).toBe("B");
    expect(qc.getQueryData(["base", "record", "cm2", APEX])).toBeNull();
    expect(qc.getQueryCache().findAll({ queryKey: ["base", "record", "cm2"] })).toHaveLength(2);
  });

  it("a record in no list: the save makes the list row (the optimistic stand-in), and a read of another record is untouched", async () => {
    fakePlatform();
    const qc = newQc();
    qc.setQueryData(["base", "record", "other", VAULT_ORIGIN], rec({ id: "other", facts: { title: "same" } }));
    await save(qc, { record: rec({ id: "cm3", facts: { title: "A" } }), facts: { title: "B" } });
    expect(listRow(qc, "cm3")!.facts.title).toBe("B");
    expect(qc.getQueryData<BaseRecord>(["base", "record", "other", VAULT_ORIGIN])!.facts.title).toBe("same");
  });

  it("a conflict (412): the cache is reconciled to what the platform holds NOW, in the list and in the reads, and the save rejects with RecordConflictError", async () => {
    const w = fakePlatform({
      held: { cm4: { origin: VAULT_ORIGIN, facts: { title: "theirs" }, etag: '"sha256:theirs"' } },
      patch: () => ({ status: 412 }),
    });
    const qc = newQc();
    const r = rec({ id: "cm4", entityUri: `${VAULT_ORIGIN}/base/e/cm4`, facts: { title: "A" }, etag: '"sha256:old"' });
    seedList(qc, [r]);
    qc.setQueryData(["base", "record", "cm4", VAULT_ORIGIN], r);
    const { error } = await save(qc, { record: r, facts: { title: "mine" }, party: RULE });
    expect(error).toBeInstanceOf(RecordConflictError);
    await waitFor(() => expect(listRow(qc, "cm4")!.facts.title).toBe("theirs"));
    expect(listRow(qc, "cm4")!.etag).toBe('"sha256:theirs"');
    await waitFor(() => expect(qc.getQueryData<BaseRecord>(["base", "record", "cm4", VAULT_ORIGIN])!.facts.title).toBe("theirs"));
    expect(w.readUrls()).toEqual([`${VAULT_ORIGIN}/lws/r/cm4`]);
    expect(await listRecordRefs(VID)).toEqual([]);
  });

  it("a conflict on a record the platform no longer gives leaves the optimistic row as it is (nothing to reconcile to)", async () => {
    fakePlatform({ patch: () => ({ status: 412 }) });
    const qc = newQc();
    const r = rec({ id: "cm5", entityUri: `${VAULT_ORIGIN}/base/e/cm5`, facts: { phone: "1" } });
    seedList(qc, [r]);
    const { error } = await save(qc, { record: r, facts: { phone: "mine" }, party: RULE });
    expect(error).toBeInstanceOf(RecordConflictError);
    await act(async () => {});
    expect(listRow(qc, "cm5")!.facts.phone).toBe("mine");
  });

  it("any other error (500): the list row is put back as it was, and the error is thrown", async () => {
    fakePlatform({ patch: () => ({ status: 500 }) });
    const qc = newQc();
    const r = rec({ id: "cm6", facts: { title: "A" }, etag: '"sha256:old"' });
    seedList(qc, [r]);
    const { error } = await save(qc, { record: r, facts: { title: "B" } });
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(RecordConflictError);
    await waitFor(() => expect(listRow(qc, "cm6")!.facts.title).toBe("A"));
    expect(listRow(qc, "cm6")!.etag).toBe('"sha256:old"');
    expect(await listRecordRefs(VID)).toEqual([]);
  });

  it("an error on a record that had no list row: nothing to put back (the stand-in stays, as the source leaves it)", async () => {
    fakePlatform({ patch: () => ({ status: 500 }) });
    const qc = newQc();
    await save(qc, { record: rec({ id: "cm7", facts: { title: "A" } }), facts: { title: "B" } });
    await act(async () => {});
    expect(listRow(qc, "cm7")!.facts.title).toBe("B");
  });

  it("the lists of other vaults are not touched", async () => {
    fakePlatform();
    const qc = newQc();
    const r = rec({ id: "cm8", facts: { title: "A" } });
    seedList(qc, [r], "vault-2");
    await save(qc, { record: r, facts: { title: "B" } });
    expect(listRow(qc, "cm8", "vault-2")!.facts.title).toBe("A");
  });

  it("each save runs under RECORD_UPDATE_KEY", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: () => g.promise });
    const qc = newQc();
    const h = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = h.result.current.mutateAsync({ record: rec({ id: "cm9", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(1));
    await act(async () => {
      g.release({ status: 200 });
      await p;
    });
  });
});

// ── the exported helpers (new) ───────────────────────────────────────────────────────────────────────────────────────
describe("factsAfterPatch", () => {
  it("applies a merge patch: a value replaces, null deletes, an untouched fact stays; the served map is not changed", () => {
    const served = { a: "1", b: "2", c: "3" };
    expect(factsAfterPatch(served, { a: "x", b: null, d: "4" })).toEqual({ a: "x", c: "3", d: "4" });
    expect(served).toEqual({ a: "1", b: "2", c: "3" });
  });
  it("an empty patch is a copy", () => {
    const served = { a: "1" };
    const out = factsAfterPatch(served, {});
    expect(out).toEqual(served);
    expect(out).not.toBe(served);
  });
});

describe("the constants", () => {
  it("RECORD_UPDATE_KEY, OWN_SAVE_WAIT_MS", () => {
    expect(RECORD_UPDATE_KEY).toEqual(["base", "record-update"]);
    expect(OWN_SAVE_WAIT_MS).toBe(30_000);
  });
  it("the carrier set is unitTag and ruleId, the qualifier tagScope; the guarded set has both spellings of all three, the carrier-only set of the two carriers", () => {
    expect([...TAG_CARRIER_SLUGS]).toEqual(["unitTag", "ruleId"]);
    expect([...TAG_QUALIFIER_SLUGS]).toEqual(["tagScope"]);
    expect([...CARRIER_PRESERVE_SLUGS].sort()).toEqual(["a:ruleId", "a:tagScope", "a:unitTag", "ruleId", "tagScope", "unitTag"]);
    expect([...CARRIER_ONLY_SLUGS].sort()).toEqual(["a:ruleId", "a:unitTag", "ruleId", "unitTag"]);
  });
});

describe("recordSavesSettled", () => {
  it("resolves true at once when no save of the record is out", async () => {
    expect(await recordSavesSettled(newQc(), "none")).toBe(true);
  });

  it("waits for a save of THAT record, after its cache writes, then resolves true; a save of another record is not waited for", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: (id) => (id === "rs1" ? g.promise : { status: 200 }) });
    const qc = newQc();
    const h = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = h.result.current.mutateAsync({ record: rec({ id: "rs1", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(1));
    expect(await recordSavesSettled(qc, "another-record")).toBe(true);
    let settled: boolean | undefined;
    const waiting = recordSavesSettled(qc, "rs1").then((v) => (settled = v));
    await act(async () => {});
    expect(settled).toBeUndefined();
    await act(async () => {
      g.release({ status: 200, etag: '"sha256:n"' });
      await p;
      await waiting;
    });
    expect(settled).toBe(true);
  });

  it("resolves false after the time given when a save is still out, and stops listening", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: () => g.promise });
    const qc = newQc();
    const h = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = h.result.current.mutateAsync({ record: rec({ id: "rs2", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(1));
    vi.useFakeTimers();
    const waiting = recordSavesSettled(qc, "rs2", 5_000);
    await vi.advanceTimersByTimeAsync(4_999);
    let done = false;
    void waiting.then(() => (done = true));
    await vi.advanceTimersByTimeAsync(0);
    expect(done).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(await waiting).toBe(false);
    vi.useRealTimers();
    await act(async () => {
      g.release({ status: 200 });
      await p;
    });
  });


  it("a notification that is not the end of the save does not settle the wait (another record's save starting is one)", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    const g2 = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: (id) => (id === "rs4" ? g.promise : g2.promise) });
    const qc = newQc();
    const h1 = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    const h2 = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    act(() => {
      p1 = h1.result.current.mutateAsync({ record: rec({ id: "rs4", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(1));
    let settled: boolean | undefined;
    void recordSavesSettled(qc, "rs4").then((v) => (settled = v));
    act(() => {
      p2 = h2.result.current.mutateAsync({ record: rec({ id: "rs5", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(2));
    await act(async () => {});
    expect(settled).toBeUndefined();
    await act(async () => {
      g.release({ status: 200 });
      g2.release({ status: 200 });
      await p1;
      await p2;
    });
    await waitFor(() => expect(settled).toBe(true));
  });

  it("clears its timer when the save lands (no timer is left running)", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: () => g.promise });
    const qc = newQc();
    const h = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = h.result.current.mutateAsync({ record: rec({ id: "rs6", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(1));
    vi.useFakeTimers();
    const before = vi.getTimerCount();
    const waiting = recordSavesSettled(qc, "rs6", 60_000);
    expect(vi.getTimerCount()).toBe(before + 1);
    g.release({ status: 200 });
    await vi.advanceTimersByTimeAsync(50);
    expect(await waiting).toBe(true);
    await p;
    await vi.advanceTimersByTimeAsync(50);
    expect(vi.getTimerCount()).toBe(before);
    vi.useRealTimers();
  });

  it("the default wait is 30 s", async () => {
    const g = gate<{ status: number; etag?: string | null }>();
    fakePlatform({ patch: () => g.promise });
    const qc = newQc();
    const h = renderHook(() => useUpdateRecord(VID), { wrapper: wrap(qc) });
    let p!: Promise<unknown>;
    act(() => {
      p = h.result.current.mutateAsync({ record: rec({ id: "rs3", facts: { title: "A" } }), facts: { title: "B" } });
    });
    await waitFor(() => expect(qc.getMutationCache().findAll({ mutationKey: RECORD_UPDATE_KEY, status: "pending" })).toHaveLength(1));
    vi.useFakeTimers();
    let result: boolean | undefined;
    void recordSavesSettled(qc, "rs3").then((v) => (result = v));
    await vi.advanceTimersByTimeAsync(29_999);
    expect(result).toBeUndefined();
    await vi.advanceTimersByTimeAsync(1);
    expect(result).toBe(false);
    vi.useRealTimers();
    await act(async () => {
      g.release({ status: 200 });
      await p;
    });
  });
});

describe("latestCachedRecord", () => {
  it("is the viewed vault's list row when it is whole", () => {
    const qc = newQc();
    seedList(qc, [rec({ id: "lc1", facts: { title: "list" } })]);
    qc.setQueryData(["base", "record", "lc1", VAULT_ORIGIN], rec({ id: "lc1", facts: { title: "read" } }));
    expect(latestCachedRecord(qc, VID, "lc1")!.facts.title).toBe("list");
  });
  it("is the record read when the list row is label-only (hydrated false) or absent", () => {
    const qc = newQc();
    seedList(qc, [{ ...rec({ id: "lc2", facts: { title: "list" } }), hydrated: false } as BaseRecord]);
    qc.setQueryData(["base", "record", "lc2", VAULT_ORIGIN], rec({ id: "lc2", facts: { title: "read" } }));
    expect(latestCachedRecord(qc, VID, "lc2")!.facts.title).toBe("read");
    const qc2 = newQc();
    qc2.setQueryData(["base", "record", "lc3", APEX], rec({ id: "lc3", facts: { title: "read3" } }));
    expect(latestCachedRecord(qc2, VID, "lc3")!.facts.title).toBe("read3");
  });
  it("skips a read that holds null, and is null when neither holds the facts", () => {
    const qc = newQc();
    qc.setQueryData(["base", "record", "lc4", APEX], null);
    qc.setQueryData(["base", "record", "lc4", VAULT_ORIGIN], rec({ id: "lc4", facts: { title: "second" } }));
    expect(latestCachedRecord(qc, VID, "lc4")!.facts.title).toBe("second");
    expect(latestCachedRecord(newQc(), VID, "nope")).toBeNull();
    const qc3 = newQc();
    qc3.setQueryData(["base", "record", "lc5", APEX], null);
    expect(latestCachedRecord(qc3, VID, "lc5")).toBeNull();
  });
  it("looks only at the vault asked", () => {
    const qc = newQc();
    seedList(qc, [rec({ id: "lc6", facts: { title: "list" } })], "vault-2");
    expect(latestCachedRecord(qc, VID, "lc6")).toBeNull();
  });
});

