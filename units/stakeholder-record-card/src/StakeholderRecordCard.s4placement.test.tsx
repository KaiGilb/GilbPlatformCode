// Ported from GilbApp src/components/records/RecordDetail.s4placement.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 S4: placement chips on a matched person card (harness copied from RecordDetail.s13online.test.tsx).
// Spec: plan C214-SharedStakeholders-Plan-Architect-2026-10-18 section 4.1 and row S4. A held record linked (`a:sameAs`) to a person the
// holder has placed shows that person's placements as read-only chips MEANING ACCESS, apart from the record's own kind labels; an
// unmatched record shows nothing new; the connections are read ONCE per holder per session at the holder's OWN vault; a failed read shows
// no chips and no error. ⛔ Never by name.
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { RecordDetail, ShellContext, recordsKey, type ShellContextValue } from "../test/app";
import { GILBAPP_CHIP_HELP, PLACEMENT_CHIP_HELP } from "@kaigilb/gilbplatformcode-stakeholder-contact-header";
import { __resetPersonCardSession } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
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



// The sender-constrained credential is the host's; the package never sees it. Stubbed so no
// token is minted from a cookie in jsdom.


const P = "https://p.gilb.test/vault";
const Q = "https://q.gilb.test/vault";
const AGENT = "https://id.gilb.test/base/p/0b6c9a52-agent";
/** The signed-in holder's OWN vault (the session's reach row): where the connections are read. */
const OWN = "https://agent.gilb.test/vault";

const KARI = "https://kari.gilb.test/vault";
const ADA = "https://ada.gilb.test/vault";
const ADA_OLD = "https://ada.gilb.test/i";
const NOBODY = "https://nobody.gilb.test/vault";
const anchor = { status: 200, answer: { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" } as unknown };
/** Which principal the resolver names for a record (default KARI). */
let anchorFor: Record<string, string> = {};
/** resolve-person's alias registry: an old spelling -> today's principal. */
let aliases: Record<string, string> = {};
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

function shell(record: { id: string }, readVaultId = P, allowed = true): ShellContextValue {
  return {
    contentScope: { readVaultId, readVault: null, vault: null, reach: { vaultId: OWN }, vaultTargeted: true },
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
  __resetPersonCardSession();
  anchorFor = {};
  aliases = {};
  rung = { status: 200, sets: KARI_PLACED };
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
const chipWords = () => screen.queryAllByTestId("person-placement-chip").map((c) => c.textContent);

describe("S4 placement chips on the real RecordDetail", () => {
  it("a record linked to a person the holder placed shows the placements read-only, MyNet's words, Inner collapsing 1st", async () => {
    const { qc, rec } = personWorld();
    mount(qc, linked(rec, KARI));
    await ready();
    await screen.findByTestId("person-placement-band");
    expect(chipWords()).toEqual(["Personal 1st Connection", "Professional Inner Circle"]);
    for (const c of screen.getAllByTestId("person-placement-chip")) {
      expect(c.getAttribute("data-meaning")).toBe("access");
      expect(c.getAttribute("title")).toBe(PLACEMENT_CHIP_HELP);
    }
    expect(screen.getByTestId("person-placement-band")).toHaveTextContent("In your circles");
    // read only: nothing to add or remove
    expect(screen.getByTestId("person-placement-band").querySelectorAll("button").length).toBe(0);
    // the connections are read at the holder's OWN vault, at its node, naming it
    expect(idReqs(/audience-rung\/members/)).toEqual([`GET https://agent.gilb.test/base/connect/audience-rung/members?vaultId=${encodeURIComponent(OWN)}`]);
    // the card and its chips share ONE resolver request; the online card is still read once
    await screen.findAllByTestId("one-card-row");
    expect(idReqs(/online-card-anchor/).length).toBe(1);
    expect(idReqs(/public-card/).length).toBe(1);
    // exact match: no canonical lookup
    expect(idReqs(/resolve-person/)).toEqual([]);
    // no write of any kind
    expect(appWrites).toEqual([]);
    expect(idReqs(/^(PUT|POST|PATCH|DELETE) /)).toEqual([]);
  });

  it("a person placed under an OLD spelling is matched through resolve-person (re-minted principal), never by name", async () => {
    const { qc, rec } = personWorld();
    anchorFor = { [rec.entityUri!]: ADA };
    aliases = { [ADA_OLD]: ADA };
    rung = { status: 200, sets: [set("personal", "first-degree", [ADA_OLD]), set("professional", "first-degree", [KARI])] };
    mount(qc, linked(rec, ADA));
    await ready();
    await screen.findByTestId("person-placement-band");
    expect(chipWords()).toEqual(["Personal 1st Connection"]);
  });

  it("an UNLINKED record shows nothing new and reads neither the connections nor the resolver", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    expect(await screen.findByTestId("online-card-find-open")).toBeTruthy();
    expect(screen.queryByTestId("person-placement-band")).toBeNull();
    expect(idReqs(/audience-rung|online-card-anchor|resolve-person/)).toEqual([]);
  });

  it("a record linked to a person the holder has NOT placed shows no chips (the online card still shows)", async () => {
    const { qc, rec } = personWorld();
    anchorFor = { [rec.entityUri!]: NOBODY };
    mount(qc, linked(rec, NOBODY));
    await ready();
    await screen.findAllByTestId("one-card-row");
    await waitFor(() => expect(idReqs(/resolve-person/).length).toBe(1)); // KARI asked once: is it NOBODY under another spelling? No.
    expect(screen.queryByTestId("person-placement-band")).toBeNull();
  });

  it("the record's own kind LABELS keep their meaning and tooltip, and never share a row with the placement chips", async () => {
    expect(GILBAPP_CHIP_HELP).toBe("How they relate to this vault, for you only. It gives them no access to anything."); // Cycle214: a kind is a relation to the vault
    const { qc, rec } = personWorld();
    mount(qc, linked(rec, KARI));
    await ready();
    const band = await screen.findByTestId("person-placement-band");
    expect(band.querySelector('[data-meaning="label"]')).toBeNull();
    for (const labels of screen.queryAllByTestId("contact-kind-chips")) {
      expect(labels.getAttribute("data-meaning")).toBe("label");
      expect(labels.querySelector('[data-meaning="access"]')).toBeNull();
      expect(band.contains(labels)).toBe(false);
    }
    expect(PLACEMENT_CHIP_HELP).not.toBe(GILBAPP_CHIP_HELP);
  });

  it("the connections are read ONCE however many cards open (shared, kept for the session)", async () => {
    const { qc, rec } = personWorld();
    const rec2 = linked(personRecord("pn2", "https://h.gilb.test/base/e/pn2", { givenName: "Kari", familyName: "K" }), KARI);
    const rec3 = linked(personRecord("pn3", "https://h.gilb.test/base/e/pn3", { givenName: "Ada", familyName: "L" }), ADA);
    anchorFor = { [rec3.entityUri!]: ADA };
    putList(qc, P, [linked(rec, KARI), rec2, rec3]);
    for (const r of [rec, rec2, rec3, rec]) {
      const view = mount(qc, r);
      await ready();
      await screen.findAllByTestId("one-card-row");
      if (r !== rec3) await screen.findByTestId("person-placement-band");
      view.unmount();
    }
    expect(idReqs(/audience-rung\/members/).length).toBe(1);
    // one resolver request per card open (four opens), shared with the card's own read
    expect(idReqs(/online-card-anchor/).length).toBe(4);
  });


});
