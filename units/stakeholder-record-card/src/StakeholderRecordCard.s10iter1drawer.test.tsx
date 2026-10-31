// Ported from GilbApp src/components/records/RecordDetail.s10iter1drawer.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 s10 iteration 1 FEEDBACK, round 2 (Agent.Tester B1, 2026-10-16): the header band in a NARROW header (the phone's Detail drawer, the right pane):
// small picture, compact (icon) Edit/Done and +, so the name keeps room. Widths are fed to the card through a stubbed ResizeObserver (jsdom has no layout);
// the real browser geometry is in the logs of this round. Harness copied from RecordDetail.s10iter1header.test.tsx.
import { RecordDetail, ShellContext, recordsKey, type ShellContextValue, seam } from "../test/app";
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


// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
// The header band: Edit / Done and the "+" live in the part of the record view that does not scroll, on the avatar-and-name line.
// jsdom has no layout, so the line is proved by the markup that makes it one line (one flex row, no wrap, the name truncates,
// the actions never shrink) and the real browser shots show it.
// ───────────────────────────────────────────────────────────────────────────────────────────────────────────────
const header = () => screen.getByTestId("record-header");
const actions = () => screen.getByTestId("record-header-actions");

let headerWidth = 0;
const ros: FakeRO[] = [];
class FakeRO {
  cb: ResizeObserverCallback;
  target: Element | null = null;
  constructor(cb: ResizeObserverCallback) {
    this.cb = cb;
    ros.push(this);
  }
  observe(el: Element) {
    this.target = el;
    queueMicrotask(() => this.cb([{ target: el, contentRect: { width: headerWidth } } as unknown as ResizeObserverEntry], this as unknown as ResizeObserver));
  }
  unobserve() {}
  disconnect() {}
}
/** The header is resized to `w` (the drawer opens wider): the observers are told. */
function resizeTo(w: number) {
  headerWidth = w;
  for (const r of ros) if (r.target) r.cb([{ target: r.target, contentRect: { width: w } } as unknown as ResizeObserverEntry], r as unknown as ResizeObserver);
}
function atWidth(w: number) {
  ros.length = 0;
  headerWidth = w;
  vi.stubGlobal("ResizeObserver", FakeRO);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const isHeader = this.getAttribute("data-testid") === "record-header";
    return { x: 0, y: 0, left: 0, top: 0, right: isHeader ? headerWidth : 0, bottom: 0, width: isHeader ? headerWidth : 0, height: 0, toJSON() {} } as DOMRect;
  });
}

beforeEach(() => {
  seam.bandIcon = ({ className }) => <span data-testid="stub-type-icon" className={className} />;
});

describe("s10 iter1 round 2 — the header in a narrow width", () => {
  it("a 303 px header (the 390 px phone's drawer): small picture, icon buttons, the name column keeps its room", async () => {
    atWidth(303);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("m"));
    const edit = within(header()).getByTestId("card-edit");
    expect(edit.getAttribute("aria-label")).toBe("Edit this card");
    expect(edit.textContent?.trim()).toBe("");
    expect(edit.querySelector("svg")).toBeTruthy();
    expect(edit.className).toMatch(/\bw-10\b/);
    expect(within(header()).getByTestId("card-add-info").className).toMatch(/\bw-10\b/);
    // the type icon (this harness has no vault, so no photo) is the small one
    expect(header().querySelector(".w-12.h-12")).toBeTruthy();
    expect(header().className).toMatch(/\bgap-2\b/);
    expect(header().className).toMatch(/\bpx-2\b/);
  });

  it("a 243 px header (the 320 px phone's drawer): the smallest picture, the same one line", async () => {
    atWidth(243);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("s"));
    expect(header().querySelector(".w-10.h-10")).toBeTruthy();
    expect(header().className).not.toMatch(/flex-wrap|flex-col/);
    expect(actions().parentElement).toBe(header());
  });

  it("Done is an icon button too in edit mode, keeps its name and its meaning", async () => {
    atWidth(303);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("m"));
    const user = userEvent.setup();
    await user.click(within(header()).getByTestId("card-edit"));
    const done = within(header()).getByTestId("card-done");
    expect(done.getAttribute("aria-label")).toBe("Done editing this card");
    expect(done.querySelector("svg")).toBeTruthy();
    await user.click(done);
    expect(modeOf()).toBe("presentation");
  });

  it("the compact buttons touch (no gap) and Edit and Done draw different icons (a pencil, a tick)", async () => {
    atWidth(303);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("m"));
    expect(actions().className).toMatch(/\bgap-0\b/);
    const pencil = within(header()).getByTestId("card-edit").querySelector("path")!.getAttribute("d");
    await userEvent.click(within(header()).getByTestId("card-edit"));
    const tick = within(header()).getByTestId("card-done").querySelector("path")!.getAttribute("d");
    expect(pencil).toBeTruthy();
    expect(tick).toBeTruthy();
    expect(tick).not.toBe(pencil);
    expect(tick).toMatch(/^M5 12/);
  });

  it("a wide header (900 px) keeps the large picture and the words Edit / Done", async () => {
    atWidth(900);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("l"));
    expect(within(header()).getByTestId("card-edit").textContent?.trim()).toBe("Edit");
    expect(header().className).toMatch(/\bgap-3\b/);
  });

  it("the tier follows the header when it is resized (a drawer opened wider)", async () => {
    atWidth(303);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("m"));
    act(() => resizeTo(900));
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("l"));
    expect(within(header()).getByTestId("card-edit").textContent?.trim()).toBe("Edit");
    act(() => resizeTo(243));
    await waitFor(() => expect(header().getAttribute("data-header-tier")).toBe("s"));
  });

  it("the header never gets a horizontal scroller of its own that could hide a button", async () => {
    atWidth(243);
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    expect(header().className).not.toMatch(/overflow-x|overflow-auto|overflow-scroll/);
    expect(actions().className).toMatch(/\bshrink-0\b/);
  });
});
