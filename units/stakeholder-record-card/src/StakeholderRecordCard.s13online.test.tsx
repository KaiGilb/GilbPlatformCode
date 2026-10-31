// Ported from GilbApp src/components/records/RecordDetail.s13online.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 s13 (O6): RecordDetail + the online-card frame, on the package's own fixture master and platform (harness copied from RecordDetail.s8cardlook.test.tsx).
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { ShellContext, ShellContextValue, recordsKey, RecordDetail, formatShortDate } from "../test/app";
import { forgetScreenLinks, setScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { editorFacts, extraKeysFromFacts } from "./recordFacts";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, render, screen, waitFor, within } from "@testing-library/react";
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


const P = "https://p.gilb.test/vault";
const Q = "https://q.gilb.test/vault";
const AGENT = "https://id.gilb.test/base/p/0b6c9a52-agent";

const KARI = "https://kari.gilb.test/vault";
const anchor = { status: 200, answer: { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" } as unknown };
const KARI_CARD = {
  principal: KARI,
  fields: [
    { principal: KARI, field: "a:givenName", value: "Kari", sourceEntity: `${KARI}/e/gn`, claimVaultId: KARI, rung: "public" },
    { principal: KARI, field: "a:email", value: "kari@example.org", sourceEntity: `${KARI}/e/em`, claimVaultId: KARI, rung: "public", kind: "email" },
  ],
  skills: [],
};
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

describe("s13 online and local cards on the real RecordDetail", () => {
  // Cycle214 S5d (Kai, spec Status 18f: "one card, not two"): the two-part body is replaced by ONE card; both sources stay marked.
  it("a person record linked to an online card draws ONE card with both sources marked; the card is read once on open (one resolve, one card read)", async () => {
    const { qc, rec } = personWorld();
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    expect(screen.queryByTestId("online-card-title")).toBeNull();
    expect(screen.queryByTestId("local-card-title")).toBeNull();
    expect(idReqs(/online-card-anchor/).length).toBe(1);
    expect(idReqs(/public-card/).length).toBe(1);
    expect(idReqs(/online-card-anchor/)[0]).toContain(encodeURIComponent("https://h.gilb.test/base/e/pn"));
    // their rows are read-only; the holder's own fields are on the same card
    for (const row of screen.getAllByTestId("one-card-row")) expect(within(row).queryAllByRole("textbox")).toHaveLength(0);
    expect(within(screen.getByTestId("one-card")).getByText("Tom")).toBeTruthy();
  });

  it("an unlinked person record asks neither the resolver nor any card, and offers to find one", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    expect(await screen.findByTestId("online-card-find-open")).toBeTruthy();
    expect(idReqs(/online-card-anchor|public-card/)).toEqual([]);
  });

  it("the link is the card's own: it is not drawn as an 'extra' fact and not an input", async () => {
    const { qc, rec } = personWorld();
    rec.facts = { ...rec.facts, sameAs: KARI };
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const local = screen.getByTestId("one-card");
    expect(within(local).queryByText(/Same.?As/i)).toBeNull();
    for (const box of within(local).queryAllByRole("textbox")) expect((box as HTMLInputElement).value).not.toBe(KARI);
    expect(local.textContent).not.toContain(KARI);
  });

  it("a save of the card (editing a name) never writes the link back, as text or otherwise", async () => {
    const { qc, rec } = personWorld();
    rec.facts = { ...rec.facts, sameAs: KARI };
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    const given = within(screen.getByTestId("one-card")).getByRole("textbox", { name: /Given Name/i });
    await user.clear(given);
    await user.type(given, "Tommy");
    await user.tab();
    await waitFor(() => expect(appWrites.length).toBeGreaterThan(0), { timeout: 4000 });
    expect(JSON.stringify(appWrites)).not.toContain("sameAs");
    expect(JSON.stringify(appWrites)).not.toContain(KARI);
  });

  it("a person opened from a LIST STUB (label only, no served document) shows the link once the whole record has been read, never 'not connected' from the stub", async () => {
    const { qc, rec } = personWorld();
    const stub = { ...rec, facts: { name: "Tom" }, served: undefined, hydrated: false } as unknown as BaseRecord;
    putList(qc, P, [stub]);
    mount(qc, stub);
    await waitFor(() => expect(screen.getByTestId("record-detail-content")).toBeTruthy(), { timeout: 4000 });
    expect(idReqs(/online-card-anchor|public-card/)).toEqual([]); // nothing asked on the stub's behalf
    expect(screen.queryByTestId("online-card-find-open")).toBeNull(); // and no "not connected" claimed from a stub
  });

  it("a record that is not a person card (a note) has no online card and no source marks", async () => {
    world();
    const qc = newQc();
    const note = { id: "nn", entityUri: "https://h.gilb.test/base/e/nn", typeUri: "t:Note", facts: { label: "A note" }, etag: '"sha256:0"', updatedAt: Date.now(), servedKeys: ["label"], opaqueFacts: [] } as unknown as BaseRecord;
    putList(qc, P, [note]);
    mount(qc, note);
    await waitFor(() => expect(screen.getByTestId("record-detail-content")).toBeTruthy());
    expect(screen.queryByTestId("online-card")).toBeNull();
    expect(screen.queryByTestId("local-card-title")).toBeNull();
    expect(idReqs(/online-card-anchor|public-card/)).toEqual([]);
  });

  it("an Organization record (the organization slice comes later) has no online card of its own and no source marks", async () => {
    const { qc } = personWorld();
    const org = { id: "og", entityUri: "https://h.gilb.test/base/e/og", typeUri: "t:Organization", facts: { name: "Butikk AS" }, etag: '"sha256:0"', updatedAt: Date.now(), servedKeys: ["name"], opaqueFacts: [] } as unknown as BaseRecord;
    putList(qc, P, [org]);
    mount(qc, org);
    await ready();
    expect(screen.queryByTestId("online-card")).toBeNull();
    expect(screen.queryByTestId("local-card-title")).toBeNull();
    expect(idReqs(/online-card-anchor|public-card/)).toEqual([]);
  });

  it("the search opens with the local card's own name (the card's party name) already in the box", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("online-card-find-open"));
    expect((screen.getByTestId("online-card-find-input") as HTMLInputElement).value).toBe("Tom");
  });

  it("Tester s24 A18: the card's own edit and extras never take the link in as a text fact", () => {
    const fields = [{ slug: "name", label: "Name" }] as never;
    const draft = { name: "Tom", sameAs: KARI, note: "x" };
    expect(Object.keys(editorFacts(fields, draft, []))).not.toContain("sameAs");
    expect(extraKeysFromFacts(fields, draft)).not.toContain("sameAs");
    expect(editorFacts(fields, { name: "Tom", sameAs: KARI }, ["sameAs"])).not.toHaveProperty("a:sameAs");
  });

  it("Tester s24 A21/A22: a person opened in a vault the holder may not write shows the online card and offers no Connect, Find or Unlink", async () => {
    const { qc, rec } = personWorld();
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    mount(qc, rec, false);
    await ready();
    await screen.findAllByTestId("one-card-row");
    for (const id of ["online-card-use", "used-from-online", "online-card-unlink", "one-card-unlink", "online-card-find-open"]) expect(screen.queryByTestId(id)).toBeNull();
  });

  it("when the platform refuses the link (no online card), the person card still shows, says so, and keeps the link", async () => {
    const { qc, rec } = personWorld();
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    anchor.status = 404;
    anchor.answer = { code: "no_online_card" };
    try {
      mount(qc, rec);
      await ready();
      expect(await screen.findByText(/The linked card cannot be opened from here now/)).toBeTruthy();
      expect(within(screen.getByTestId("one-card")).getByText("Tom")).toBeTruthy();
      expect(idReqs(/public-card/)).toEqual([]);
    } finally {
      anchor.status = 200;
      anchor.answer = { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" };
    }
  });
});

// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// Cycle214 M3f r4 (Agent.Tester s113 T23: "RecordDetail is not tested" for the section). On the real person card: the holder's
// other records linked to the same person are listed as "Your other cards of this person", each opening its record; the open record
// is not listed; an unlinked record has no such section; the section follows the screen while the card is open (N8).
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
describe("M3f r4 · 'Your other cards of this person' on the real RecordDetail", () => {
  const mountOpen = (qc: QueryClient, rec: { id: string }, open: (id: string) => void) =>
    render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={{ ...shell(rec), openRecordFromList: open } as ShellContextValue}>
          <RecordDetail />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
  afterEach(() => forgetScreenLinks());

  it("a linked person's card lists the holder's other linked records (not itself), with a date, and a row opens its record", async () => {
    const { qc, rec } = personWorld();
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    const when = Date.UTC(2026, 9, 18, 12);
    setScreenLinks(AGENT, new Map([[KARI, "pn"]]), new Map([[KARI, [{ id: "pn", title: "Tom", vaultId: P, updatedAt: when }, { id: "pn2", title: "Tom (home)", vaultId: P, updatedAt: when }]]]));
    const open = vi.fn();
    mountOpen(qc, rec, open);
    await ready();
    const section = await screen.findByTestId("other-linked-records");
    expect(within(screen.getByTestId("person-card-groups")).getByTestId("other-linked-records")).toBe(section);
    expect(within(section).getByText("Your other cards of this person")).toBeTruthy();
    const rows = within(section).getAllByTestId("other-linked-record");
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Tom (home)");
    expect(rows[0].textContent).toContain(formatShortDate(when));
    await userEvent.setup().click(rows[0]);
    expect(open).toHaveBeenCalledWith("pn2");
  });

  it("follows the screen while open (N8): the other record gone from the screen, the section goes", async () => {
    const { qc, rec } = personWorld();
    rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
    setScreenLinks(AGENT, new Map([[KARI, "pn"]]), new Map([[KARI, [{ id: "pn", title: "Tom" }, { id: "pn2", title: "Tom (home)" }]]]));
    mountOpen(qc, rec, () => {});
    await ready();
    await screen.findByTestId("other-linked-records");
    act(() => setScreenLinks(AGENT, new Map([[KARI, "pn"]]), new Map([[KARI, [{ id: "pn", title: "Tom" }]]])));
    await waitFor(() => expect(screen.queryByTestId("other-linked-records")).toBeNull());
  });

  it("an unlinked person record has no such section, whatever the screen holds", async () => {
    const { qc, rec } = personWorld();
    setScreenLinks(AGENT, new Map([[KARI, "pn"]]), new Map([[KARI, [{ id: "pn", title: "Tom" }, { id: "pn2", title: "Tom (home)" }]]]));
    mountOpen(qc, rec, () => {});
    await ready();
    expect(screen.queryByTestId("other-linked-records")).toBeNull();
  });
});
