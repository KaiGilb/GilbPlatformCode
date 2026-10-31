// Ported from GilbApp src/components/records/RecordDetail.stakeholderCard.c214.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { recordsKey, recordsSnapshotKey, RecordDetail, ShellContext, type ShellContextValue } from "../test/app";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { forgetStakeholderKindReaders } from "@kaigilb/gilbplatformcode-stakeholder-kinds";
import { masterSource } from "@kaigilb/gilbplatformcode-vocabulary-source";
import { resolveFieldSets } from "@kaigilb/gilbplatformcode-stakeholder-field-sets";
import { entityDisplayName, refreshRecordInCaches } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { cardFieldOf } from "@kaigilb/gilbplatformcode-stakeholder-card-model";
import { selfCardEntityUri } from "@kaigilb/gilbplatformcode-self-card";
import { vaultRootOf } from "@kaigilb/gilbplatformcode-plan-self-source";
import { openTypeNameSlug } from "@kaigilb/gilbplatformcode-entity-name";
import { resolveType } from "@kaigilb/gilbplatformcode-record-types";
import { factsAfterPatch } from "@kaigilb/gilbplatformcode-record-update";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { fixtureMaster, RIG, ID } from "../test/fixtureMaster";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";




// RuleBaseappSourceIsAdder: the stater of a note is the ADDER's own card, in THEIR landing vault, ⛔ not the card of the vault that holds the record.
// Stood in here (MOCK); the real finding is proved in `sourceIsAdder.sb1a.held.test.tsx`.


// GAPP214.31 fix loop 1: the retype's type search is replaced by a button that picks a named type,
// so the card's own `onPick` runs (the search itself is not what these tests measure).
const retypePick = vi.hoisted(() => ({ typeName: "Person" }));

// s8 (Languages): the held languages store has its own suite (`LanguageSection.s8lang.test.tsx`). Here only the CARD's
// wiring is measured (the contact language is the marked entry, written through the card's own save), so a test may
// hand the real component a held-languages state in place of the store's; with none set the real hook runs.



// The sender-constrained credential is the host's; the package never sees it. Stubbed so no
// token is minted from a cookie in jsdom.


const P = "https://p.gilb.test/vault";
const Q = "https://q.gilb.test/vault";
const AGENT = "https://id.gilb.test/base/p/0b6c9a52-agent";

let m: ReturnType<typeof fixtureMaster>;
let platform: FixturePlatform;
let masterInits: (RequestInit | undefined)[];
/** Every request the app sent that was not to the master or the platform fixture. */
let other: string[];
/** The bodies of the app's own writes (not the package's), in order. */
let appWrites: { method: string; url: string; body: Record<string, unknown>; ifMatch?: string | null }[];

/** The fixture's listing without its one illustrative node that is no term on the master
 *  (`t/Unrelated` / `a:unrelated`, typing gate r2 F2): a master without the selector serves the
 *  whole listing, so the node would be served to the app. Every other node is kept as served. */
function withoutUnplaced(m: ReturnType<typeof fixtureMaster>): ReturnType<typeof fixtureMaster> {
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(
      page["@graph"]
        .filter((n) => n["@id"] !== `${ID}/base/t/Unrelated`)
        // Email with the encoding production serves (`t/Email` read 2026-10-04T14:55Z:
        // "inline-literal:text"), so a kind's set holds two literals and the per-kind test tells a
        // card offering every literal from one offering only the name (QA r2 D6).
        .map((n) => (n["a:predicateAttribute"] === "a:email" && !n["a:encoding"] ? { ...n, "a:encoding": "inline-literal:text" } : n)),
    );
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  m.listing(pages as never);
  return m;
}

function world(selector = true, master: "up" | "hang" | "503" = "up") {
  // C214 M3c round 2: each world is a new page, so it gets a new shared kind reader (gilb-stakeholders M3k). Without this a loop's
  // "503" world would inherit the "hang" world's reader, whose read never ends (a page keeps one reader for its life).
  forgetStakeholderKindReaders();
  m = withoutUnplaced(withReferenceTerms(fixtureMaster()));
  m.selector = selector;
  platform = fixturePlatform({ origin: new URL(Q).origin });
  platform.reach.add(P).add(Q);
  platform.nest(P, Q);
  masterInits = [];
  other = [];
  appWrites = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(ID) && master === "hang") return new Promise<Response>(() => {});
    if (url.startsWith(ID) && master === "503") return new Response("{}", { status: 503 });
    if (url.startsWith(ID)) {
      masterInits.push(init);
      return m.fetch(url.replace(ID, RIG), init);
    }
    if (url.startsWith(new URL(Q).origin)) return platform.fetch(url, init);
    other.push(`${init?.method ?? "GET"} ${url}`);
    const method = String(init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && typeof init?.body === "string")
      appWrites.push({ method, url, body: JSON.parse(init.body), ifMatch: new Headers(init?.headers).get("if-match") });
    return new Response("{}", { status: 200, headers: { "content-type": "application/json", etag: '"sha256:x"' } });
  });
}

