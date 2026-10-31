// Ported from GilbApp src/components/records/RecordDetail.s5bheader.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 S5b: the stakeholder card in the Card view is headed by the SHARED ContactHeader, layout wide (harness copied from
// RecordDetail.s4placement.test.tsx). Spec: 3P.F.Stakeholders.OnlineAndLocalCards.GilbApp Status 18g-18i; design note
// C214-OneCard-Design-Architect-2026-10-18 section 0 and row S5b: holder (the vault holding the record) far left with its name and kind,
// the connection between (circle chips stacked, read only; the Where / How we met line), the contact's name RIGHT-justified and its image
// far right, the chain-link badge only when linked to an online card (resolver `how` != "none"), person = circle, everything else a rounded
// square by the type in the data; S4's "In your circles" band and the pane's own picture-and-name band are replaced there; the card's
// controls (Edit / Done, "+") stay reachable; no relation is drawn (S5c); GilbApp's navigation is not part of it.
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { RecordDetail, ShellContext, recordsKey, type ShellContextValue, seam } from "../test/app";
import { PLACEMENT_CHIP_HELP } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { __resetPersonCardSession } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { fixtureMaster, RIG, ID } from "../test/fixtureMaster";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, type FixturePlatform } from "../test/fixturePlatform";


// Delta10 B1 (Cycle214 1e): credentials go only to BASE_ORIGIN's own host and its subdomains, so this
// file's vault hosts sit under a production-shaped apex (they were foreign to the dev default).



// S5b fix (Tester s36 F2): the holder's picture discovery, counted. It answers "no photo" (the initials are drawn).
const discover = vi.hoisted(() => vi.fn(async () => ({ profileId: null, photoRef: null })));
beforeEach(() => {
  seam.discover = discover as never;
});

// GAPP214.31 fix loop 1: the retype's type search is replaced by a button that picks a named type,
// so the card's own `onPick` runs (the search itself is not what these tests measure).


// s8 (Languages): the held languages store has its own suite (`LanguageSection.s8lang.test.tsx`). Here only the CARD's
// wiring is measured (the contact language is the marked entry, written through the card's own save), so a test may
// hand the real component a held-languages state in place of the store's; with none set the real hook runs.



// The sender-constrained credential is the host's; the package never sees it. Stubbed so no
// token is minted from a cookie in jsdom.


const P = "https://p.gilb.test/vault";
const Q = "https://q.gilb.test/vault";
const AGENT = "https://id.gilb.test/base/p/0b6c9a52-agent";
/** The signed-in holder's OWN vault (the session's reach row): where the connections are read. */
const OWN = "https://agent.gilb.test/vault";

