// Ported from GilbApp src/components/records/RecordDetail.ownCard.o1.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 O1 (plan C214-MergedListAndOwnCard-Plan-Architect-2026-10-19 §2 O1): the holder's own card in GilbApp is his MyNet card.
// Spec: 3P.F.Stakeholders.OwnCardIsNetworkCard.GilbApp. In Nodes and in Stakeholders (one RecordDetail, one grid row) his own card
// says it is his own card and whether MyNet shows it, is read only with one "Edit in MyNet" link, and has no My Note, Where / How we
// met, kind chips or "Find their online card". Both cases are shown (one card; a legacy mnb-profile card beside a vsc- card), and
// nothing is repaired. A vault he does not hold, and an mnb-profile card in a group vault, are not his. Other records are unchanged.
// Harness: RecordDetail.s14labelsWiring.test.tsx (the package's own fixture master and platform), with the own-card reads served here.
import { MYNET_PROFILE_URL, RecordDetail, ShellContext, recordsKey, type ShellContextValue } from "../test/app";
import { selfCardIdForVault } from "@kaigilb/gilbplatformcode-vault-origin-rule";
// UNMAPPED: __RecordRowForTest as RecordRow from ./RecordGrid
import { OWN_CARD_WORDS, isOwnCardIn } from "@kaigilb/gilbplatformcode-own-card-state";
import { type ReachableVault } from "@kaigilb/gilbplatformcode-plan-record-hooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
// O1: what the wide header asks the two "about this contact" readers for (a null address reads nothing).
const headerReads = vi.hoisted(() => ({ origin: [] as (string | null)[], relations: [] as (string | null)[] }));