/** The package's own answer on the same master: what the card must show for `kind`. */
async function packageFields(kind: string) {
  const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
  const set = Object.values(sets.byKind).find((k) => k.name === kind)!;
  return { sets, set, card: set.fields.map(cardFieldOf) };
}

function personRecord(id: string, entityUri: string, facts: Record<string, unknown> = {}): BaseRecord {
  return {
    id,
    entityUri,
    typeUri: "t:Person",
    facts: { name: "Tom", ...facts },
    etag: '"sha256:0"',
    updatedAt: Date.now(),
    servedKeys: Object.keys(facts),
  } as unknown as BaseRecord;
}

/** GAPP214.42 (N1): the record as the card READ it — with the document served at its ETag, as
 *  `readRecord` hands it out — so a retype builds its PUT from that read (it reads first otherwise). */
function asRead(rec: BaseRecord): BaseRecord {
  rec.served = { facts: { ...rec.facts }, context: undefined, etag: rec.etag };
  return rec;
}

function shell(record: { id: string }, readVaultId = P): ShellContextValue {
  return {
    contentScope: { readVaultId, readVault: null, vault: null, reach: null, vaultTargeted: true },
    writeGuard: { allowed: true, reason: null },
    selectedRecordId: record.id,
    selectRecord: () => {},
    openRecordFromList: () => {},
    session: { principal: AGENT },
  } as unknown as ShellContextValue;
}

function putList(qc: QueryClient, vault: string, records: BaseRecord[]) {
  qc.setQueryData(recordsKey(vault), {
    pages: [{ records, total: records.length, complete: true, pageSize: 50, offset: 0 }],
    pageParams: [0],
  });
}

function mount(qc: QueryClient, record: { id: string }) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shell(record)}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>,
  );
}

/** Wait until the card has its reading and it says "ready" (a stakeholder kind with its set). */
async function ready() {
  await waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });
}

/** Wait until the master has been asked nothing new for three ticks in a row. */
async function settle() {
  let last = -1;
  let still = 0;
  for (let i = 0; i < 100 && still < 3; i++) {
    await new Promise((r) => setTimeout(r, 20));
    if (m.requested.length === last) still++;
    else {
      still = 0;
      last = m.requested.length;
    }
  }
}

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

/** The labels of the card's editable inputs and of every other field of the set it shows. */
function shownOnCard() {
  const content = screen.getByTestId("record-detail-content");
  const editable = within(content)
    .queryAllByRole("textbox")
    .filter((el) => !(el as HTMLInputElement).readOnly)
    .map((el) => el.closest("label")?.querySelector("span")?.textContent ?? "");
  const set = screen.queryAllByTestId("stakeholder-set-field").map((el) => ({ term: el.getAttribute("data-field-term"), mode: el.getAttribute("data-field-mode") }));
  return { editable, set };
}

