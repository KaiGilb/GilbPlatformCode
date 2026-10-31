// Ported from GilbApp src/components/records/RecordDetail.s8cardlook.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Copied harness of RecordDetail.stakeholderCard.c214.test.tsx (the package's own fixture master and platform), for the s8 "card look" cases below.
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { recordsKey, recordsSnapshotKey, RecordDetail, ShellContext, type ShellContextValue } from "../test/app";
import { addInformation } from "../test/cardChooser";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { fixtureMaster, RIG, ID } from "../test/fixtureMaster";
import { withReferenceTerms } from "../test/fixtureReference";
import { fixturePlatform, VAULT_HOST, type FixturePlatform } from "../test/fixturePlatform";


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
const modeOf = () => screen.getByTestId("card-mode-root").getAttribute("data-card-mode");

describe("s8 card look — presentation is the default and hides what edits", () => {
  it("opens in PRESENTATION: the values as text in framed, titled groups; no (−), no input, no 'add …', no empty field", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(screen.getByTestId("card-mode-root")).toBeTruthy());
    expect(modeOf()).toBe("presentation");
    const content = screen.getByTestId("record-detail-content");
    // names and web address read as text
    expect(within(content).getByText("Tom")).toBeTruthy();
    expect(within(content).getByText("Gilb")).toBeTruthy();
    expect(within(content).getByText("gilb.com")).toBeTruthy();
    // nothing that edits
    expect(within(content).queryAllByRole("textbox")).toHaveLength(0);
    expect(content.querySelectorAll("[data-remove-control]")).toHaveLength(0);
    expect(within(content).queryByText(/^add /i)).toBeNull();
    expect(within(content).queryByText(/^Add /)).toBeNull();
    expect(within(content).getAllByTestId("field-present").length).toBeGreaterThan(0);
    // every group is a titled frame
    const groups = within(content).getAllByTestId("card-group");
    expect(groups.length).toBeGreaterThan(0);
    for (const g of groups) {
      expect(g.getAttribute("aria-labelledby")).toBeTruthy();
      expect(g.querySelector("h3")?.textContent?.trim()).toBeTruthy();
    }
  });

  it("an EMPTY card shows no empty groups, no placeholders and no add rows; only the name and the way into edit mode", async () => {
    const { qc, rec } = personWorld();
    const bare = { ...rec, facts: { name: "Tom" }, servedKeys: [] } as BaseRecord;
    putList(qc, P, [bare]);
    mount(qc, bare);
    await ready();
    const content = screen.getByTestId("record-detail-content");
    expect(within(content).queryByTestId("email-rows")).toBeNull();
    expect(within(content).queryByTestId("phone-rows")).toBeNull();
    expect(within(content).queryByTestId("address-rows")).toBeNull();
    expect(within(content).queryByTestId("employment-rows")).toBeNull();
    expect(within(content).queryByText(/Add web address/)).toBeNull();
    expect(within(content).queryByText(/None yet/)).toBeNull();
    expect(within(content).queryByRole("heading", { name: "Relations" })).toBeNull();
    expect(within(content).queryByRole("heading", { name: "Contact preferences" })).toBeNull();
    expect(screen.getByTestId("card-edit")).toBeTruthy();
  });

  it("on a card with nothing to click, Edit shows the name boxes and the foot button; a kind of information is ADDED from the chooser, and is gone again after Done", async () => {
    const { qc, rec } = personWorld();
    const bare = { ...rec, facts: { name: "Tom" }, servedKeys: [] } as BaseRecord;
    putList(qc, P, [bare]);
    mount(qc, bare);
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    expect(modeOf()).toBe("edit");
    const content = screen.getByTestId("record-detail-content");
    // what the card has (the name boxes) and the way to add the rest; no empty groups, no placeholders
    expect(within(content).getAllByRole("textbox")).toHaveLength(2); // given and family name
    expect(within(content).queryByRole("heading", { name: "Relations" })).toBeNull();
    expect(within(content).queryByText("Add web address")).toBeNull();
    expect(screen.getByTestId("card-add-info-button").textContent).toBe("+ Add Information");
    await user.click(screen.getByTestId("card-add-info-button"));
    const sheet = screen.getByTestId("add-information-sheet");
    expect(within(sheet).getByRole("heading", { name: "Connection points" })).toBeTruthy();
    expect(within(sheet).getByRole("button", { name: /Email/ })).toBeTruthy();
    expect(within(sheet).queryByRole("button", { name: "Name" })).toBeNull(); // the name boxes are shown
    await user.click(within(sheet).getByRole("button", { name: "Record" }));
    // s10 iter1: the pick opens the empty field AND puts the cursor in it (it used to leave an "Add web address" button to press)
    expect(document.activeElement).toBe(within(content).getByRole("textbox", { name: "Edit Web Address" }));
    await user.click(screen.getByTestId("card-done"));
    expect(modeOf()).toBe("presentation");
    expect(within(content).queryByText("Add web address")).toBeNull();
    expect(within(content).queryByRole("heading", { name: "Relations" })).toBeNull();
  });

  it("a CLICK on a value enters edit mode and edits THAT value in place; leaving saves it once, with If-Match; the card is back in presentation after Done", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit Web Address" }));
    expect(modeOf()).toBe("edit");
    const box = screen.getByRole("textbox", { name: "Edit Web Address" }) as HTMLInputElement;
    expect(document.activeElement).toBe(box);
    await user.clear(box);
    await user.type(box, "www.gilb.com");
    await user.tab();
    await waitFor(() => expect(appWrites.some((w) => w.body["a:webAddress"] === "www.gilb.com")).toBe(true), { timeout: 4000 });
    expect(appWrites.filter((w) => "a:webAddress" in w.body)).toHaveLength(1);
    expect(appWrites.find((w) => "a:webAddress" in w.body)!.ifMatch).toBe('"sha256:0"');
    // Tab moved to the next control of the card (its "+ Add Information"): still editing; Done returns to presentation.
    expect(modeOf()).toBe("edit");
    await user.click(screen.getByTestId("card-done"));
    expect(modeOf()).toBe("presentation");
    expect(within(screen.getByTestId("record-detail-content")).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("a click on a NAME enters edit mode and puts the cursor in that name's box", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Edit Family Name" }));
    expect(modeOf()).toBe("edit");
    const box = screen.getByDisplayValue("Gilb") as HTMLInputElement;
    expect(document.activeElement).toBe(box);
  });

  it("a card that may not be written (no grant) shows text only: no Edit button, nothing to click", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    // the card reads its write grant from the shell: a read-only shell
    cleanup();
    const s = shell(rec);
    (s as unknown as { writeGuard: { allowed: boolean; reason: string } }).writeGuard = { allowed: false, reason: "read only" };
    render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={s}>
          <RecordDetail />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
    await ready();
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect((screen.getByRole("button", { name: "Edit Web Address" }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(screen.getByTestId("record-detail-content")).getByText("gilb.com")).toBeTruthy();
  });
});

