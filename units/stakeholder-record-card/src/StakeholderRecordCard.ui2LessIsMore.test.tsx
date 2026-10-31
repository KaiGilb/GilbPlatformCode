// Ported from GilbApp src/components/records/RecordDetail.ui2LessIsMore.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// C214-UI2 "Contact card: less is more" (Kai 2026-10-21, production GilbApp 66eaaecc, Stakeholders -> Card, a person linked to an online
// card), on the real RecordDetail (harness copied from RecordDetail.s5dOneCard.test.tsx, which copied it from s13online). Kai, verbatim:
//   1 "The My Note and Where / How we met, make them way smaller when empty. Ready to take notes but find a way to make the smaller/less space."
//   2 "For online contacts that info is added to, The names show two time, show only the online name."
//   3 "their yours on every row is to much info ... add the chain link to the linked info, and nothing to the non linked info. Remove the
//     Their/Yours badges"
//   4 (the legend, the type line and "Click a value to edit it.") "Just remove all this, less is more."
//   5 (the "Claim Place" group of raw GilbGeo addresses) "it is technical back info. Or possible move it to the details" (Kai-Zen ruling:
//     off the card; in Details under OTHER FIELDS as the place's name with its flag; never the raw address)
//   6 (the card's "Record · stated-by") Kai-Zen ruling: off the card; Details shows "Stated By".
// UNMAPPED: GEO_ORIGIN from ../../lib/mynet/geo/baseGeo; __resetGeoCache from ../../lib/mynet/geo/baseGeo; __resetFlags from ../../lib/mynet/languages/countryFlags; setFlagSource from ../../lib/mynet/languages/countryFlags; setFlagStore from ../../lib/mynet/languages/countryFlags; __resetTheirPlaces from ../../lib/base/onlineCard/theirPlaces
import { RecordDetail, ShellContext, recordsKey, type ShellContextValue } from "../test/app";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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


const GEO_ORIGIN = "https://geo.gilb.test";
const P = "https://p.gilb.test/vault";
const Q = "https://q.gilb.test/vault";
const AGENT = "https://id.gilb.test/base/p/0b6c9a52-agent";