vi.mock("@kaigilb/gilbplatformcode-contact-card-slots", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@kaigilb/gilbplatformcode-contact-card-slots")>()),
  useHolderOriginLine: (args: { recordEntityUri: string | null }) => {
    headerReads.origin.push(args.recordEntityUri);
    return { origin: null, loading: false };
  },
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



function putList(qc: QueryClient, vault: string, records: BaseRecord[]) {
  qc.setQueryData(recordsKey(vault), {
    pages: [{ records, total: records.length, complete: true, pageSize: 50, offset: 0 }],
    pageParams: [0],
  });
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



/** The holder's landing vault (MyNet's seat) and its vault entity, where `a:mnbProfile` is read. */
const VAULT_ENTITY = `${P}/e/seatpod-o1`;
const GROUP = "https://g.gilb.test/vault";
const LEGACY = "mnb-profile-06g3n6abadrfx11a4a6nsr73qr";

const vaultRow = (vaultId: string, over: Partial<ReachableVault> = {}): ReachableVault =>
  ({ vaultId, entity: `${vaultId}/e/v`, name: vaultId, parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: false, ...over }) as ReachableVault;
const LANDING = vaultRow(P, { entity: VAULT_ENTITY, isLandingVault: true, name: "Kai" });
const HELD_CHILD = vaultRow(Q, { parent: { entity: VAULT_ENTITY, vaultId: P }, name: "Project" });
const GROUP_VAULT = vaultRow(GROUP, { name: "Group" }); // writable, but not nested under his landing vault: not held

/** The own-card store: the vault entity's pointer and the cards that exist, by host + id. Every read is logged. */
const own = { pointer: null as string | null, cards: new Set<string>(), types: new Map<string, string>(), reads: [] as string[] };

function ownWorld() {
  personWorld();
  const inner = globalThis.fetch;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const m = /^(https:\/\/(?:p|g)\.gilb\.test)\/lws\/r\/([^/?#]+)/.exec(url);
    if (m) {
      own.reads.push(url);
      const id = decodeURIComponent(m[2]!);
      if (url.startsWith("https://p.gilb.test") && id === "seatpod-o1")
        return new Response(JSON.stringify({ "@id": VAULT_ENTITY, "@type": "t:Vault", ...(own.pointer ? { mnbProfile: { "@id": own.pointer } } : {}) }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      if (own.cards.has(`${m[1]}|${id}`))
        return new Response(JSON.stringify({ "@id": `${m[1]}/vault/e/${id}`, "@type": own.types.get(id) ?? "t:Person", name: "Kai Gilb" }), { status: 200, headers: { "content-type": "application/json" } });
      return new Response("{}", { status: 404 });
    }
    return inner(input, init);
  });
}

function ownShell(record: { id: string }, readVaultId: string, vaults: ReachableVault[] = [LANDING, HELD_CHILD, GROUP_VAULT], openRecordFromList: (id: string) => void = () => {}): ShellContextValue {
  return {
    contentScope: { readVaultId, readVault: null, vault: { entity: VAULT_ENTITY }, reach: { vaultId: P, entity: VAULT_ENTITY }, vaultTargeted: true },
    writeGuard: { allowed: true, reason: null },
    selectedRecordId: record.id,
    selectRecord: () => {},
    openRecordFromList,
    session: { principal: AGENT, vault: { entity: VAULT_ENTITY } },
    vaults,
  } as unknown as ShellContextValue;
}

function mountCard(qc: QueryClient, record: { id: string }, readVaultId = P, opts: { vaults?: ReachableVault[]; open?: (id: string) => void; placement?: "full" | "content" } = {}) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={ownShell(record, readVaultId, opts.vaults, opts.open)}>
        <RecordDetail placementMode={opts.placement ?? "full"} />
      </ShellContext.Provider>
    </QueryClientProvider>,
  );
}

/** A Person record in `vault` with the given id, put in that vault's list cache. */
function cardIn(qc: QueryClient, vault: string, id: string): BaseRecord {
  const rec = personRecord(id, `${vault}/e/${id}`, { givenName: "Kai", familyName: "Gilb" });
  putList(qc, vault, [rec]);
  return rec;
}

/** The own-card queries that ever ran (a disabled one sits in the cache, never fetched). */
const ranOwnCardQueries = (qc: QueryClient) =>
  qc.getQueryCache().findAll({ queryKey: ["own-card"] }).filter((q) => q.state.dataUpdatedAt > 0 || q.state.errorUpdatedAt > 0 || q.state.fetchStatus !== "idle");
const derivedOf = (root: string) => selfCardIdForVault(root);
const isOwnCardDrawn = () => !!screen.queryByTestId("own-card-band");

beforeEach(() => {
  headerReads.origin = [];
  headerReads.relations = [];
  own.pointer = null;
  own.cards = new Set();
  own.types = new Map();
  own.reads = [];
});



describe("O1 the own card in RecordDetail (Nodes and Stakeholders)", () => {
  it("one card: his vsc- card says it is the card MyNet shows, links to MyNet's Profile, and is read only; no writes", async () => {
    ownWorld();
    const qc = newQc();
    const id = await derivedOf(P);
    own.cards.add(`https://p.gilb.test|${id}`);
    const rec = cardIn(qc, P, id);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    const edit = screen.getByTestId("own-card-edit-in-mynet") as HTMLAnchorElement;
    expect(edit.textContent).toBe(OWN_CARD_WORDS.edit);
    expect(edit.getAttribute("href")).toBe(MYNET_PROFILE_URL);
    expect(MYNET_PROFILE_URL).toMatch(/\/profile$/);
    expect(screen.getByTestId("own-card-only-here").textContent).toBe(OWN_CARD_WORDS.onlyHere);
    // read only: no field can be typed into, the card has no Edit control, and the generic read-only line is not drawn instead
    const content = screen.getByTestId("record-detail-content");
    expect(within(content).queryAllByRole("textbox").filter((el) => !(el as HTMLInputElement).readOnly)).toHaveLength(0);
    expect(screen.queryByTestId("record-header-actions")?.childElementCount ?? 0).toBe(0);
    expect(screen.queryByText("You can read this item but not edit it.")).toBeNull();
    // none of My Note, Where / How we met, kind chips
    expect(screen.queryByTestId("stub-my-note")).toBeNull();
    expect(screen.queryByTestId("stub-how-we-met")).toBeNull();
    expect(screen.queryByTestId("stub-chips")).toBeNull();
    // the finding: the vault entity, then the derived card; nothing written
    expect(own.reads.filter((u) => u.includes("/lws/r/seatpod-o1"))).toHaveLength(1);
    expect(appWrites).toEqual([]);
  });

  it("his card shared read-only to him by its grants (as MyNet's self card is on the rig): the band says why, the generic read-only line is not drawn too", async () => {
    ownWorld();
    const qc = newQc();
    const id = await derivedOf(P);
    own.cards.add(`https://p.gilb.test|${id}`);
    const rec = personRecord(id, `${P}/e/${id}`, { givenName: "Kai", familyName: "Gilb", directReader: AGENT });
    putList(qc, P, [rec]);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    expect(screen.queryByText("You can read this item but not edit it.")).toBeNull();
  });

  it("two cards: MyNet's pointer names a legacy mnb-profile card and a vsc- card exists too. The vsc- card says MyNet uses another card and opens it", async () => {
    ownWorld();
    const qc = newQc();
    const id = await derivedOf(P);
    own.pointer = `${P}/e/${LEGACY}`;
    own.cards.add(`https://p.gilb.test|${id}`).add(`https://p.gilb.test|${LEGACY}`);
    const rec = cardIn(qc, P, id);
    const opened: string[] = [];
    mountCard(qc, rec, P, { open: (x) => opened.push(x) });
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.other));
    fireEvent.click(screen.getByTestId("own-card-open-mynet-card"));
    expect(opened).toEqual([LEGACY]);
    expect(screen.getByTestId("own-card-edit-in-mynet")).toBeTruthy();
    expect(appWrites).toEqual([]);
  });

  it("two cards, the legacy card open: it is MyNet's card, and the band names the second card and repairs nothing", async () => {
    ownWorld();
    const qc = newQc();
    const id = await derivedOf(P);
    own.pointer = `${P}/e/${LEGACY}`;
    own.cards.add(`https://p.gilb.test|${id}`).add(`https://p.gilb.test|${LEGACY}`);
    const rec = cardIn(qc, P, LEGACY);
    const opened: string[] = [];
    mountCard(qc, rec, P, { open: (x) => opened.push(x) });
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    const also = screen.getByTestId("own-card-also");
    expect(also.textContent).toContain(OWN_CARD_WORDS.also);
    fireEvent.click(within(also).getByRole("button", { name: OWN_CARD_WORDS.openAlso }));
    expect(opened).toEqual([id]);
    expect(appWrites).toEqual([]);
  });

  it("the self card of an ORGANISATION vault nested under his: an ordinary, editable card, as on main; no own-card read (Tester s63 D1)", async () => {
    ownWorld();
    const qc = newQc();
    const mynetId = await derivedOf(P);
    own.cards.add(`https://p.gilb.test|${mynetId}`);
    const orgChild = { ...HELD_CHILD, represents: "https://veda.gilb.com/base/t/Organization" };
    const rec = cardIn(qc, Q, await derivedOf(Q));
    mountCard(qc, rec, Q, { vaults: [LANDING, orgChild, GROUP_VAULT] });
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("record-header-actions").childElementCount).toBeGreaterThan(0);
    expect(own.reads.filter((u) => u.includes("seatpod-o1"))).toEqual([]);
  });

  it("an mnb-profile card in a group vault (not his): an ordinary card, editable, with its notes; no own-card read", async () => {
    ownWorld();
    const qc = newQc();
    const rec = cardIn(qc, GROUP, LEGACY);
    mountCard(qc, rec, GROUP);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("stub-chips")).toBeTruthy();
    expect(own.reads.filter((u) => u.includes("seatpod-o1"))).toEqual([]);
  });

  it("a vault he does not hold at all (read only grant): his vsc- id there is not his card", async () => {
    ownWorld();
    const qc = newQc();
    const other = vaultRow(GROUP, { modes: ["read"] });
    const rec = cardIn(qc, GROUP, await derivedOf(GROUP));
    mountCard(qc, rec, GROUP, { vaults: [LANDING, other] });
    await ready();
    expect(isOwnCardDrawn()).toBe(false);
    expect(own.reads.filter((u) => u.includes("seatpod-o1"))).toEqual([]);
  });

  // D5b ruling: only an owner-shaped id can pass MyNet's pointer validation, so any other record reads nothing and is never read only.
  it("any other person record: unchanged, editable, its notes drawn, and no own-card request at all (D5b)", async () => {
    ownWorld();
    const qc = newQc();
    const rec = cardIn(qc, P, "06gm3p3fdhvsq5a35hft48kh28");
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("record-header-actions").childElementCount).toBeGreaterThan(0);
    expect(ranOwnCardQueries(qc)).toEqual([]);
    expect(own.reads.filter((u) => u.includes("seatpod-o1"))).toEqual([]);
  });

  it("any record that is not a Person (and not vsc-): unchanged, and no own-card request at all", async () => {
    ownWorld();
    const qc = newQc();
    const rec = { ...personRecord("06gm3p3fdhvsq5a35hft48kh28", `${P}/e/06gm3p3fdhvsq5a35hft48kh28`), typeUri: "t:Organization" } as BaseRecord;
    putList(qc, P, [rec]);
    mountCard(qc, rec);
    await new Promise((r) => setTimeout(r, 80));
    expect(isOwnCardDrawn()).toBe(false);
    expect(ranOwnCardQueries(qc)).toEqual([]);
    expect(own.reads).toEqual([]);
  });


});



