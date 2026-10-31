// Ported from GilbApp src/components/records/RecordDetail.s14labelsWiring.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 s14 (Agent.Tester s20 F1): the WIRING of RecordDetail that the merge of the labels branch onto main had to get right, pinned at RecordDetail level:
// the chip row sits in the Name group's title row, and My Note and Where we met sit at the card top, above the Name group. The slots' CONTENT has its own suites
// (ContactCardSlots.*); here a stub fills the three places with marked elements so only where RecordDetail PUTS them is measured. Harness copied from
// RecordDetail.s8org.test.tsx (the package's own fixture master and platform).
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { RecordDetail, ShellContext, recordsKey, type ShellContextValue } from "../test/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { fixtureMaster, RIG, ID } from "../test/fixtureMaster";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";


// Delta10 B1 (Cycle214 1e): credentials go only to BASE_ORIGIN's own host and its subdomains, so this
// file's vault hosts sit under a production-shaped apex (they were foreign to the dev default).



// GAPP214.31 fix loop 1: the retype's type search is replaced by a button that picks a named type,
// so the card's own `onPick` runs (the search itself is not what these tests measure).


// s8 (Languages): the held languages store has its own suite (`LanguageSection.s8lang.test.tsx`). Here only the CARD's
// wiring is measured (the contact language is the marked entry, written through the card's own save), so a test may
// hand the real component a held-languages state in place of the store's; with none set the real hook runs.
const heldLang = vi.hoisted(() => ({
  override: null as null | ((contact: { tag: string; write: ((tag: string) => void) | null }) => unknown),
}));


// The sender-constrained credential is the host's; the package never sees it. Stubbed so no
// token is minted from a cookie in jsdom.



// The leaf readers have their own suites; here only the CARD's wiring is measured.
const leaf = vi.hoisted(() => ({
  employees: { employees: [] as { person: string; id: string; name: string | null; titles: string[] }[], total: 0, nextOffset: null as number | null, notListed: 0 },
  units: { units: [] as { uri: string; id: string; name: string | null; logo: string | null; employees: number | null }[], total: 0, nextOffset: null as number | null, notListed: 0 },
  numbers: [] as { id: string; uri: string; number: string; register: string | null; heldParties: string[]; statedBy: string[] }[],
}));
// s12 follow-up (Tester s17 F1): the generic "Children" list (the reverse member-of index, up to ~80 rows and ~80 record reads) is NOT drawn on an organization card:
// its people are the Employees group (a short list), and a second list of the same people was the "list of hundreds" Kai ruled out.








// The three reserved places of the card, filled with marked elements (the real content has its own suites).
const slotArgs = vi.hoisted(() => ({ last: null as null | { ownVaultId: string | null; vaultId: string | null } }));
vi.mock("@kaigilb/gilbplatformcode-contact-card-slots", () => ({
  contactCardSlots: (args: { recordEntityUri: string | null; ownVaultId: string | null; vaultId: string | null }) => {
    slotArgs.last = args;
    return args.recordEntityUri
      ? {
          nameAside: <span data-testid="stub-chips">chips</span>,
          myNote: <div data-testid="stub-my-note">my note</div>,
          howWeMet: <div data-testid="stub-how-we-met">where we met</div>,
        }
      : {};
  },
  GILBAPP_CHIP_HELP: "help",
  useHolderOriginLine: () => ({ origin: null, loading: false }),
}))

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

/** What a real sign-in answers (measured on a rig of platform main f4409b46): the session's vault is the SEAT record's entity, on another host and path than the vault's id. */
const SEAT_ENTITY = "https://id.gilb.test/base/e/seatpod-c9f4b5b5";

