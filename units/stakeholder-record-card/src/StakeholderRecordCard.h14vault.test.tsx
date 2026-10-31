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
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";
import { knownVaultOf, rememberVaultOf } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";


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




// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// H14 (Kai-Zen decisions): a click that opens a record from inside the held card hands the host the TARGET's vault, when it is sure.
// Sure = the target's own address names a vault the holder holds and no held vault sits under it (`unambiguousVaultOfRecord`), or the
// screen's row names a vault in the shell's vaults. Never the card's own vault; nothing is stored when it is not sure; a sure vault
// replaces an older, different one (the host opens with whatever is remembered).
// Harness: the own-card suite's (the package's fixture master and platform), copied.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const W = "https://w.gilb.test/vault"; // a vault the holder does not hold
const SUB = `${Q}/sub`; // a vault nested under Q
const HELD = [vaultRow(P, { entity: VAULT_ENTITY, isLandingVault: true, name: "Kai" }), vaultRow(Q, { name: "Project" })];

/** The shell of the open card with a spy for the open; `vaults` are what the holder holds. */
function h14Shell(record: { id: string }, vaults: ReachableVault[], open: (id: string) => void): ShellContextValue {
  return {
    contentScope: { readVaultId: P, readVault: null, vault: null, reach: null, vaultTargeted: true },
    writeGuard: { allowed: true, reason: null },
    selectedRecordId: record.id,
    selectRecord: () => {},
    openRecordFromList: open,
    session: { principal: AGENT },
    vaults,
  } as unknown as ShellContextValue;
}
function h14Mount(qc: QueryClient, record: { id: string }, opened: string[], vaults: ReachableVault[] = HELD) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={h14Shell(record, vaults, (id) => opened.push(id))}>
        <RecordDetail />
      </ShellContext.Provider>
    </QueryClientProvider>,
  );
}
/** The button that opens the record a stored address names (EntityRefValue titles it with the address). */
const buttonTitled = (root: HTMLElement, uri: string) =>
  waitFor(
    () => {
      const b = [...root.querySelectorAll("button")].find((x) => x.getAttribute("title") === uri);
      if (!b) throw new Error(`no button titled ${uri}`);
      return b;
    },
    { timeout: 4000 },
  );
const refButton = (uri: string) => buttonTitled(document.body, uri);

/** A person card in P whose Details hold `facts`, the card's own vault being P. */
function h14Person(facts: Record<string, unknown>) {
  const w = personWorld();
  const rec = personRecord("pn", "https://h.gilb.test/base/e/pn", { givenName: "Tom", familyName: "Gilb", ...facts });
  rec.served = { facts: { ...rec.facts }, context: undefined, etag: rec.etag };
  putList(w.qc, P, [rec]);
  return { qc: w.qc, rec };
}