// Agent.Tester s69 D4 (Kai-Zen's ruling: ⛔ never own-card from an id string or a name). GilbApp's create sends a record's name as
// its slug, so records he names "MNB Profile …" get `mnb-profile-…` ids. They are his records, not his MyNet card: unchanged and
// editable. His card is his derived vsc- card, or the card MyNet's lookup names (the vault's pointer, as MyNet accepts it).
describe("O1 D4: records named 'MNB Profile …' stay ordinary; only hard identity makes the own card", () => {
  const ORG_ID = "mnb-profile-makers-ltd-06gn7dw3fsy2hagdpr1kp0rp20";
  const CONTACT_ID = "mnb-profile-services-as-06gn7dt12xsendqmdbax55b3b4";
  const NOTE_ID = "mnb-profile-ideas-06gn7dtk0nyvz7exc6t2j1pzqr";

  /** Every own-card query that ran has answered. */
  const settled = (qc: QueryClient) =>
    waitFor(() => expect(ranOwnCardQueries(qc).every((q) => q.state.status !== "pending" && q.state.fetchStatus === "idle")).toBe(true));

  for (const [label, id, typeUri] of [
    ["an organisation", ORG_ID, "t:Organization"],
    ["a contact", CONTACT_ID, "t:Person"],
    ["a note", NOTE_ID, "t:NoteDocument"],
  ] as const) {

  }

  it("the contact 'MNB Profile Services AS' opened: an ordinary, editable card with its notes and Delete, as on main; nothing written", async () => {
    ownWorld();
    const qc = newQc();
    const vsc = await derivedOf(P);
    own.cards.add(`https://p.gilb.test|${vsc}`).add(`https://p.gilb.test|${CONTACT_ID}`);
    const rec = cardIn(qc, P, CONTACT_ID);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("record-header-actions").childElementCount).toBeGreaterThan(0);
    expect(screen.getByTestId("stub-how-we-met")).toBeTruthy();
    expect(appWrites).toEqual([]);
  });

  it("the same contact while MyNet's lookup fails: still ordinary and editable (⛔ never 'his' by id)", async () => {
    ownWorld();
    const qc = newQc();
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).includes("/lws/r/seatpod-o1") ? new Response("{}", { status: 503 }) : inner(input, init),
    );
    const rec = cardIn(qc, P, CONTACT_ID);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
  });

  it("a real legacy profile card the pointer names (a Person): his, the card MyNet shows", async () => {
    ownWorld();
    const qc = newQc();
    own.pointer = `${P}/e/${LEGACY}`;
    own.cards.add(`https://p.gilb.test|${LEGACY}`);
    const rec = cardIn(qc, P, LEGACY);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    expect(screen.queryByTestId("stub-my-note")).toBeNull();
    expect(appWrites).toEqual([]);
  });

  it("a legacy card MyNet's lookup does not name (no pointer, his vsc- card exists): an ordinary, editable record", async () => {
    ownWorld();
    const qc = newQc();
    const vsc = await derivedOf(P);
    own.cards.add(`https://p.gilb.test|${vsc}`).add(`https://p.gilb.test|${LEGACY}`);
    const rec = cardIn(qc, P, LEGACY);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("record-header-actions").childElementCount).toBeGreaterThan(0);
  });


  // D5b: MyNet main's pointer step accepts an owner-shaped id whatever its type (Tester s70 W05), so GilbApp agrees with it.

});