function shell(record: { id: string }, readVaultId = P, own: { vaultId: string; viaReach: boolean } | null = null): ShellContextValue {
  return {
    contentScope: { readVaultId, readVault: null, vault: own ? { entity: SEAT_ENTITY } : null, reach: own?.viaReach ? { vaultId: own.vaultId, entity: SEAT_ENTITY } : null, vaultTargeted: true },
    writeGuard: { allowed: true, reason: null },
    selectedRecordId: record.id,
    selectRecord: () => {},
    openRecordFromList: () => {},
    session: own ? { principal: AGENT, vault: { entity: SEAT_ENTITY } } : { principal: AGENT },
    // the vault that holds the card (its picture is read and written there)
    vaults: [{ vaultId: readVaultId, entity: own ? SEAT_ENTITY : null, name: "Held", parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: !!own && own.vaultId === readVaultId }],
  } as unknown as ShellContextValue;
}

function putList(qc: QueryClient, vault: string, records: BaseRecord[]) {
  qc.setQueryData(recordsKey(vault), {
    pages: [{ records, total: records.length, complete: true, pageSize: 50, offset: 0 }],
    pageParams: [0],
  });
}

function mount(qc: QueryClient, record: { id: string }, own: { vaultId: string; viaReach: boolean } | null = null) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shell(record, P, own)}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>,
  );
}

/** Wait until the card has its reading and it says "ready" (a stakeholder kind with its set). */
async function ready() {
  await waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });
}

const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