const KARI = "https://kari.gilb.test/vault";
const NOBODY = "https://nobody.gilb.test/vault";
const anchor = { status: 200, answer: { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" } as unknown };
/** Which principal the resolver names for a record (default KARI). */
let anchorFor: Record<string, string> = {};
/** resolve-person's alias registry: an old spelling -> today's principal. */
let aliases: Record<string, string> = {};
/** The public-card read's status per principal (default 200): a 404 is a card that cannot be read (Kai-Zen badge ruling). */
let cardStatus: Record<string, number> = {};
const KARI_CARD = {
  principal: KARI,
  fields: [
    { principal: KARI, field: "a:givenName", value: "Kari", sourceEntity: `${KARI}/e/gn`, claimVaultId: KARI, rung: "public" },
    { principal: KARI, field: "a:email", value: "kari@example.org", sourceEntity: `${KARI}/e/em`, claimVaultId: KARI, rung: "public", kind: "email" },
  ],
  skills: [],
};
const set = (context: "personal" | "professional", depth: "close-circle" | "first-degree", members: string[]) => ({ context, depth, rungTerm: "t:x", setUri: `https://x/${context}-${depth}`, members });
/** The holder's four sets as the platform answers them: KARI in Personal 1st, Professional 1st and Professional Inner (Inner stored with 1st). */
const KARI_PLACED = [set("personal", "first-degree", [KARI]), set("personal", "close-circle", []), set("professional", "first-degree", [KARI]), set("professional", "close-circle", [KARI])];
let rung: { status: number; sets: unknown[] } = { status: 200, sets: KARI_PLACED };
const idReqs = (re: RegExp) => other.filter((o) => re.test(o));

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
    if (url.includes("/base/connect/audience-rung/members")) {
      if (rung.status !== 200) return new Response("{}", { status: rung.status, headers: { "content-type": "application/json" } });
      return new Response(JSON.stringify({ holder: AGENT, vaultId: OWN, sets: rung.sets }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/base/connect/resolve-person")) {
      const input = new URL(url).searchParams.get("input") ?? "";
      const p = aliases[input];
      return p
        ? new Response(JSON.stringify({ principal: p, displayName: null, form: "webid" }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response(JSON.stringify({ code: "unresolvable" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/base/connect/online-card-anchor")) {
      const rec = new URL(url).searchParams.get("record") ?? "";
      const principal = anchorFor[rec] ?? KARI;
      return new Response(JSON.stringify({ ...(anchor.answer as object), principal, entity: principal }), { status: anchor.status, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/base/connect/public-card")) {
      const who = new URL(url).searchParams.get("principal") ?? KARI;
      if ((cardStatus[who] ?? 200) !== 200) return new Response("{}", { status: cardStatus[who], headers: { "content-type": "application/json" } });
      const card = { ...KARI_CARD, principal: who, fields: KARI_CARD.fields.map((f) => ({ ...f, principal: who })) };
      return new Response(JSON.stringify(card), { status: 200, headers: { "content-type": "application/json" } });
    }
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
    // a record READ WHOLE carries its served document (`readRecord` sets it); the online card is made from it
    served: { facts: { name: "Tom", ...facts }, context: undefined, etag: '"sha256:0"' },
  } as unknown as BaseRecord;
}

/** The vault holding the records, as the reachable set reports it. `represents` and the landing flag are set per test. */
let holderVault: Record<string, unknown> = {};
/** The holder's own vault for this test (the session's reach row). */
let ownVault = OWN;
function shell(record: { id: string }, readVaultId = P, allowed = true): ShellContextValue {
  return {
    contentScope: { readVaultId, readVault: null, vault: null, reach: { vaultId: ownVault }, vaultTargeted: true },
    vaults: [{ vaultId: P, entity: `${P}/e/vault`, name: "Gilb AS", parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: false, ...holderVault }],
    writeGuard: { allowed, reason: allowed ? null : "read only" },
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

function mount(qc: QueryClient, record: { id: string }, allowed = true) {
  return render(
    <QueryClientProvider client={qc}>
      <ShellContext.Provider value={shell(record, P, allowed)}>
        <RecordDetail placementMode="content" />
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
  __resetPersonCardSession();
  anchorFor = {};
  aliases = {};
  cardStatus = {};
  rung = { status: 200, sets: KARI_PLACED };
  holderVault = {};
  ownVault = OWN;
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function personWorld(extra: Record<string, unknown> = {}) {
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
  const rec = personRecord("pn", "https://h.gilb.test/base/e/pn", { givenName: "Tom", familyName: "Gilb", webAddress: "gilb.com", ...extra });
  putList(qc, P, [rec]);
  return { qc, rec };
}


const linked = (rec: BaseRecord, target: string) => {
  rec.served = { facts: { ...rec.facts, sameAs: { "@id": target } }, context: undefined, etag: rec.etag };
  return rec;
};

const header = () => screen.findByTestId("contact-shell-header");
const headerChips = () => screen.queryAllByTestId("person-placement-chip").map((c) => c.textContent);
/** The vault is the holder's OWN one ("Me"): the circles and the Where / How we met line are read for it. */
const seenFromMe = () => {
  ownVault = P;
  holderVault = { isLandingVault: true, name: "Agent Holder" };
};

describe("S5b: the shared wide header on the real RecordDetail (Card view)", () => {
  test("linked and placed, seen from Me: holder | connection | contact in one row; circles stacked in the header; badge; no S4 band", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    mount(qc, linked(rec, KARI));
    await ready();
    const h = await header();
    // F1 ruling: "auto" (narrow, and wide from 56rem by a CSS container query on the header)
    expect(h.getAttribute("data-layout")).toBe("auto");
    expect(Array.from(screen.getByTestId("contact-shell-chrome-row").children).map((c) => c.getAttribute("data-testid"))).toEqual([
      "contact-header-holder",
      "contact-header-holder-name",
      "contact-header-connection",
      "contact-shell-identity",
      "contact-card-link-photo",
    ]);
    expect(screen.getByTestId("contact-header-holder-name")).toHaveTextContent("Agent Holder");
    expect(screen.getByTestId("contact-header-holder-name")).toHaveTextContent("Me");
    await waitFor(() => expect(headerChips()).toEqual(["Personal 1st Connection", "Professional Inner Circle"]));
    const chips = screen.getByTestId("contact-card-placements");
    expect(screen.getByTestId("contact-header-connection").contains(chips)).toBe(true);
    for (const c of screen.getAllByTestId("person-placement-chip")) {
      expect(c.getAttribute("data-meaning")).toBe("access");
      expect(c.getAttribute("title")).toBe(PLACEMENT_CHIP_HELP);
    }
    // read only: the chips are not a button, and the S4 band is gone from the Card view
    expect(screen.queryByTestId("contact-card-open-placement")).toBeNull();
    expect(screen.queryByTestId("person-placement-band")).toBeNull();
    await waitFor(() => expect(screen.getByTestId("contact-card-link-note")).toBeTruthy());
    // the pane's own picture-and-name band is replaced
    expect(screen.queryByTestId("record-header")).toBeNull();
    // no write
    expect(appWrites).toEqual([]);
    expect(idReqs(/^(PUT|POST|PATCH|DELETE) /)).toEqual([]);
  });

  test("the contact's name is RIGHT-justified, and it is THEIR name when their card shares one (else the record's)", async () => {
    const { qc, rec } = personWorld();
    mount(qc, linked(rec, KARI));
    await ready();
    await header();
    expect(screen.getByTestId("contact-shell-identity").style.textAlign).toBe("right");
    // KARI's card shares the given name "Kari" with this holder
    await waitFor(() => expect(screen.getByTestId("contact-card-name").textContent).toBe("Kari"));
    expect(screen.getByTestId("contact-card-caption").textContent).toMatch(/· online card$/);
  });

  test("a local-only record: no badge, no chips, the record's own name, 'your card only'", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await header();
    await screen.findByTestId("online-card-find-open");
    expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
    expect(screen.queryByTestId("contact-card-placements")).toBeNull();
    // the record's own name, as the pane's band showed it (`displayTitle`: the record's name fact)
    expect(screen.getByTestId("contact-card-name").textContent).toBe("Tom");
    expect(screen.getByTestId("contact-card-caption").textContent).toMatch(/· your card only$/);
    expect(idReqs(/audience-rung|online-card-anchor|resolve-person/)).toEqual([]);
  });

  test("linked but not placed: the badge, and no chip at all (no 'Set connection type' that cannot be pressed)", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    anchorFor = { [rec.entityUri!]: NOBODY };
    mount(qc, linked(rec, NOBODY));
    await ready();
    await header();
    await waitFor(() => expect(screen.getByTestId("contact-card-link-note")).toBeTruthy());
    expect(screen.queryByTestId("contact-card-placements")).toBeNull();
    expect(screen.queryByText("Set connection type")).toBeNull();
  });

  test("shape by the type in the data: a person record is a circle; an Organization vault holder is a rounded square named by its type", async () => {
    holderVault = { represents: "https://id.gilb.test/base/t/Organization" };
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await header();
    expect(screen.getByTestId("contact-card-link-photo").getAttribute("data-shape")).toBe("circle");
    expect(screen.getByTestId("contact-header-holder").getAttribute("data-shape")).toBe("rounded-square");
    expect(screen.getByTestId("contact-header-holder-name")).toHaveTextContent("Gilb AS");
    expect(screen.getByTestId("contact-header-holder-name")).toHaveTextContent("Organization vault");
  });

  test("seen from another vault than Me, the holder's own circles are NOT drawn as that vault's (the circles are read for Me only)", async () => {
    holderVault = { represents: "https://id.gilb.test/base/t/Organization" };
    const { qc, rec } = personWorld();
    mount(qc, linked(rec, KARI));
    await ready();
    await header();
    await waitFor(() => expect(screen.getByTestId("contact-card-link-note")).toBeTruthy());
    expect(screen.queryByTestId("contact-card-placements")).toBeNull();
  });

  test("Where / How we met: present in the connection line when the holder has one, absent when not", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    qc.setQueryData(["contact-annotations", P, rec.entityUri], {
      me: AGENT, heldParty: rec.entityUri, note: null, origin: "At birth", notes: [], origins: [], noteLoad: "empty", originLoad: "ok", vault: P,
    });
    const view = mount(qc, rec);
    await ready();
    await header();
    await waitFor(() => expect(screen.getByTestId("contact-card-origin-inline").textContent).toBe("At birth"));
    expect(screen.getByTestId("contact-header-connection").contains(screen.getByTestId("contact-card-origin-inline"))).toBe(true);
    view.unmount();
    const w2 = personWorld();
    mount(w2.qc, w2.rec);
    await ready();
    await header();
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("contact-card-origin-inline")).toBeNull();
  });

  test("the card's own controls stay reachable: Edit, then Done, and '+' in a row under the header", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await header();
    const actions = screen.getByTestId("record-header-actions");
    expect(screen.getByTestId("contact-shell-header").contains(actions)).toBe(false);
    expect(actions.contains(screen.getByTestId("card-add-info"))).toBe(true);
    screen.getByTestId("card-edit").click();
    expect(await screen.findByTestId("card-done")).toBeTruthy();
  });

  // Cycle214 S5c turned the first half of this test: the header now draws the GilbVeda relation chips and "+ Relation"
  // (StakeholderContactHeader.s5c.test.tsx). A record with NO kind and no relation still shows no predicate word.
  test("no relation chip for a record with no kind (S5c), and the header holds no navigation or search", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    mount(qc, linked(rec, KARI));
    await ready();
    const h = await header();
    await waitFor(() => expect(headerChips().length).toBe(2));
    expect(h.querySelectorAll('[data-testid="contact-header-relation"]')).toHaveLength(0);
    expect(h.textContent).not.toMatch(/family-of|colleague-of/);
    expect(h.querySelector("input")).toBeNull();
    expect(h.querySelector('[aria-label*="Back" i], [aria-label*="home" i]')).toBeNull();
  });



  // Agent.Tester s36 gap test "ignored width", adopted and turned by Kai-Zen's F1 ruling: the Card view's header no longer depends on a
  // JS width measure at all. Whatever the pane measures, the shared header is mounted with layout "auto" (narrow, and wide from 56rem by
  // a CSS container query), and the old band never comes back in the Card view.
  for (const width of [700, 1000]) {
    test(`TESTER s36 (adopted): a ${width} px Card view mounts the shared header, layout auto, never the old band`, async () => {
      const orig = Element.prototype.getBoundingClientRect;
      const spy = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
        const r = orig.call(this);
        return this.getAttribute("data-testid") === "record-detail" ? ({ x: 0, y: 0, top: 0, left: 0, right: width, bottom: 900, width, height: 900, toJSON() {} } as DOMRect) : r;
      });
      try {
        seenFromMe();
        const { qc, rec } = personWorld();
        mount(qc, linked(rec, KARI));
        await ready();
        expect((await header()).getAttribute("data-layout")).toBe("auto");
        expect(screen.queryByTestId("record-header")).toBeNull();
        expect(screen.queryByTestId("person-placement-band")).toBeNull();
      } finally {
        spy.mockRestore();
      }
    });
  }

  // Agent.Tester s36 F2: the holder's picture is read ONCE per holder per session (React Query), never again on the next card open.
  test("the holder's picture is read once per session: a second and third card open read it no more", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    const rec2 = personRecord("pn2", "https://h.gilb.test/base/e/pn2", { givenName: "Ada", familyName: "B" });
    putList(qc, P, [rec, rec2]);
    const facesBefore = discover.mock.calls.length;
    for (const r of [rec, rec2, rec]) {
      const view = mount(qc, r);
      await ready();
      await header();
      await new Promise((res) => setTimeout(res, 30));
      view.unmount();
    }
    expect(discover.mock.calls.length - facesBefore).toBe(1);
    // ⚠ The body's own reads of the holder's card (`/lws/r/vsc-…`, as on main) are not the header's; the per-open request count against
    // main is measured on the rig (report), not here.
  });

  // Kai-Zen ruling (Tester s68 O1, 2026-10-19): the chain-link badge shows whenever the record carries the link (`a:sameAs`), whatever the
  // reason the card cannot be read. In each case the body says the card cannot be opened.
  const CANNOT_OPEN = /The linked card cannot be opened from here now/;
  test("the company-vault record whose link cannot be opened says so: not 'your card only' (Tester s36 A1); the badge stays (resolver 404)", async () => {
    holderVault = { represents: "https://id.gilb.test/base/t/Organization" };
    const { qc, rec } = personWorld();
    anchor.status = 404;
    try {
      mount(qc, linked(rec, KARI));
      await ready();
      await header();
      await waitFor(() => expect(screen.getByTestId("contact-card-caption").textContent).toMatch(/· linked, not open to you now$/));
      await waitFor(() => expect(screen.getByTestId("one-card-status").textContent).toMatch(CANNOT_OPEN));
      expect(screen.getByTestId("contact-card-link-note")).toBeTruthy();
    } finally {
      anchor.status = 200;
    }
  });

  test("badge ruling, the resolver's 404 (seen from Me): the badge stays and the body says the card cannot be opened", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    anchor.status = 404;
    try {
      mount(qc, linked(rec, KARI));
      await ready();
      await header();
      await waitFor(() => expect(screen.getByTestId("one-card-status").textContent).toMatch(CANNOT_OPEN));
      expect(screen.getByTestId("contact-card-link-note")).toBeTruthy();
      expect(screen.getByTestId("contact-card-link-note").getAttribute("title")).toBe("Live link to their account — not a copy");
    } finally {
      anchor.status = 200;
    }
  });

  test("badge ruling, a link to someone with no account: the badge stays and the body says the card cannot be opened", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    // No account behind the link: the platform's resolver answers 404 (the same answer for every reason) and resolve-person knows no one.
    const GHOST = "https://ghost.gilb.test/vault";
    anchor.status = 404;
    try {
      mount(qc, linked(rec, GHOST));
      await ready();
      await header();
      await waitFor(() => expect(screen.getByTestId("one-card-status").textContent).toMatch(CANNOT_OPEN));
      expect(screen.getByTestId("contact-card-link-note")).toBeTruthy();
      expect(screen.queryByTestId("contact-card-placements")).toBeNull();
    } finally {
      anchor.status = 200;
    }
  });

  test("badge ruling, the card read's 404 (the resolver names them): the badge stays and the body says the card cannot be opened", async () => {
    seenFromMe();
    const { qc, rec } = personWorld();
    cardStatus = { [KARI]: 404 };
    mount(qc, linked(rec, KARI));
    await ready();
    await header();
    await waitFor(() => expect(screen.getByTestId("one-card-status").textContent).toMatch(CANNOT_OPEN));
    expect(screen.getByTestId("contact-card-link-note")).toBeTruthy();
  });

  test("badge ruling, the record carries no link: no badge (the ruling follows the link, not the read)", async () => {
    const { qc, rec } = personWorld();
    anchor.status = 404;
    try {
      mount(qc, rec);
      await ready();
      await header();
      await screen.findByTestId("online-card-find-open");
      expect(screen.queryByTestId("contact-card-link-note")).toBeNull();
    } finally {
      anchor.status = 200;
    }
  });
});