// Agent.Tester s70 D5 (Kai-Zen's ruling, which replaces the D4 rule): the own card is decided by HARD IDENTITY ONLY: his derived
// vsc- card, or the Person record his vault's `a:mnbProfile` pointer names. No listing road, no name or id-prefix road. A holder
// with no vsc- card and no pointer has no own card in GilbApp; a contact named "MNB Profile …" is an ordinary record.
describe("O1 D5: no vsc- card and no pointer, a contact named 'MNB Profile …' is never his own card", () => {
  const CONTACT_ID = "mnb-profile-services-as-06gn7y1jfnr7x0g9grs9x5kps8";
  const PARTNERS_ID = "mnb-profile-partners-06gn7y9q3nz8x2ehb7c4q57m00";
  const ADA_ID = "06gn7y2bbbz8x2ehb7c4q57m11";


  it("t3solo: the contact 'MNB Profile Services AS' opened is an ordinary, editable card with its notes and Delete; 2 reads, nothing written", async () => {
    ownWorld();
    const qc = newQc();
    own.cards.add(`https://p.gilb.test|${CONTACT_ID}`);
    const rec = cardIn(qc, P, CONTACT_ID);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("record-header-actions").childElementCount).toBeGreaterThan(0);
    expect(screen.getByTestId("stub-how-we-met")).toBeTruthy();
    // The finding: the vault entity (pointer) once and the derived address (404); the profile photo reads that address too (as on
    // main). ⛔ Never a listing, never the contact as a candidate.
    expect(own.reads.filter((u) => u.includes("seatpod-o1"))).toHaveLength(1);
    expect(own.reads.filter((u) => !u.includes("seatpod-o1") && !u.includes("/vsc-"))).toEqual([]);
    expect(other.filter((u) => u.includes("/records"))).toEqual([]);
    expect(appWrites).toEqual([]);
  });



  it("t3leg: a real legacy card and a NEWER contact 'MNB Profile Partners', no pointer: both ordinary (the legacy card too, the ruling's accepted consequence)", async () => {
    ownWorld();
    const qc = newQc();
    own.cards.add(`https://p.gilb.test|${LEGACY}`).add(`https://p.gilb.test|${PARTNERS_ID}`);
    for (const id of [PARTNERS_ID, LEGACY]) {
      cleanup();
      const rec = cardIn(qc, P, id);
      mountCard(qc, rec);
      await ready();
      await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
      expect(isOwnCardDrawn()).toBe(false);
    }
  });

  it("the same with the pointer naming the legacy card: the legacy card is his; the newer contact stays ordinary", async () => {
    ownWorld();
    const qc = newQc();
    own.pointer = `${P}/e/${LEGACY}`;
    own.cards.add(`https://p.gilb.test|${LEGACY}`).add(`https://p.gilb.test|${PARTNERS_ID}`);
    let rec = cardIn(qc, P, PARTNERS_ID);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    cleanup();
    rec = cardIn(qc, P, LEGACY);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    expect(appWrites).toEqual([]);
  });

  it("D5b: a leftover pointer at a contact without the prefix (Ada): ignored as MyNet ignores it; Ada stays ordinary and editable", async () => {
    ownWorld();
    const qc = newQc();
    own.pointer = `${P}/e/${ADA_ID}`;
    own.cards.add(`https://p.gilb.test|${ADA_ID}`);
    const rec = cardIn(qc, P, ADA_ID);
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("stub-my-note")).toBeTruthy());
    expect(isOwnCardDrawn()).toBe(false);
    expect(screen.getByTestId("record-header-actions").childElementCount).toBeGreaterThan(0);
    expect(ranOwnCardQueries(qc)).toEqual([]);
  });



});