beforeEach(() => {
});
afterEach(() => {
  leaf.numbers = [];
  leaf.units = { units: [], total: 0, nextOffset: null, notListed: 0 };
  leaf.employees = { employees: [], total: 0, nextOffset: null, notListed: 0 };
  heldLang.override = null;
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cycle214 s8 organization card — Kai, 2026-10-16: "Companies also need to have the same profile picture. Typically a logo for a
// company. Same treatment of all the fields, like time zone must have the time zone just like in contacts. And then if one can
// easily list all the employees" and "org number? address hierarchy from headquartes, to subs". The organization's card is the
// person card's own components over the ORGANIZATION's field set (found by term), plus the groups a person's card lacks.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const ORG_HOST = "https://h.gilb.test/base";

function orgWorld() {
  world();
  // The held languages have their own suite: a card with none yet.
  heldLang.override = (contact) => ({
    rows: [],
    loading: false,
    error: null,
    contactTag: contact.tag,
    hasRungs: false,
    errorFor: () => null,
    savingFor: () => false,
    add: async () => true,
    listLegacy: async () => true,
    remove: async () => true,
    setFlag: async () => true,
    markContact: async () => true,
    clearContact: async () => true,
  });
  const node = (slug: string, label: string, encoding: string, many = false) => ({
    "@id": `${ID}/base/a/${slug}`,
    "a:predicateAttribute": `a:${slug}`,
    "a:label": label,
    "a:encoding": encoding,
    ...(many ? { "a:cardinality": "multi" } : {}),
    "a:fieldOf": [{ "@id": `${ID}/base/t/Organization` }],
  });
  const nodes = [
    node("phone", "Phone", "inline-literal:text"),
    node("account", "Online Account", "inline-literal:text", true),
    node("postalAddress", "Postal Address", "inline-literal:text"),
    node("timeZone", "Time Zone", "inline-literal:token"),
    node("contactLanguage", "Contact Language", "inline-literal:token"),
    node("url", "Web Address", "inline-literal:text"),
    node("logo", "Logo", "reference-valued:@id"),
    node("parentOrganization", "Parent Organization", "reference:@id"),
  ];
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"]);
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  pages.push(nodes);
  m.listing(pages as never);
  for (const n of nodes) m.put(`a/${String(n["@id"]).split("/").pop()}`, { "@context": {}, "@id": n["@id"], "a:predicateAttribute": n["a:predicateAttribute"], "a:label": n["a:label"] });
  const qc = newQc();
  const rec = orgRecord("org1", `${ORG_HOST}/e/org1`, {
    email: "post@butikk.no",
    phone: "22 33 44 55",
    url: "butikk.no",
    timeZone: "Europe/Oslo",
    parentOrganization: `${ORG_HOST}/e/hq`,
    ...{},
  });
  putList(qc, P, [rec]);
  return { qc, rec };
}

function orgRecord(id: string, entityUri: string, facts: Record<string, unknown> = {}): BaseRecord {
  return {
    id,
    entityUri,
    typeUri: "t:Organization",
    facts: { name: "Butikk AS", ...facts },
    etag: '"sha256:0"',
    updatedAt: Date.now(),
    servedKeys: Object.keys(facts),
  } as unknown as BaseRecord;
}


/** A person kind that has a given/family name pair (so its card has a Name group), as RecordDetail.s8cardlook's world. */
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
  pages.push([node("givenName", "Given Name"), node("familyName", "Family Name"), node("webAddress", "Web Address")]);
  m.listing(pages as never);
  for (const [slug, label] of [["givenName", "Given Name"], ["familyName", "Family Name"], ["webAddress", "Web Address"]] as const)
    m.put(`a/${slug}`, { "@context": {}, "@id": `${ID}/base/a/${slug}`, "a:predicateAttribute": `a:${slug}`, "a:label": label });
  const qc = newQc();
  const rec = personRecord("pn", "https://h.gilb.test/base/e/pn", { givenName: "Tom", familyName: "Gilb", webAddress: "gilb.com" });
  putList(qc, P, [rec]);
  return { qc, rec };
}

const groupOf = (kind: string) => document.querySelector(`[data-group="${kind}"]`) as HTMLElement | null;

/** The wiring a held person or organization card must have. */
function assertWiring() {
  const root = screen.getByTestId("person-card-groups");
  const name = groupOf("name");
  expect(name, "the Name group").toBeTruthy();
  // (a) the chip row is in the Name group's TITLE ROW (its header aside), not elsewhere
  const aside = within(name!).getByTestId("card-group-aside");
  expect(within(aside).getByTestId("stub-chips")).toBeTruthy();
  expect(aside.closest("header")?.parentElement).toBe(name);
  expect(screen.getAllByTestId("stub-chips")).toHaveLength(1);
  // (b) My Note and Where we met sit at the card TOP, in that order, above the Name group
  const top = within(root).getByTestId("card-top-slots");
  const note = within(top).getByTestId("stub-my-note");
  const met = within(top).getByTestId("stub-how-we-met");
  expect(note.compareDocumentPosition(met) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(top.compareDocumentPosition(name!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
}

describe("s14 labels onto main: where RecordDetail puts the chips and the two notes", () => {
  it("a held PERSON: the chip row is in the Name group's title row; My Note then Where we met are at the card top", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    assertWiring();
  });



  it("a record that is not a stakeholder kind (no managed card) has none of the three places", async () => {
    const { qc } = orgWorld();
    const note = { ...personRecord("nt", "https://h.gilb.test/base/e/nt", {}), typeUri: "t:NoteDocument" } as BaseRecord;
    putList(qc, P, [note]);
    mount(qc, note);
    await waitFor(() => expect(screen.getByTestId("record-detail")).toBeTruthy());
    expect(screen.queryByTestId("stub-chips")).toBeNull();
    expect(screen.queryByTestId("stub-my-note")).toBeNull();
  });
});

describe("Kai 2026-10-18 (My Note and Where / How we met missing in GilbApp): the card is told which vault is the signer's own", () => {
  it("a held person in the signer's own vault: the card gets that vault's id as `ownVaultId`, though the session's seat entity is on another host (RED at a97ce4d: null, so no note was ever offered)", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec, { vaultId: P, viaReach: true });
    await ready();
    expect(slotArgs.last?.vaultId).toBe(P);
    expect(slotArgs.last?.ownVaultId).toBe(P);
  });

  it("the same when the session vault has no row in the reachable set but the platform flags this vault as the landing vault", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec, { vaultId: P, viaReach: false });
    await ready();
    expect(slotArgs.last?.ownVaultId).toBe(P);
  });

  it("a card held in a vault that is not the signer's own: `ownVaultId` is the signer's vault, never the card's", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec, { vaultId: Q, viaReach: true });
    await ready();
    expect(slotArgs.last?.vaultId).toBe(P);
    expect(slotArgs.last?.ownVaultId).toBe(Q);
  });
});
