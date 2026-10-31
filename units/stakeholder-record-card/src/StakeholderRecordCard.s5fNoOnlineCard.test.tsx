// Ported from GilbApp src/components/records/RecordDetail.s5fNoOnlineCard.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 S5f: the SAME one card for a person with NO online card (approved mockup v6 tab D), on the real RecordDetail. Spec
// 3P.F.Stakeholders.OnlineAndLocalCards.GilbApp Status 18f (Kai: "one card"; without an online card the card is the local card as today).
// Design note C214-OneCard-Design-Architect-2026-10-18 §4 ("Marks: only when there are two sources"); MyNet S5g's rule: no marks and
// no legend without a row of theirs. Harness copied from RecordDetail.s5dOneCard.test.tsx (plus the platform's name search).
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
  ],
  skills: [],
};
/** The platform's answer to a name search (the existing Find): Kari, whose card publishes an email to the holder. */
const findAnswer = { total: 1, connectVaultId: "x", matches: [{ principal: KARI, field: "a:givenName", value: "Kari", sourceEntity: `${KARI}/e/gn`, claimVaultId: KARI, rung: "public" }] };
/** The record document the vault serves on a re-read (set by a test that writes), else none. */
/** Tester s60 round: the app's own writes answer 500 while set; extra headers on the resolver's answer (a 429's Retry-After). */
let failWrites = false;
let anchorHeaders: Record<string, string> = {};
let servedDoc: { url: string; doc: Record<string, unknown> } | null = null;
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
      return new Response(JSON.stringify(anchor.answer), { status: anchor.status, headers: { "content-type": "application/json", ...anchorHeaders } });
    if (url.includes("/base/connect/find-by-name"))
      return new Response(JSON.stringify(findAnswer), { status: 200, headers: { "content-type": "application/json" } });
    if (url.includes("/base/connect/public-card"))
      return new Response(JSON.stringify(KARI_CARD), { status: 200, headers: { "content-type": "application/json" } });
    // The record as the vault serves it after a write (the app reads it again after a link change, one request).
    if (method === "GET" && servedDoc && url === servedDoc.url)
      return new Response(JSON.stringify(servedDoc.doc), { status: 200, headers: { "content-type": "application/json", etag: '"sha256:1"' } });
    if (method !== "GET" && failWrites) return new Response(JSON.stringify({ error: "refused 500" }), { status: 500, headers: { "content-type": "application/json" } });
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
  servedDoc = null;
  failWrites = false;
  anchorHeaders = {};
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
const groupOf = (kind: string) => document.querySelector<HTMLElement>(`section[data-group="${kind}"]`);