describe("s8 card look — relations under human labels, preferences as chips", () => {
  function linkWorld(tomFacts: Record<string, unknown> = {}) {
    world();
    const inner = globalThis.fetch;
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
      String(input).startsWith(VAULT_HOST)
        ? platform.fetch(String(input).replace(VAULT_HOST, new URL(Q).origin), init)
        : inner(input, init),
    );
    const ownersQ = platform.seed(Q, "t:PartyGroup", { "a:name": "Owners" });
    const tom = platform.seed(Q, "t:Person", { "a:name": "Tom", ...Object.fromEntries(Object.entries(tomFacts).map(([k, v]) => [`a:${k}`, v])) });
    const id = tom.split("/").pop()!;
    const rec = personRecord(id, tom, tomFacts);
    const qc = newQc();
    const row = (r: BaseRecord, v: string) => ({ ...r, sourceVaultId: v });
    qc.setQueryData(recordsSnapshotKey(P, "live", "Person"), { records: [row(rec, P)], scannedVaults: [Q], coverage: {} });
    qc.setQueryData(recordsSnapshotKey(Q, "live", "Person"), { records: [row(rec, Q)], scannedVaults: [], coverage: {} });
    putList(qc, P, [rec]);
    return { ownersQ, tom, rec, qc };
  }

  it("a chosen link is a row inside its frame; in edit it has the (−) and the picker; in presentation neither, and no raw address", async () => {
    const { rec, qc, ownersQ } = linkWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    expect(screen.queryByRole("region", { name: "Member of" })).toBeNull();
    await addInformation("Member of");
    const g = await screen.findByRole("region", { name: "Member of" });
    await user.type(within(g).getByRole("textbox"), "Ow");
    await user.click(await within(g).findByRole("button", { name: "Owners" }, { timeout: 4000 }));
    await within(g).findByTestId("stakeholder-reference-answer", {}, { timeout: 4000 });
    expect(JSON.stringify(platform.requests.filter((r) => r.method === "PATCH")[0]!.body)).toContain(ownersQ);
  });

  it("a stored link in PRESENTATION: the name in a titled frame with the group's icon; no (−), no picker, no 'Added.', no raw address", async () => {
    const world0 = linkWorld();
    const rec = { ...world0.rec, facts: { ...world0.rec.facts, memberOf: world0.ownersQ }, servedKeys: ["memberOf"] } as BaseRecord;
    rec.served = { facts: { name: "Tom", memberOf: world0.ownersQ }, context: undefined, etag: rec.etag };
    putList(world0.qc, P, [rec]);
    mount(world0.qc, rec);
    await ready();
    const g = await screen.findByRole("region", { name: "Member of" });
    await waitFor(() => expect(within(g).getByText("Owners")).toBeTruthy(), { timeout: 4000 });
    expect(g.querySelector("svg[data-card-icon='memberOf']")).toBeTruthy();
    expect(g.querySelector("[data-remove-control]")).toBeNull();
    expect(within(g).queryByRole("textbox")).toBeNull();
    expect(g.textContent).not.toMatch(/https?:\/\//);
    // in edit mode the same row has its (−) and the picker
    await userEvent.click(screen.getByTestId("card-edit"));
    const ge = await screen.findByRole("region", { name: "Member of" });
    expect(within(ge).getByTestId("stakeholder-link-remove")).toBeTruthy();
    expect(within(ge).getByRole("textbox")).toBeTruthy();
  });

  it("the preferred contact channel is a selected chip in presentation; in edit the other contact values are chips to choose", async () => {
    const { rec: r0, qc } = linkWorld({ email: "tom@example.test", webAddress: "gilb.com", preferredChannel: "https://veda.gilb.com/base/a/email" });
    const rec = asRead(r0);
    mount(qc, rec);
    await ready();
    const shown = await screen.findByRole("region", { name: /Preferred contact channel/i });
    const chip = shown.querySelector("[data-chip='selected']");
    expect(chip?.textContent).toContain("Email address");
    expect(shown.querySelector("[data-chip='choice']")).toBeNull();
    expect(shown.querySelector("[data-remove-control]")).toBeNull();
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    const g = await screen.findByRole("region", { name: /Preferred contact channel/i });
    expect(g.querySelector("[data-chip='selected'] [data-remove-control]")).toBeTruthy();
    // Email is the one contact value this record holds and it is chosen already: nothing is left to choose, and the card says so.
    await waitFor(() => expect(within(g).getByTestId("stakeholder-channel-none")).toBeTruthy(), { timeout: 4000 });
  });

  it("with no channel chosen, the record's contact values are chips to choose, each at least 40 px", async () => {
    const { rec, qc } = linkWorld({ email: "tom@example.test" });
    mount(qc, asRead(rec));
    await ready();
    expect(screen.queryByRole("region", { name: /Preferred contact channel/i })).toBeNull();
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Preferred Contact Channel");
    const g = await screen.findByRole("region", { name: /Preferred contact channel/i });
    const chip = await within(g).findByRole("button", { name: "Email address" }, { timeout: 4000 });
    expect(chip.getAttribute("data-chip")).toBe("choice");
    expect(chip.className).toMatch(/min-h-10/);
  });

  it("the sections are set apart under their own headings, each relation frame INSIDE Relations and the channel inside Contact preferences", async () => {
    const { rec, qc } = linkWorld({ email: "tom@example.test" });
    mount(qc, asRead(rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Member of");
    await addInformation("Preferred Contact Channel");
    const content = screen.getByTestId("record-detail-content");
    await within(content).findByRole("heading", { name: "Relations" });
    const heads = within(content).getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(heads).toEqual(expect.arrayContaining(["Relations", "Contact preferences"]));
    const rel = screen.getByTestId("card-section-relations");
    expect(within(rel).getByRole("region", { name: "Member of" })).toBeTruthy();
    const pref = screen.getByTestId("card-section-preferences");
    expect(within(pref).getByRole("region", { name: /Preferred contact channel/i })).toBeTruthy();
  });
});

describe("s8 card look — the other kinds and the new card", () => {
  it("a plain field with no value is not drawn in presentation and is drawn in edit (a kind with no name pair: the plain box)", async () => {
    world();
    const qc = newQc();
    const rec = personRecord("np1", "https://h.gilb.test/base/e/np1", { name: "Tom" });
    putList(qc, P, [rec]);
    mount(qc, rec);
    await ready();
    const content = screen.getByTestId("record-detail-content");
    expect(within(content).queryByText("Email address")).toBeNull();
    expect(within(content).getByText("Tom")).toBeTruthy();
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(within(content).getByText("Email address")).toBeTruthy();
  });

  it("the places for My Note and Where / How we met stand under the header, above the Name group, in that order; the contact chips sit beside the name", async () => {
    const { qc, rec } = personWorld();
    cleanup();
    render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={shell(rec)}>
          <RecordDetail slots={{ howWeMet: <p data-testid="hwm">met</p>, myNote: <p data-testid="mn">note</p>, nameAside: <span data-testid="chips">friend</span> }} />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
    await ready();
    const root = screen.getByTestId("person-card-groups");
    const order = [...root.children].map((e) => e.getAttribute("data-card-slot") ?? e.getAttribute("data-group") ?? e.getAttribute("data-testid"));
    expect(order.indexOf("card-top-slots")).toBeLessThan(order.indexOf("name"));
    const slots = [...screen.getByTestId("card-top-slots").children].map((e) => e.getAttribute("data-card-slot"));
    expect(slots).toEqual(["my-note", "how-we-met"]);
    expect(within(screen.getByRole("region", { name: "Name" })).getByTestId("chips")).toBeTruthy();
  });



  it("a brand-new record opens in edit mode with its name box ready (nothing else to type into)", async () => {
    const { qc, rec } = personWorld();
    const { markFreshlyCreated } = await import("@kaigilb/gilbplatformcode-plan-record-hooks");
    const bare = { ...rec, facts: { name: "" }, servedKeys: [] } as BaseRecord;
    markFreshlyCreated(bare.id);
    putList(qc, P, [bare]);
    mount(qc, bare);
    await ready();
    expect(modeOf()).toBe("edit");
    expect(within(screen.getByTestId("record-detail-content")).getAllByRole("textbox").length).toBe(2);
  });

  it("an existing record with nothing opens in presentation, with the Edit link and the + to begin", async () => {
    const { qc, rec } = personWorld();
    const bare = { ...rec, facts: { name: "" }, servedKeys: [] } as BaseRecord;
    putList(qc, P, [bare]);
    mount(qc, bare);
    await ready();
    expect(modeOf()).toBe("presentation");
    expect(screen.getByTestId("card-edit")).toBeTruthy();
    expect(screen.getByTestId("card-add-info")).toBeTruthy();
  });
});