// C214 S5f × O1 (merge of main 9ce47c0 into S5f): the S5f one card's foot "No online card is connected." with "Find their online card"
// is about a CONTACT. On the holder's own card O1 turns the online card controller off (`enabled … && !ownCardLocked`), so the one card
// has no foot, no Find and no Connect; any other person card with no online card keeps the S5f foot and its Find.
describe("C214 S5f × O1: the Find / Connect is never offered on the holder's own MyNet card", () => {
  it("his vsc- card: the read-only band, and no S5f foot, no 'Find their online card', no Connect", async () => {
    ownWorld();
    const qc = newQc();
    const id = await derivedOf(P);
    own.cards.add(`https://p.gilb.test|${id}`);
    const rec = cardIn(qc, P, id);
    // read WHOLE (as the card's own read leaves it): without O1 this record would get the online card controller and the S5f foot
    rec.served = { facts: { ...rec.facts }, context: undefined, etag: rec.etag } as BaseRecord["served"];
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    expect(screen.queryByTestId("one-card-find-foot")).toBeNull();
    expect(screen.queryByTestId("online-card-find-open")).toBeNull();
    expect(screen.queryByTestId("online-card-find")).toBeNull();
    expect(screen.queryByTestId("online-card-connect")).toBeNull();
    expect(screen.queryByText("Find their online card")).toBeNull();
    expect(appWrites).toEqual([]);
  });

  it("control: another person card with no online card in the same world keeps the S5f foot and its Find", async () => {
    ownWorld();
    const qc = newQc();
    const OTHER = "06gm3p3fdhvsq5a35hft48kh28";
    own.cards.add(`https://p.gilb.test|${OTHER}`);
    const rec = cardIn(qc, P, OTHER);
    rec.served = { facts: { ...rec.facts }, context: undefined, etag: rec.etag } as BaseRecord["served"];
    mountCard(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("one-card-find-foot")).toBeTruthy());
    expect(screen.getByTestId("online-card-find-open").textContent).toContain("Find their online card");
    expect(isOwnCardDrawn()).toBe(false);
  });
});