beforeEach(() => {
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("GAPP214.30 — the card's fields per kind equal the package's for the same master", () => {
  it("for every stakeholder kind the master serves: the card's editable fields are the set's literals, and every other field of the set is shown with its mode", async () => {
    world();
    const sets = await resolveFieldSets(masterSource({ vedaOrigin: RIG, fetchImpl: m.fetch }));
    const kinds = Object.values(sets.byKind);
    expect(kinds.length).toBeGreaterThan(3);
    for (const kind of kinds) {
      const expected = kind.fields.map(cardFieldOf);
      const qc = newQc();
      const rec = { ...personRecord(`r-${kind.name}`, `https://h.gilb.test/base/e/r-${kind.name}`), typeUri: `t:${kind.name}` } as BaseRecord;
      putList(qc, P, [rec]);
      mount(qc, rec);
      await ready();
      const got = shownOnCard();
      const wantEditable = expected.filter((f) => f.mode === "card-edit").map((f) => f.label ?? f.slug);
      expect([...got.editable].sort(), `${kind.name}: editable`).toEqual([...wantEditable].sort());
      const wantSet = expected.filter((f) => f.mode !== "card-edit").map((f) => ({ term: f.term, mode: f.mode }));
      // s8 card look: the relations are set under one heading and the preferred channel under another, so the ORDER of the set's other fields
      // is no longer the kind's own; the SET of them, each with its mode, is what the card must show.
      const byTerm = (a: { term: string | null }, b: { term: string | null }) => String(a.term).localeCompare(String(b.term));
      expect([...got.set].sort(byTerm), `${kind.name}: the other fields`).toEqual([...wantSet].sort(byTerm));
      cleanup();
    }
  });

  it("the card offers no field of its own list for a stakeholder kind: a field added on the master shows; one removed does not", async () => {
    world();
    // Change the master's declarations: a placed attribute declared on Person as well (jobTitle,
    // a field of Employment in the fixture), and email's declaration taken off Person.
    const pages: Record<string, unknown>[][] = [];
    for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
      const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
      if (!page) break;
      pages.push(page["@graph"]);
      url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
    }
    const refs = (v: unknown) => (Array.isArray(v) ? v : v ? [v] : []) as { "@id": string }[];
    const person = `${ID}/base/t/Person`;
    let added = false;
    let removed = false;
    for (const page of pages)
      for (const node of page) {
        if (node["a:predicateAttribute"] === "a:jobTitle") {
          node["a:fieldOf"] = [...refs(node["a:fieldOf"]), { "@id": person }];
          added = true;
        }
        if (node["a:predicateAttribute"] === "a:email") {
          node["a:fieldOf"] = refs(node["a:fieldOf"]).filter((r) => r["@id"] !== person);
          removed = true;
        }
      }
    expect(added && removed, "the fixture holds both declarations").toBe(true);
    m.listing(pages as never);
    const { set } = await packageFields("Person");
    const jobTitle = set.fields.find((f) => f.writeKey === "a:jobTitle");
    expect(jobTitle, "the package now offers jobTitle on Person").toBeTruthy();
    expect(set.fields.some((f) => f.writeKey === "a:email"), "and no longer email").toBe(false);

    const qc = newQc();
    const rec = personRecord("tom", "https://h.gilb.test/base/e/tom");
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    const got = shownOnCard();
    const onCard = [...got.editable, ...got.set.map((s) => s.term)];
    const jt = cardFieldOf(jobTitle!);
    expect(onCard, "the added field is on the card").toContain(jt.mode === "card-edit" ? jt.label : jt.term);
    const email = cardFieldOf({ ...jobTitle!, label: "Email" });
    expect(got.editable, "the removed field is not").not.toContain(email.label);
    // Every editable label on the card is a label the master's set carries.
    const labels = new Set(set.fields.map((f) => f.label));
    for (const l of got.editable) expect(labels.has(l), `${l} is from the master`).toBe(true);
  });
});

describe("GAPP214.30 — held for the session (3P.C.Ontology.SpeedGuard.GilbPlatform)", () => {
  it("a second card opened in one session makes 0 master reads; every master read was sent with cache mode no-cache", async () => {
    world();
    const qc = newQc();
    const a = personRecord("tom", "https://h.gilb.test/base/e/tom");
    const b = personRecord("ann", "https://h.gilb.test/base/e/ann", { name: "Ann" });
    putList(qc, P, [a, b]);
    mount(qc, a);
    await waitFor(() => expect(screen.getAllByTestId("stakeholder-set-field").length).toBeGreaterThan(0));
    // Let the first card's own reads finish (the description and picture reads load lazily).
    await settle();
    const afterFirst = m.requested.length;
    expect(afterFirst).toBeGreaterThan(5);
    cleanup();
    mount(qc, b);
    await waitFor(() => expect(screen.getAllByTestId("stakeholder-set-field").length).toBeGreaterThan(0));
    expect(screen.getByDisplayValue("Ann")).toBeTruthy();
    await settle();
    expect(m.requested.length - afterFirst).toBe(0);
    expect(masterInits.length).toBe(afterFirst);
    // Every read made through the fetch GilbApp hands the package is sent with cache mode no-cache
    // (.22c VAScaling A2). The card's two older reads of the type's own term (its picture and its
    // definition, which are not the package's) are named, and are each made once per session.
    const typeTerm = (u: string) => /\/base\/t\/Person$/.test(u);
    const pkg = masterInits.filter((_, i) => !typeTerm(m.requested[i]!));
    expect(pkg.length).toBeGreaterThan(5);
    expect(pkg.every((init) => init?.cache === "no-cache")).toBe(true);
    // At most one each; the picture is held per page load (`typePicture.ts` pictureCache), so an
    // earlier test in this file may already hold it.
    // The type's picture and definition are drawn by the host's optional pieces (`renderBandIcon`, `renderTypeDescription`): the card makes neither read.
    expect(m.requested.filter(typeTerm).length).toBe(0);
  });
});



describe("GAPP214.30 — a reference is written only through the package, naming the vault that holds the record (R52)", () => {
  /** The world the R52 tests share: Q nested in P, the carrier and the group in Q, a group in P. */
  function nestedWorld() {
    world();
    const tom = platform.seed(Q, "t:Person", { "a:name": "Tom" });
    const ownersQ = platform.seed(Q, "t:PartyGroup", { "a:name": "Owners" });
    const ownersP = platform.seed(P, "t:PartyGroup", { "a:name": "Owners (P)" });
    const id = tom.split("/").pop()!;
    const rec = personRecord(id, tom);
    const qc = newQc();
    // The multi-vault list's snapshots, as `useRecordsMulti` caches them: P lists Q's record too
    // and names P on it (R52); Q names Q. The merge attributes it to Q.
    const row = (v: string) => ({ ...rec, sourceVaultId: v });
    qc.setQueryData(recordsSnapshotKey(P, "live", "Person"), { records: [row(P)], scannedVaults: [Q], coverage: {} });
    qc.setQueryData(recordsSnapshotKey(Q, "live", "Person"), { records: [row(Q)], scannedVaults: [], coverage: {} });
    return { tom, ownersQ, ownersP, rec, qc };
  }

  const memberOfField = () => screen.getAllByTestId("stakeholder-set-field").find((el) => el.getAttribute("data-field-mode") === "reference-add" && /member/i.test(el.textContent ?? ""))!;

  // It8: the link is a PICKER (type a name, choose a record of the carrier's vault), added through the
  // same checked write. The R52 assertions below are unchanged.
  async function addFromCard(targetName: string) {
    const field = await waitFor(() => {
      const f = memberOfField();
      expect(f).toBeTruthy();
      return f;
    });
    const user = userEvent.setup();
    await user.type(within(field).getByRole("textbox"), targetName);
    await user.click(await within(field).findByRole("button", { name: targetName }, { timeout: 4000 }));
    return within(field).findByTestId("stakeholder-reference-answer", {}, { timeout: 4000 });
  }

  const patches = () => platform.requests.filter((r) => r.method === "PATCH");

  it("opened from the list while P is open: the write names Q; P's own cache entry still names P and is not used", async () => {
    const { ownersQ, rec, qc } = nestedWorld();
    putList(qc, P, [rec]);
    mount(qc, rec);
    const answer = await addFromCard("Owners");
    expect(answer.textContent).toBe("Added.");
    expect(patches().length).toBe(1);
    expect(new URL(patches()[0]!.url).origin).toBe(new URL(Q).origin);
    expect(JSON.stringify(patches()[0]!.body)).toContain(ownersQ);
    // The typed list walked was Q's, ⛔ never P's.
    const listed = platform.requests.filter((r) => r.method === "GET" && r.url.includes("records"));
    expect(listed.length).toBeGreaterThan(0);
    expect(listed.every((r) => decodeURIComponent(r.url).includes(Q) || !decodeURIComponent(r.url).includes(P))).toBe(true);
    const pEntry = qc.getQueryData<{ records: { id: string; sourceVaultId: string }[] }>(recordsSnapshotKey(P, "live", "Person"));
    expect(pEntry!.records[0]!.sourceVaultId).toBe(P);
  });

  it("opened by a deep link (no list page holds it; found through the cache): the write still names Q", async () => {
    const { ownersQ, rec, qc } = nestedWorld();
    // No recordsKey list: the pane reaches the record through the cache scan and its own read.
    qc.setQueryData(["base", "record", rec.id, new URL(rec.entityUri!).origin], rec);
    mount(qc, rec);
    const answer = await addFromCard("Owners");
    expect(answer.textContent).toBe("Added.");
    expect(patches().length).toBe(1);
    expect(new URL(patches()[0]!.url).origin).toBe(new URL(Q).origin);
    expect(JSON.stringify(patches()[0]!.body)).toContain(ownersQ);
  });

  it("a target that is not a record of the named vault is not offered by the picker, and nothing is written", async () => {
    // It8: the picker lists only the carrier's vault's own records (the package's find, R52); the
    // package's refusal of an out-of-vault target is its own test (holderReference.test.ts).
    const { ownersP, rec, qc } = nestedWorld();
    void ownersP;
    putList(qc, P, [rec]);
    mount(qc, rec);
    const field = await waitFor(() => {
      const f = memberOfField();
      expect(f).toBeTruthy();
      return f;
    });
    const user = userEvent.setup();
    await user.type(within(field).getByRole("textbox"), "Owners");
    await within(field).findByRole("button", { name: "Owners" }, { timeout: 4000 });
    expect(within(field).queryByRole("button", { name: "Owners (P)" })).toBeNull();
    expect(patches().length).toBe(0);
    expect(platform.requests.filter((r) => r.method !== "GET").length).toBe(0);
  });

  it("no cached list attributes the record: the card names no vault, says why, and offers no add", async () => {
    world();
    const qc = newQc();
    const rec = personRecord("tom", "https://h.gilb.test/base/e/tom");
    putList(qc, P, [rec]);
    mount(qc, rec);
    const withheld = await screen.findAllByTestId("stakeholder-reference-withheld", {}, { timeout: 4000 });
    expect(withheld[0]!.textContent).toMatch(/Which vault holds this record is not known yet/);
    expect(screen.queryByTestId("stakeholder-link-picker")).toBeNull();
  });
});

describe("GAPP214.30 fix loop 1 — QA r1 D1 and D2", () => {
  it("D1: a person whose name is held under the legacy label: the Name field shows it, editing writes a:name only, and the title follows", async () => {
    world();
    const qc = newQc();
    const rec = { ...personRecord("tom", "https://h.gilb.test/base/e/tom"), facts: { label: "Tom" } } as BaseRecord;
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    const boxes = screen.getAllByDisplayValue("Tom") as HTMLInputElement[];
    const labelOf = (el: HTMLElement) => el.closest("label")?.querySelector("span")?.textContent;
    const nameBox = boxes.find((b) => labelOf(b) === "Name")!;
    expect(nameBox, "the set's Name field shows the legacy name").toBeTruthy();
    expect(nameBox.readOnly).toBe(false);
    // The legacy fact itself is still shown (the read returned it), read-only: it is not the set's.
    const legacy = boxes.filter((b) => b !== nameBox);
    expect(legacy.length).toBe(1);
    expect(legacy[0]!.readOnly).toBe(true);
    expect(screen.getByTestId("record-detail").textContent).toContain("Tom");
    const user = userEvent.setup();
    await user.clear(nameBox);
    await user.type(nameBox, "Tomas");
    await user.tab();
    await waitFor(() => expect(appWrites.length).toBeGreaterThan(0), { timeout: 4000 });
    const sent = Object.assign({}, ...appWrites.map((w) => w.body)) as Record<string, unknown>;
    expect(sent["a:name"]).toBe("Tomas");
    // GAPP214.30b closes QA r2/r3 D1: the save retracts the served label and the list reads a:name
    // first (asserted by the T1 test below).
    expect(sent["a:label"]).toBeNull();
    await waitFor(() => expect(within(screen.getByTestId("record-detail")).getAllByText("Tomas").length).toBeGreaterThan(0));
  });


});



// ── GAPP214.30b ──────────────────────────────────────────────────────────────────────────
// BVedanta's D1 ruling (T1, T2, T5, T6 on the card; T3, T4, T7 and the pure rules in
// `partyName.c214b.test.ts`), QA r3 G1 and G5 (D7). The list's reader is the real
// `entityDisplayName`, called as `RecordGrid` calls it; the stored record is the served facts with
// the card's own merge-patch body applied (RFC 7386: `null` deletes). The rig re-reads it raw.

// s8 card look: this suite tests the card's FIELDS (what is saved, refused, offered); it opens its cards in edit mode, as every card was before the two modes.
beforeAll(() => __startCardsInEditMode(true));
afterAll(() => __startCardsInEditMode(false));


// Delta10 B1 (Cycle214 1e): credentials go only to BASE_ORIGIN's own host and its subdomains, so this
// file's vault hosts sit under a production-shaped apex (they were foreign to the dev default).

/** The list row's name, exactly as `RecordGrid` asks for it. */
const listNameOf = (facts: Record<string, string>) =>
  entityDisplayName(facts, { nameField: resolveType("t:Person")?.nameField ?? openTypeNameSlug(facts) });
/** The app's own writes merged into one body (bare slugs), and the stored facts after it. */
function storedAfter(served: Record<string, string>) {
  const body: Record<string, string | null> = {};
  for (const w of appWrites) for (const [k, v] of Object.entries(w.body)) body[k.replace(/^a:/, "")] = v as string | null;
  return { body, stored: factsAfterPatch(served, body) as Record<string, string> };
}
async function renameOnCard(from: string, to: string) {
  const box = (screen.getAllByDisplayValue(from) as HTMLInputElement[]).find((b) => b.closest("label")?.querySelector("span")?.textContent === "Name" && !b.readOnly)!;
  expect(box, "an editable Name box").toBeTruthy();
  const user = userEvent.setup();
  await user.clear(box);
  await user.type(box, to);
  await user.tab();
  await waitFor(() => expect(appWrites.length).toBeGreaterThan(0), { timeout: 4000 });
}

describe("GAPP214.30b — D1: a rename reaches the list (BVedanta's ruling T1, T2, T5)", () => {
  it("T1 (QA r3 G1): a person held under the legacy label, renamed: a:name only, a:label null, no a:title key, If-Match the version read; the list shows the new name from the cache and from the stored record", async () => {
    world();
    const qc = newQc();
    const served = { label: "Tom Gilb", title: "Tom Gilb" };
    const rec = { ...personRecord("tg", "https://h.gilb.test/base/e/tg"), facts: served } as BaseRecord;
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    await renameOnCard("Tom Gilb", "Thomas");
    const raw = appWrites[0]!.body;
    expect(raw["a:name"]).toBe("Thomas");
    expect(raw["a:label"]).toBeNull();
    expect("a:title" in raw).toBe(false);
    expect(Object.keys(raw).sort()).toEqual(["a:label", "a:name"]);
    expect(appWrites[0]!.ifMatch).toBe('"sha256:0"');
    const { stored } = storedAfter(served);
    expect(listNameOf(stored)).toBe("Thomas");
    await waitFor(() => {
      const row = (qc.getQueryData<{ pages: { records: BaseRecord[] }[] }>(recordsKey(P))!.pages[0]!.records).find((r) => r.id === "tg")!;
      expect(listNameOf(row.facts as Record<string, string>)).toBe("Thomas");
    });
  });

  it("T2 (QA's control): a person held under a:name, renamed: no a:label and no a:title key", async () => {
    world();
    const qc = newQc();
    const rec = personRecord("tn", "https://h.gilb.test/base/e/tn");
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    await renameOnCard("Tom", "Thomas");
    const { body, stored } = storedAfter({ name: "Tom" });
    expect(body).toEqual({ name: "Thomas" });
    expect(listNameOf(stored)).toBe("Thomas");
  });

  it("T5: the title is not retracted: after the rename a:title still reads the old value and the list shows the new name", async () => {
    world();
    const qc = newQc();
    const served = { label: "Tom Gilb", title: "Tom Gilb" };
    const rec = { ...personRecord("t5", "https://h.gilb.test/base/e/t5"), facts: served } as BaseRecord;
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    await renameOnCard("Tom Gilb", "Thomas");
    const { stored } = storedAfter(served);
    expect(stored.title).toBe("Tom Gilb");
    expect(stored.label).toBeUndefined();
    expect(listNameOf(stored)).toBe("Thomas");
  });
});









// ── GAPP214.31 — W5, the fallback guard and the RC1 window path (BVedanta's O4 ruling §2.4, §3.3, §4;
// VKT-RC1WindowRenamePlacement-GilbApp). "Stored" is the served facts with the card's body applied
// (`storedAfter`, RFC 7386, the merge the PATCH door applies; GAPP214.30b's rig read it back on the
// store); the list's name is the real `entityDisplayName`, as `RecordGrid` calls it.

/** The card's state, read off its own content attribute. */
async function cardState(state: string) {
  await waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe(state), { timeout: 4000 });
}
/** Every input the card shows under the word "Name". */
function nameBoxes(): HTMLInputElement[] {
  return (Array.from(screen.getByTestId("record-detail-content").querySelectorAll("input")) as HTMLInputElement[]).filter(
    (b) => b.closest("label")?.querySelector("span")?.textContent === "Name",
  );
}
const listName = (stored: Record<string, string>) => entityDisplayName(stored, { nameField: openTypeNameSlug(stored) });
/** The app writes' raw keys, merged in order (`a:` kept). */
const rawBody = () => Object.assign({}, ...appWrites.map((w) => w.body)) as Record<string, unknown>;