const KARI = "https://kari.gilb.test/vault";
const NORWAY = `${GEO_ORIGIN}/base/e/osm-r-2978650`;
const OSLO = `${GEO_ORIGIN}/base/e/osm-r-406091`;
const NOWHERE = `${GEO_ORIGIN}/base/e/osm-r-999`;
const GEO_ROWS: Record<string, { label: string; type: string }> = { [NORWAY]: { label: "Norway", type: "t:Country" }, [OSLO]: { label: "Oslo", type: "t:City" } };
let geoReads: string[] = [];
const anchor = { status: 200, answer: { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" } as unknown };
const KARI_CARD = {
  principal: KARI,
  fields: [
    // differs from the holder's own given name "Tom": both rows, both kept
    { principal: KARI, field: "a:givenName", value: "Kari", sourceEntity: `${KARI}/e/gn`, claimVaultId: KARI, rung: "public" },
    // equal to the holder's own family name: ONE row of theirs, "You have the same on your card"
    { principal: KARI, field: "a:familyName", value: "Gilb", sourceEntity: `${KARI}/e/fn`, claimVaultId: KARI, rung: "t:EitherContextCloseCircleGrantee" },
    { principal: KARI, field: "a:email", value: "kari@example.org", sourceEntity: `${KARI}/e/em`, claimVaultId: KARI, rung: "public", kind: "email" },
    // a field the person card has no group for: a group of its own
    { principal: KARI, field: "a:jobTitle", value: "Architect", sourceEntity: `${KARI}/e/jt`, claimVaultId: KARI, rung: "public", kind: "job-title" },
    // not part of the card: another principal's value, and a value with no text (hidden values are never served at all)
    { principal: "https://other.gilb.test/vault", field: "a:webAddress", value: "other.example", rung: "public" },
    { principal: KARI, field: "a:webAddress", value: "  ", rung: "public" },
    // C214-UI2: places of theirs (GilbGeo addresses), the "Claim Place" group Kai saw
    { principal: KARI, field: "a:claimPlace", value: NORWAY, sourceEntity: `${KARI}/e/cp1`, claimVaultId: KARI, rung: "t:EitherContextFirstDegreeGrantee" },
    { principal: KARI, field: "a:claimPlace", value: OSLO, sourceEntity: `${KARI}/e/cp2`, claimVaultId: KARI, rung: "t:EitherContextFirstDegreeGrantee" },
    { principal: KARI, field: "a:claimPlace", value: NOWHERE, sourceEntity: `${KARI}/e/cp3`, claimVaultId: KARI, rung: "t:EitherContextFirstDegreeGrantee" },
  ],
  skills: [],
};

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
    if (url.startsWith(GEO_ORIGIN)) {
      geoReads.push(url);
      const row = GEO_ROWS[url];
      return row
        ? new Response(JSON.stringify({ "@id": url, "@type": row.type, label: row.label }), { status: 200, headers: { "content-type": "application/json" } })
        : new Response("{}", { status: 404 });
    }
    other.push(`${init?.method ?? "GET"} ${url}`);
    const method = String(init?.method ?? "GET").toUpperCase();
    if (url.includes("/base/connect/online-card-anchor"))
      return new Response(JSON.stringify(anchor.answer), { status: anchor.status, headers: { "content-type": "application/json" } });
    if (url.includes("/base/connect/public-card"))
      return new Response(JSON.stringify(KARI_CARD), { status: 200, headers: { "content-type": "application/json" } });
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
    contentScope: { readVaultId, readVault: null, vault: null, reach: null, vaultTargeted: true },
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
  geoReads = [];
  // GilbGeo's flags: Norway has one; Oslo (a city) and the unknown place have none.
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cycle214 s8 "card look" — Kai, 2026-10-16. The person card in two modes, each repeating set a framed group, the relations
// under human labels, the contact preferences as chips, the Record and Attachments set apart.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
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


const linked = (rec: BaseRecord) => {
  rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
};
const nameGroup = () => screen.getAllByTestId("card-group").find((g) => g.getAttribute("data-group") === "name")!;


const nameRecord = (rec: BaseRecord, name: string) => {
  // Kai's record on production: it holds only the whole name (no given or family name), linked to the person.
  const keep = (f: Record<string, unknown>) => Object.fromEntries(Object.entries(f).filter(([k]) => k !== "givenName" && k !== "familyName"));
  rec.facts = { ...keep(rec.facts as Record<string, unknown>), name } as never;
  rec.served = { facts: { ...keep(rec.facts as Record<string, unknown>), name, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
};
const openDetails = async () => {
  const user = userEvent.setup();
  const btn = document.querySelector<HTMLButtonElement>('section[aria-label="Details"] > button')!;
  await user.click(btn);
  return document.querySelector<HTMLElement>('section[aria-label="Details"]')!;
};

describe("C214-UI2 item 3: no Theirs / Yours badges; the chain link on a row of theirs, nothing on a row of yours", () => {
  it("every row of theirs carries one chain link and no badge words; no row of yours carries a mark", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    const theirs = await screen.findAllByTestId("one-card-row");
    expect(theirs.length).toBeGreaterThan(0);
    for (const row of theirs) {
      const marks = within(row).getAllByTestId("one-card-mark");
      expect(marks).toHaveLength(1);
      expect(marks[0]!.querySelector("svg path")?.getAttribute("d")).toContain("M10 14a4 4 0 0 0 5.7 0");
      expect(row.textContent).not.toContain("Theirs");
    }
    for (const row of screen.getAllByTestId("one-card-own-row")) expect(within(row).queryByTestId("one-card-mark")).toBeNull();
    const body = screen.getByTestId("one-card").textContent ?? "";
    expect(body).not.toContain("Yours · private");
    expect(body).not.toMatch(/\bTheirs\b/);
  });
});

describe("C214-UI2 item 4: no legend, no 'Click a value to edit it.', no 'their online card is the master'", () => {
  it("the linked card draws none of the three; Edit still says how it saves", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
    expect(screen.queryByText("Click a value to edit it.")).toBeNull();
    expect(screen.queryByText(/their online card is the master/i)).toBeNull();
    expect(screen.queryByTestId("card-mode-hint")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    expect(screen.getByTestId("card-mode-hint").textContent).toBe("Editing. Changes save as you leave a field.");
  });
});

describe("C214-UI2 item 2: the name is shown once (the online name) when the record holds only the whole name", () => {
  it("a whole name equal to theirs: their given and family rows, each 'You have the same', and no second pair of boxes", async () => {
    const { qc, rec } = personWorld();
    nameRecord(rec, "Kari Gilb");
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const name = nameGroup();
    const text = name.textContent ?? "";
    expect(text.split("Kari").length - 1).toBe(1);
    expect(text.split("Gilb").length - 1).toBe(1);
    expect(within(name).getAllByTestId("one-card-row-same")).toHaveLength(2);
    expect(within(name).queryAllByTestId("one-card-own-row")).toHaveLength(0);
    // Editing stays as it was: in Edit the holder's own boxes are there with his split name.
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    expect((within(nameGroup()).getByRole("textbox", { name: /Given Name/i }) as HTMLInputElement).value).toBe("Kari");
    expect((within(nameGroup()).getByRole("textbox", { name: /Family Name/i }) as HTMLInputElement).value).toBe("Gilb");
  });

  it("a whole name that DIFFERS from theirs is not hidden: theirs first, his plain under it, and the both-kept line", async () => {
    const { qc, rec } = personWorld();
    nameRecord(rec, "Kai Gilb");
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const name = nameGroup();
    const text = name.textContent ?? "";
    expect(text.indexOf("Kai")).toBeGreaterThan(text.indexOf("Kari"));
    expect(within(name).getAllByTestId("one-card-own-row").some((r) => r.textContent?.includes("Kai"))).toBe(true);
    expect(within(name).getByTestId("one-card-both-kept")).toBeTruthy();
    // the equal family name is still shown once
    expect(text.split("Gilb").length - 1).toBe(1);
  });

  it("nothing is written by opening the card (the names are the merge's input only)", async () => {
    const { qc, rec } = personWorld();
    nameRecord(rec, "Kari Gilb");
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    expect(appWrites).toEqual([]);
  });
});



describe("C214-UI2 item 6: who recorded the record is not on the card; Details still shows it", () => {
  it("a:statedBy is not drawn in the card's Record group, and Details lists Stated By", async () => {
    const { qc, rec } = personWorld({ statedBy: { "@id": "https://h.gilb.test/vault" } });
    (rec.facts as Record<string, unknown>).statedBy = "https://h.gilb.test/vault";
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    // SB1a: this fixture's master names no held-claim term, so the Interests and Languages groups say "The ontology did not name a/statedBy, …" (before, the missing
    // vault card hid both). That sentence is not the record's a:statedBy fact; the fact is what must not be drawn, so the two read-error alerts are set aside.
    const groups = screen.getByTestId("person-card-groups").cloneNode(true) as HTMLElement;
    groups.querySelectorAll('[data-testid$="read-error"]').forEach((n) => n.remove());
    expect(groups.textContent).not.toMatch(/stated/i);
  });
});

describe("C214-UI2 item 4: the type line under the shared contact header", () => {
  const mountContent = (qc: QueryClient, record: { id: string }) =>
    render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider
          value={{
            ...shell(record),
            vaults: [{ vaultId: P, entity: `${P}/e/vault`, name: "Gilb AS", parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: false }],
          } as unknown as ShellContextValue}
        >
          <RecordDetail placementMode="content" />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
  const typeLine = () => [...screen.getByTestId("record-body").querySelectorAll(":scope > p")].map((p) => p.textContent ?? "").filter((t) => /^Person/i.test(t));

  it("the card under the shared header has no 'Person' type line (the header says 'Person · online card')", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mountContent(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    expect(await screen.findByTestId("contact-shell-header")).toBeTruthy();
    expect(typeLine()).toEqual([]);
  });

  it("the right-pane style (full) record keeps its type line", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    expect(typeLine()).toEqual(["Person"]);
  });
});