describe("S5f: a person with no online card has the same one card (mockup tab D)", () => {
  it("one body: no two-part frame, no marks, no legend, no row of theirs; the card's own groups as today", async () => {
    const { qc, rec } = personWorld({ email: "tom@home.org" });
    mount(qc, rec);
    await ready();
    const card = await screen.findByTestId("one-card");
    expect(card.getAttribute("data-online-status")).toBe("none");
    for (const id of ["online-and-local", "local-card-side", "local-card-title", "online-card-title", "online-card"]) expect(screen.queryByTestId(id)).toBeNull();
    expect(screen.queryByText("My card of them")).toBeNull();
    expect(screen.queryByText("Their online card")).toBeNull();
    expect(screen.queryAllByTestId("one-card-mark")).toHaveLength(0);
    expect(screen.queryAllByTestId("one-card-own-row")).toHaveLength(0);
    expect(screen.queryAllByTestId("one-card-own-block")).toHaveLength(0);
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
    expect(screen.queryAllByTestId("one-card-row")).toHaveLength(0);
    expect(screen.queryByTestId("one-card-foot")).toBeNull(); // the linked foot (Connected / Unlink) is not drawn
    // the holder's own values are in the card's own groups, inside the one body
    expect(within(card).getByText("tom@home.org")).toBeTruthy();
    expect(within(card).getByText("Gilb")).toBeTruthy();
    // no "+ Add your own" (nothing of theirs to add beside); "+ Add Information" as today
    expect(screen.queryAllByTestId("add-own")).toHaveLength(0);
    expect(within(card).getByRole("button", { name: /Add Information/i })).toBeTruthy();
    // the type line does not claim a master
    expect(screen.queryByText(/their online card is the master/i)).toBeNull();
  });

  it("the card's foot offers 'Find their online card' (the existing Find); opening the card asks neither the resolver nor any card", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const foot = await screen.findByTestId("one-card-find-foot");
    expect(foot.textContent).toContain("No online card is connected.");
    expect(within(foot).getByTestId("online-card-find-open")).toHaveTextContent("Find their online card");
    // the foot is the card's last part: after the card's own groups
    const card = screen.getByTestId("one-card");
    expect(card.lastElementChild).toBe(foot);
    await new Promise((r) => setTimeout(r, 300));
    expect(idReqs(/online-card-anchor|public-card|find-by-name/)).toEqual([]);
    expect(appWrites).toEqual([]);
  });

  it("Find and connect: the search opens with the card's name, one Connect writes the link alone, and the card becomes the linked one card without a reload", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("online-card-find-open"));
    expect((screen.getByTestId("online-card-find-input") as HTMLInputElement).value).toBe("Tom");
    // the search panel is in the card's foot
    expect(within(screen.getByTestId("one-card-find-foot")).getByTestId("online-card-find")).toBeTruthy();
    await user.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate", undefined, { timeout: 4000 });
    expect(appWrites).toEqual([]);
    // after the link write the vault serves the record with its link (the app's one re-read)
    servedDoc = {
      url: "https://h.gilb.test/lws/r/pn",
      doc: { "@id": rec.entityUri, "@type": "t:Person", "a:name": "Tom", "a:givenName": "Tom", "a:familyName": "Gilb", "a:webAddress": "gilb.com", "a:sameAs": { "@id": KARI } },
    };
    await user.click(within(cands.find((c) => c.getAttribute("data-principal") === KARI)!).getByTestId("online-card-connect"));
    await waitFor(() => expect(appWrites.length).toBe(1), { timeout: 4000 });
    expect(appWrites[0]!.method).toBe("PATCH");
    expect(appWrites[0]!.url).toBe("https://h.gilb.test/lws/r/pn");
    expect(appWrites[0]!.body).toEqual({ "a:sameAs": { "@id": KARI } });
    // now linked: their rows, the marks and the legend appear, and the foot says so (no reload, the same card)
    await screen.findAllByTestId("one-card-row", undefined, { timeout: 4000 });
    // C214-UI2 (changed on purpose, Kai "Just remove all this, less is more"): no legend; the chain link marks their rows.
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
    expect(screen.getAllByTestId("one-card-mark").length).toBeGreaterThan(0);
    expect(screen.getByTestId("one-card-foot").textContent).toContain("Connected to their online card.");
    expect(screen.queryByTestId("one-card-find-foot")).toBeNull();
    expect(within(groupOf("email")!).getAllByTestId("one-card-row-value").map((v) => v.textContent)).toEqual(["kari@example.org"]);
  });

  it("after Unlink the card is this same one card with one source, and its foot offers Find again", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    servedDoc = {
      url: "https://h.gilb.test/lws/r/pn",
      doc: { "@id": rec.entityUri, "@type": "t:Person", "a:name": "Tom", "a:givenName": "Tom", "a:familyName": "Gilb", "a:webAddress": "gilb.com" },
    };
    const user = userEvent.setup();
    await user.click(screen.getByTestId("one-card-unlink"));
    await user.click(screen.getByTestId("one-card-unlink-confirm"));
    await waitFor(() => expect(appWrites.length).toBe(1), { timeout: 4000 });
    expect(appWrites[0]!.body).toEqual({ "a:sameAs": null });
    const foot = await screen.findByTestId("one-card-find-foot", undefined, { timeout: 4000 });
    expect(within(foot).getByTestId("online-card-find-open")).toBeTruthy();
    expect(screen.queryAllByTestId("one-card-row")).toHaveLength(0);
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
    expect(screen.queryByTestId("local-card-title")).toBeNull();
  });

  it("Tester s60 D1: a failed Connect is said in the foot, announced (role alert), the focus moves to it, and nothing is linked", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("online-card-find-open"));
    await user.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate", undefined, { timeout: 4000 });
    failWrites = true;
    await user.click(within(cands[0]!).getByTestId("online-card-connect"));
    const foot = screen.getByTestId("one-card-find-foot");
    const alert = await within(foot).findByRole("alert", undefined, { timeout: 4000 });
    expect(alert.textContent).toMatch(/could not be connected/i);
    await waitFor(() => expect(document.activeElement).toBe(alert));
    // said once: not also at the top of the card
    expect(screen.getAllByRole("alert").filter((a) => /refused 500|could not be connected/i.test(a.textContent ?? ""))).toHaveLength(1);
    expect(screen.getByTestId("one-card").getAttribute("data-online-status")).toBe("none");
    // a second Connect is still there and, when it works, the message goes
    failWrites = false;
    await user.click(within(screen.getAllByTestId("online-card-candidate")[0]!).getByTestId("online-card-connect"));
    await waitFor(() => expect(appWrites.length).toBe(1), { timeout: 4000 });
  });

  it("Tester s60 F2: a busy card (429) offers Try again, disabled for the wait, which then reads the card again", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    anchor.status = 429;
    anchor.answer = {};
    anchorHeaders = { "retry-after": "1" };
    try {
      mount(qc, rec);
      await ready();
      const status = await screen.findByTestId("one-card-status", undefined, { timeout: 4000 });
      expect(status.textContent).toMatch(/busy just now/);
      expect(status.textContent).not.toMatch(/come when it answers/);
      const retry = within(screen.getByTestId("one-card")).getByTestId("one-card-retry");
      expect(retry).toBeDisabled();
      const asked = idReqs(/online-card-anchor/).length;
      anchor.status = 200;
      anchor.answer = { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" };
      anchorHeaders = {};
      await waitFor(() => expect(screen.getByTestId("one-card-retry")).not.toBeDisabled(), { timeout: 4000 });
      await userEvent.setup().click(screen.getByTestId("one-card-retry"));
      await waitFor(() => expect(idReqs(/online-card-anchor/).length).toBeGreaterThan(asked), { timeout: 4000 });
      await screen.findAllByTestId("one-card-row", undefined, { timeout: 4000 });
      expect(screen.queryByTestId("one-card-retry")).toBeNull();
    } finally {
      anchor.status = 200;
      anchor.answer = { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" };
      anchorHeaders = {};
    }
  });

  it("Cancel closes the search and writes nothing", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("online-card-find-open"));
    await user.click(screen.getByTestId("online-card-find-cancel"));
    expect(screen.getByTestId("online-card-find-open")).toBeTruthy();
    expect(appWrites).toEqual([]);
  });

  it("a read-only holder sees the same one card and the foot's words, and no Find", async () => {
    const { qc, rec } = personWorld({ email: "tom@home.org" });
    mount(qc, rec, false);
    await ready();
    const foot = await screen.findByTestId("one-card-find-foot");
    // Tester s60 F3: it is not the reader's card, and she is not the only one who sees it
    expect(foot.textContent?.trim()).toBe("No online card is connected.");
    expect(screen.queryByTestId("online-card-find-open")).toBeNull();
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
    expect(screen.queryAllByTestId("one-card-mark")).toHaveLength(0);
    expect(screen.queryAllByTestId("add-own")).toHaveLength(0);
    expect(screen.queryByTestId("local-card-title")).toBeNull();
  });

  it("an own edit sends the same request as before (editing the given name)", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    const given = within(screen.getByTestId("record-detail-content")).getByRole("textbox", { name: /Given Name/i });
    await user.clear(given);
    await user.type(given, "Tommy");
    await user.tab();
    await waitFor(() => expect(appWrites.length).toBe(1), { timeout: 4000 });
    expect(appWrites[0]).toEqual({ method: "PATCH", url: "https://h.gilb.test/lws/r/pn", body: { "a:givenName": "Tommy", "a:name": "Tommy Gilb" }, ifMatch: '"sha256:0"' });
  });

  it("a link that resolves to nothing: the same one card, the platform's words, Unlink in the foot, and no marks or legend", async () => {
    const { qc, rec } = personWorld({ email: "tom@home.org" });
    linked(rec);
    anchor.status = 404;
    anchor.answer = { code: "no_online_card" };
    try {
      mount(qc, rec);
      await ready();
      expect(await screen.findByText(/The linked card cannot be opened from here now/)).toBeTruthy();
      const card = screen.getByTestId("one-card");
      expect(within(card).getByText("tom@home.org")).toBeTruthy();
      expect(screen.queryByTestId("one-card-legend")).toBeNull();
      expect(screen.queryAllByTestId("one-card-mark")).toHaveLength(0);
      expect(screen.getByTestId("one-card-foot").textContent).toContain("Connected to their online card.");
      expect(screen.getByTestId("one-card-unlink")).toBeTruthy();
      expect(screen.queryByTestId("one-card-find-foot")).toBeNull();
      expect(screen.queryByTestId("online-card")).toBeNull();
    } finally {
      anchor.status = 200;
      anchor.answer = { surface: "connect-online-card-anchor/1", kind: "person", principal: KARI, vaultId: null, entity: KARI, vaultRepresents: "t/Person" };
    }
  });

  it("a record that carries two links: the same one card, and the foot says no online card is chosen", async () => {
    const { qc, rec } = personWorld();
    rec.served = { facts: { ...rec.facts, sameAs: [{ "@id": KARI }, { "@id": "https://other.gilb.test/vault" }] }, context: undefined, etag: rec.etag };
    mount(qc, rec);
    await ready();
    const foot = await screen.findByTestId("one-card-find-foot");
    expect(foot.textContent).toContain("more than one link");
    expect(screen.queryByTestId("online-card")).toBeNull();
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
  });


});