/** The fixture master with the Name field's value encoding removed, so a ready Person's set offers
 *  no editable name field (the fallback guard's state, the O4 ruling §4). */
function withNameNotEditable(mm: ReturnType<typeof fixtureMaster>): ReturnType<typeof fixtureMaster> {
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = mm.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(
      page["@graph"].map((n) => {
        if (n["a:predicateAttribute"] !== "a:name") return n;
        const { ["a:encoding"]: _drop, ...rest } = n;
        return rest;
      }),
    );
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  mm.listing(pages as never);
  return mm;
}

describe("GAPP214.31 — W5: on a record that holds a:name, the card's one Name box is a:name, in every state", () => {










  it("K5 (control, unchanged): a t:Person holding name Tom and label Tom Gilb, ready: the rename sends a:name Thomas and a:label null (D1 W2)", async () => {
    world();
    const qc = newQc();
    const served = { name: "Tom", label: "Tom Gilb" };
    const rec = { ...personRecord("k5", "https://h.gilb.test/base/e/k5"), facts: served } as BaseRecord;
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    await renameOnCard("Tom", "Thomas");
    expect(rawBody()).toEqual({ "a:name": "Thomas", "a:label": null });
  });
});

describe("GAPP214.31 — the fallback guard and the RC1 window path", () => {
  it("the guard (the O4 ruling §4): a ready Person whose set offers no editable name field, an email saved: the body holds the email only, no a:label, no a:title", async () => {
    world();
    withNameNotEditable(m);
    const qc = newQc();
    const served = { name: "Tom", title: "Dr Tom" };
    const rec = { ...personRecord("g1", "https://h.gilb.test/base/e/g1"), facts: served } as BaseRecord;
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    expect(nameBoxes().filter((b) => !b.readOnly).length, "no editable name box").toBe(0);
    const email = (Array.from(screen.getByTestId("record-detail-content").querySelectorAll("input")) as HTMLInputElement[]).find(
      (b) => b.closest("label")?.querySelector("span")?.textContent === "Email address" && !b.readOnly,
    )!;
    expect(email, "the set's email field is editable").toBeTruthy();
    const user = userEvent.setup();
    await user.type(email, "tom@example.test");
    await user.tab();
    await waitFor(() => expect(appWrites.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(rawBody()).toEqual({ "a:email": "tom@example.test" });
  });




});





describe("Cycle214 step 1e it8 — a link field is a PICKER over the package's rule; a chosen link is shown by name and removed", () => {
  /** The list attributes the records to Q (R52), as the nested world's snapshots do. */
  function attribute(qc: QueryClient, recs: BaseRecord[]) {
    const row = (r: BaseRecord, v: string) => ({ ...r, sourceVaultId: v });
    qc.setQueryData(recordsSnapshotKey(P, "live", "Person"), { records: recs.map((r) => row(r, P)), scannedVaults: [Q], coverage: {} });
    qc.setQueryData(recordsSnapshotKey(Q, "live", "Person"), { records: recs.map((r) => row(r, Q)), scannedVaults: [], coverage: {} });
    putList(qc, P, recs);
  }
  function linkWorld(tomFacts: Record<string, unknown> = {}) {
    world();
    // GilbApp's own record client (a link's remove) reads and patches the record at its own address,
    // on the fixture's record host: routed to the same fixture platform.
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith(VAULT_HOST)
        ? platform.fetch(String(input).replace(VAULT_HOST, new URL(Q).origin), init)
        : inner(input, init),
    );
    const ownersQ = platform.seed(Q, "t:PartyGroup", { "a:name": "Owners" });
    const tom = platform.seed(Q, "t:Person", { "a:name": "Tom", ...Object.fromEntries(Object.entries(tomFacts).map(([k, v]) => [`a:${k}`, v])) });
    const ana = platform.seed(Q, "t:Person", { "a:name": "Ana Owens" });
    const id = tom.split("/").pop()!;
    const rec = personRecord(id, tom, tomFacts);
    const qc = newQc();
    attribute(qc, [rec]);
    return { ownersQ, tom, ana, rec, qc };
  }
  const fieldOf = (re: RegExp) =>
    screen.getAllByTestId("stakeholder-set-field").find((el) => el.getAttribute("data-field-mode") === "reference-add" && re.test(el.textContent ?? ""))!;
  const patches = () => platform.requests.filter((r) => r.method === "PATCH");

  it("member-of offers only what the package admits (a group, ⛔ not a person whose name matches), and the choice goes through the checked write", async () => {
    const { ownersQ, rec, qc } = linkWorld();
    mount(qc, rec);
    const field = await waitFor(() => {
      const f = fieldOf(/member/i);
      expect(f).toBeTruthy();
      return f;
    }, { timeout: 4000 });
    const user = userEvent.setup();
    await user.type(within(field).getByRole("textbox"), "Ow");
    const hit = await within(field).findByRole("button", { name: "Owners" }, { timeout: 4000 });
    // "Ana Owens" matches the text, and is a Person: membership admits only a role relation's group.
    expect(within(field).queryByRole("button", { name: "Ana Owens" })).toBeNull();
    await user.click(hit);
    expect((await within(field).findByTestId("stakeholder-reference-answer", {}, { timeout: 4000 })).textContent).toBe("Added.");
    expect(patches()).toHaveLength(1);
    expect(JSON.stringify(patches()[0]!.body)).toContain(ownersQ);
  });

  it("preferred channel: ⛔ not a record; the choices are the record's own contact fields that hold a value, written as the attribute's address", async () => {
    const { rec, qc } = linkWorld({ email: "tom@example.test" });
    mount(qc, asRead(rec));
    const field = await waitFor(() => {
      const f = fieldOf(/channel/i);
      expect(f).toBeTruthy();
      return f;
    }, { timeout: 4000 });
    const user = userEvent.setup();
    const email = await within(field).findByRole("button", { name: "Email address" }, { timeout: 4000 }); // the master's label
    expect(within(field).queryByRole("textbox")).toBeNull();
    await user.click(email);
    expect((await within(field).findByTestId("stakeholder-reference-answer", {}, { timeout: 4000 })).textContent).toBe("Added.");
    expect(JSON.stringify(patches()[0]!.body)).toContain(`${ID}/base/a/email`);
  });

  it("a stored link is shown with a remove control; REMOVE drops only that link, conditionally, and keeps the rest", async () => {
    const { rec, qc, ownersQ } = linkWorld();
    const other = platform.seed(Q, "t:PartyGroup", { "a:name": "Board" });
    const tomFacts = { memberOf: [{ "@id": ownersQ }, { "@id": other }] };
    // The record as stored holds both links.
    const stored = platform.seed(Q, "t:Person", { "a:name": "Tom", "a:memberOf": tomFacts.memberOf });
    // As `readRecord` hands it out: the list's flattened string in `facts`, the links as served.
    const r2 = personRecord(stored.split("/").pop()!, stored, { memberOf: `${ownersQ}, ${other}` });
    r2.served = { facts: { name: "Tom", ...tomFacts }, context: undefined, etag: r2.etag };
    attribute(qc, [rec, r2]);
    mount(qc, r2);
    const field = await waitFor(() => {
      const f = fieldOf(/member/i);
      expect(within(f).getAllByTestId("stakeholder-link")).toHaveLength(2);
      return f;
    }, { timeout: 4000 });
    const user = userEvent.setup();
    await user.click(within(field).getAllByRole("button", { name: /Remove from/ })[0]!);
    expect((await within(field).findByTestId("stakeholder-reference-answer", {}, { timeout: 4000 })).textContent).toBe("Removed.");
    const p = patches();
    expect(p).toHaveLength(1);
    expect(JSON.stringify(p[0]!.body)).not.toContain(ownersQ);
    expect(JSON.stringify(p[0]!.body)).toContain(other);
    expect(Object.entries(p[0]!.headers).some(([k, v]) => k.toLowerCase() === "if-match" && !!v)).toBe(true);
  });
});

describe("Cycle214 step 1e it8 — a person card's remaining plain fields are MyNet's FieldRow, saved through the card's own save", () => {
  /** The fixture master with the person's two name fields and two plain fields at their attribute
   *  terms (`a/<name>`, the form the card finds a field by), one of which publishes a value set. */
  function personWorld() {
    world();
    const node = (slug: string, label: string) => ({
      "@id": `${ID}/base/a/${slug}`,
      "a:predicateAttribute": `a:${slug}`,
      "a:label": label,
      "a:encoding": "inline-literal:text",
      "a:fieldOf": [{ "@id": `${ID}/base/t/Person` }],
    });
    const pages: Record<string, unknown>[][] = [];
    for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
      const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
      if (!page) break;
      pages.push(page["@graph"]);
      url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
    }
    pages.push([node("givenName", "Given Name"), node("familyName", "Family Name"), node("webAddress", "Web Address"), node("zone", "Zone")]);
    m.listing(pages as never);
    for (const [slug, label] of [["givenName", "Given Name"], ["familyName", "Family Name"], ["webAddress", "Web Address"]] as const)
      m.put(`a/${slug}`, { "@context": {}, "@id": `${ID}/base/a/${slug}`, "a:predicateAttribute": `a:${slug}`, "a:label": label });
    // The zone term publishes a closed set (`a:valueSet`): its edit is a choice among the members.
    m.put("a/zone", { "@context": {}, "@id": `${ID}/base/a/zone`, "a:predicateAttribute": "a:zone", "a:label": "Zone", "a:valueSet": ["UTC", "Europe/Oslo"] });
    const qc = newQc();
    const rec = personRecord("pn", "https://h.gilb.test/base/e/pn", { givenName: "Tom", familyName: "Gilb", webAddress: "gilb.com" });
    putList(qc, P, [rec]);
    return { qc, rec };
  }

  it("the field shows its master label as the sub-label and its value; tap, edit, leave: the card's save writes it", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const row = await waitFor(() => {
      const r = screen.getAllByTestId("field-row").find((el) => el.getAttribute("data-field-label") === "Web Address");
      expect(r).toBeTruthy();
      return r!;
    }, { timeout: 4000 });
    expect(within(row).getByText("Web Address")).toBeTruthy();
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: "Edit Web Address" }));
    const box = within(row).getByRole("textbox", { name: "Edit Web Address" });
    await user.clear(box);
    await user.type(box, "www.gilb.com");
    await user.tab();
    await waitFor(() => expect(appWrites.some((w) => w.body["a:webAddress"] === "www.gilb.com")).toBe(true), { timeout: 4000 });
    expect(appWrites.find((w) => "a:webAddress" in w.body)!.ifMatch).toBe('"sha256:0"');
  });

  it("a term with a published value set is edited as a choice among its members", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const row = await waitFor(() => {
      const r = screen.getAllByTestId("field-row").find((el) => el.getAttribute("data-field-label") === "Zone");
      expect(r).toBeTruthy();
      return r!;
    }, { timeout: 4000 });
    const user = userEvent.setup();
    await user.click(within(row).getByRole("button", { name: "Edit Zone" }));
    const choice = await within(row).findByRole("combobox", { name: "Edit Zone" }, { timeout: 4000 });
    expect(within(choice).getAllByRole("option").map((o) => o.textContent)).toEqual(["—", "UTC", "Europe/Oslo"]);
    await user.selectOptions(choice, "Europe/Oslo");
    await waitFor(() => expect(appWrites.some((w) => w.body["a:zone"] === "Europe/Oslo")).toBe(true), { timeout: 4000 });
  });
});