describe("H14 · opens from inside the held card carry the target's vault", () => {
  afterEach(() => forgetScreenLinks());

  // ── site :813 (a reference value in a card field) ─────────────────────────────────────────────────────────────
  it("S1 a reference in a field of the card: the open remembers the vault the address names (Q), not the card's own (P)", async () => {
    const uri = `${Q}/e/orgq1`;
    const { qc, rec } = h14Person({ webAddress: uri });
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await refButton(uri));
    expect(opened).toEqual(["orgq1"]);
    expect(knownVaultOf(qc, "orgq1")).toBe(Q);
  });

  // ── site :889 (a reference value among the Record group's extra facts) ────────────────────────────────────────
  it("S2 a reference among the extra facts: the open remembers the vault the address names (Q)", async () => {
    const uri = `${Q}/e/orgq2`;
    const { qc, rec } = h14Person({ xcustom: uri });
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await refButton(uri));
    expect(opened).toEqual(["orgq2"]);
    expect(knownVaultOf(qc, "orgq2")).toBe(Q);
  });

  // ── site :1022 (the own-card band) ────────────────────────────────────────────────────────────────────────────
  it("S3 the own-card band, 'Open the card MyNet shows' and 'Open the other card': the open remembers the vault the card's address names (P)", async () => {
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
    expect(knownVaultOf(qc, LEGACY)).toBe(P);
    cleanup();
    // the legacy card open: the band names the vsc- card as the second one
    const qc2 = newQc();
    const rec2 = cardIn(qc2, P, LEGACY);
    const opened2: string[] = [];
    mountCard(qc2, rec2, P, { open: (x) => opened2.push(x) });
    await ready();
    await waitFor(() => expect(screen.getByTestId("own-card-caption").textContent).toBe(OWN_CARD_WORDS.mynet));
    fireEvent.click(within(screen.getByTestId("own-card-also")).getByRole("button", { name: OWN_CARD_WORDS.openAlso }));
    expect(opened2).toEqual([id]);
    expect(knownVaultOf(qc2, id)).toBe(P);
  });

  // ── sites :1104 and :1125 (the relation and preference sets) ──────────────────────────────────────────────────
  it("S5 a relation (Member of) to a record in Q: the open remembers Q", async () => {
    world();
    const ownersQ = `${Q}/e/ownq5`;
    const qc = newQc();
    const rec = personRecord("pn", "https://h.gilb.test/base/e/pn", { givenName: "Tom", memberOf: ownersQ });
    rec.served = { facts: { name: "Tom", memberOf: ownersQ }, context: undefined, etag: rec.etag };
    putList(qc, P, [rec]);
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    const g = await screen.findByRole("region", { name: "Member of" });
    fireEvent.click(await buttonTitled(g, ownersQ));
    const oid = ownersQ.split("/").pop()!;
    expect(opened).toEqual([oid]);
    expect(knownVaultOf(qc, oid)).toBe(Q);
  });
  // S6 (:1125, the contact preferences set): the set draws its chosen channel as a chip (StakeholderSetFields.tsx, `isChannel` branch), never as an
  // EntityRefValue, so no click can reach that callback. It is wired through the same function; there is nothing to click, so no test.

  // ── site :1149 (the related children) ─────────────────────────────────────────────────────────────────────────
  it("S7 a related child whose address names Q, listed in the card's own vault P: the open remembers Q, not P", async () => {
    const { qc, rec } = h14Person({});
    const kid = personRecord("kidq", `${Q}/e/kidq`, {});
    kid.facts = { name: "Kid Q", memberOf: "https://h.gilb.test/base/e/pn" } as never;
    putList(qc, P, [rec, kid]);
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await screen.findByRole("button", { name: "Kid Q" }, { timeout: 4000 }));
    expect(opened).toEqual(["kidq"]);
    expect(knownVaultOf(qc, "kidq")).toBe(Q);
  });

  // ── no vault is invented ──────────────────────────────────────────────────────────────────────────────────────
  it("N1 an address in a vault the holder does not hold: the id alone is opened, nothing remembered (not the card's vault either)", async () => {
    const uri = `${W}/e/orgw1`;
    const { qc, rec } = h14Person({ webAddress: uri });
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await refButton(uri));
    expect(opened).toEqual(["orgw1"]);
    expect(knownVaultOf(qc, "orgw1")).toBeNull();
  });
  it("N2 the named vault has a held vault nested under it: nothing remembered (the address then names the parent)", async () => {
    const uri = `${Q}/e/orgq3`;
    const { qc, rec } = h14Person({ webAddress: uri });
    const opened: string[] = [];
    h14Mount(qc, rec, opened, [...HELD, vaultRow(SUB, { name: "Sub" })]);
    await ready();
    fireEvent.click(await refButton(uri));
    expect(opened).toEqual(["orgq3"]);
    expect(knownVaultOf(qc, "orgq3")).toBeNull();
  });
  it("N4 a related child with no address of its own: nothing remembered (the card's vault is not the child's)", async () => {
    const { qc, rec } = h14Person({});
    const kid = personRecord("kidn", "", {});
    (kid as { entityUri?: string }).entityUri = undefined;
    kid.facts = { name: "Kid N", memberOf: "https://h.gilb.test/base/e/pn" } as never;
    putList(qc, P, [rec, kid]);
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await screen.findByRole("button", { name: "Kid N" }, { timeout: 4000 }));
    expect(opened).toEqual(["kidn"]);
    expect(knownVaultOf(qc, "kidn")).toBeNull();
  });
  it("N5 a value that is not an entity address is no button and stores nothing", async () => {
    const { qc, rec } = h14Person({ webAddress: "gilb.com" });
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    expect([...document.querySelectorAll("button")].find((x) => x.getAttribute("title") === "gilb.com")).toBeUndefined();
    expect(qc.getQueryCache().findAll({ queryKey: ["created-in-vault"] })).toEqual([]);
  });

  // ── a sure vault replaces an older, different one ─────────────────────────────────────────────────────────────
  it("O1 an older, different vault remembered for the id is replaced by the sure one, and the host's read answers it", async () => {
    const uri = `${Q}/e/orgq4`;
    const { qc, rec } = h14Person({ webAddress: uri });
    rememberVaultOf(qc, "orgq4", P);
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await refButton(uri));
    expect(knownVaultOf(qc, "orgq4")).toBe(Q);
  });
  it("O2 a vault that is not sure leaves an older remembered vault as it was", async () => {
    const uri = `${W}/e/orgw2`;
    const { qc, rec } = h14Person({ webAddress: uri });
    rememberVaultOf(qc, "orgw2", P);
    const opened: string[] = [];
    h14Mount(qc, rec, opened);
    await ready();
    fireEvent.click(await refButton(uri));
    expect(knownVaultOf(qc, "orgw2")).toBe(P);
  });
});
