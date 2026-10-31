// Ported from GilbApp src/components/records/RecordDetail.s10iter1header.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 s10 iteration 1 FEEDBACK (Kai, 2026-10-16, verbatim): "the Done and + buttons vanish when scrolling down the page. It needs to
// be moved up above the scroll, below the +New and on the same line as the profile picture and name (do not make its own new line)."
// Harness copied from RecordDetail.s8cardlook.test.tsx (the package's own fixture master and platform), for the cases at the foot.
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
const body = () => screen.getByTestId("record-body");
const actions = () => screen.getByTestId("record-header-actions");

describe("s10 iter1 — Done / Edit and + sit in the fixed header band, on the avatar-and-name line", () => {
  it("in EDIT mode Done and + are in the header band and NOT in the scrolling body", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    // the defect itself, independent of any new markup: no scrolling ancestor holds the buttons
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.getByTestId("card-done").closest(".overflow-auto")).toBeNull();
    expect(screen.getByTestId("card-add-info").closest(".overflow-auto")).toBeNull();
    await userEvent.click(screen.getByTestId("card-done"));
    await userEvent.click(within(header()).getByTestId("card-edit"));
    expect(modeOf()).toBe("edit");
    const done = within(header()).getByTestId("card-done");
    const plus = within(header()).getByTestId("card-add-info");
    expect(actions().contains(done)).toBe(true);
    expect(actions().contains(plus)).toBe(true);
    expect(body().contains(done)).toBe(false);
    expect(body().contains(plus)).toBe(false);
    expect(within(body()).queryByTestId("card-done")).toBeNull();
    expect(within(body()).queryByTestId("card-add-info")).toBeNull();
  });

  it("in PRESENTATION the Edit control and the + are in the same place, not in the body", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    expect(modeOf()).toBe("presentation");
    expect(screen.getByTestId("card-edit").closest(".overflow-auto")).toBeNull();
    expect(actions().contains(within(header()).getByTestId("card-edit"))).toBe(true);
    expect(actions().contains(within(header()).getByTestId("card-add-info"))).toBe(true);
    expect(within(body()).queryByTestId("card-edit")).toBeNull();
    expect(within(body()).queryByTestId("card-add-info")).toBeNull();
  });

  it("the header is NOT inside the scroll region: it is a fixed (flex-none) sibling above the one scrolling body", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const detail = screen.getByTestId("record-detail");
    expect(header().parentElement).toBe(detail);
    expect(body().parentElement).toBe(detail);
    expect(header().className).toMatch(/\bflex-none\b/);
    expect(body().className).toMatch(/\boverflow-auto\b/);
    expect(header().compareDocumentPosition(body()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("the actions are on the SAME line as the name: one flex row, no wrap, the name block truncates, the actions never shrink, no extra row", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const title = within(header()).getByRole("heading", { level: 2 });
    const nameBlock = title.parentElement!;
    // the name block and the actions are two children of the SAME flex row (the header itself); no row of their own
    expect(nameBlock.parentElement).toBe(header());
    expect(actions().parentElement).toBe(header());
    expect(header().className).toMatch(/\bflex\b/);
    expect(header().className).toMatch(/\bitems-center\b/);
    expect(header().className).not.toMatch(/flex-wrap|flex-col/);
    expect(nameBlock.className).toMatch(/\bmin-w-0\b/);
    expect(title.className).toMatch(/\bline-clamp-2\b|\btruncate\b/); // the name wraps to two lines at most, then an ellipsis: it never pushes the buttons off the line
    expect(actions().className).toMatch(/\bshrink-0\b/);
    expect(actions().className).toMatch(/\bflex-nowrap\b|\bflex\b/);
    expect(actions().className).not.toMatch(/flex-wrap/);
    // right-aligned: the actions come after the name block, and the name block takes the free width
    expect(nameBlock.className).toMatch(/\bflex-1\b/);
    expect(nameBlock.compareDocumentPosition(actions()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // ONE actions container (so a later chips merge has one place to land)
    expect(header().querySelectorAll('[data-testid="record-header-actions"]')).toHaveLength(1);
    // the buttons sit on the avatar line: the avatar/icon, the name block and the actions are all direct children of the header row
    expect(Array.from(header().children).filter((c) => c === nameBlock || c === actions()).length).toBe(2);
  });

  it("the buttons never shrink away: each stays at least 40 px tall and wide enough to touch, and do not wrap their own text", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const edit = within(header()).getByTestId("card-edit");
    const plus = within(header()).getByTestId("card-add-info");
    expect(edit.className).toMatch(/min-h-10/);
    expect(plus.className).toMatch(/min-h-10/);
    expect(plus.className).toMatch(/min-w-10/);
    expect(edit.className).toMatch(/whitespace-nowrap/);
  });

  it("the + in the header opens the same Add information chooser, on the document body (a fixed sheet the header cannot clip)", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await userEvent.click(within(header()).getByTestId("card-add-info"));
    const sheet = screen.getByTestId("add-information-sheet");
    expect(sheet.parentElement).toBe(document.body);
    expect(header().contains(sheet)).toBe(false);
    expect(sheet.className).toMatch(/\bfixed\b/);
    expect(sheet.className).toMatch(/\binset-0\b/);
    // choosing a kind from it still turns edit mode on, and the header then shows Done
    const items = within(sheet).getAllByRole("button");
    expect(items.map((b) => b.textContent)).toContain("Cancel");
    await userEvent.click(items.find((b) => b.textContent !== "Cancel")!);
    expect(modeOf()).toBe("edit");
    expect(within(header()).getByTestId("card-done")).toBeTruthy();
  });

  it("keeps their meaning: Edit turns edit on, Done turns it off, Escape leaves, all from the header", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(within(header()).getByTestId("card-edit"));
    expect(modeOf()).toBe("edit");
    await user.click(within(header()).getByTestId("card-done"));
    expect(modeOf()).toBe("presentation");
    await user.click(within(header()).getByTestId("card-edit"));
    expect(modeOf()).toBe("edit");
    // Done is in the card (the header is inside the mode's root): moving focus to it does not leave edit mode early
    within(header()).getByTestId("card-done").focus();
    expect(modeOf()).toBe("edit");
    await user.keyboard("{Escape}");
    expect(modeOf()).toBe("presentation");
  });

  it("Tab from a field in the body to Done in the header does not leave edit mode (the header belongs to the card)", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    await user.click(within(header()).getByTestId("card-edit"));
    const box = within(body()).getAllByRole("textbox")[0]!;
    box.focus();
    within(header()).getByTestId("card-done").focus();
    await new Promise((r) => setTimeout(r, 20));
    expect(modeOf()).toBe("edit");
  });

  it("a card that may not be written shows NO Edit and NO + in the header", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    // reopen the same record read-only
    cleanup();
    const sh = { ...shell(rec), writeGuard: { allowed: false, reason: "read only" } } as unknown as ShellContextValue;
    render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={sh}>
          <RecordDetail />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
    await ready();
    expect(within(header()).queryByTestId("card-edit")).toBeNull();
    expect(within(header()).queryByTestId("card-add-info")).toBeNull();
    expect(within(header()).queryByTestId("card-done")).toBeNull();
  });

  it("the header still carries the name (and the picture) in presentation and edit; the body keeps the one-line hint but no buttons", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    expect(within(header()).getByRole("heading", { level: 2 }).textContent).toBeTruthy();
    // C214-UI2 (changed on purpose, Kai on "Click a value to edit it.": "Just remove all this, less is more"): no hint while presented.
    expect(within(body()).queryByTestId("card-mode-hint")).toBeNull();
    await userEvent.click(within(header()).getByTestId("card-edit"));
    expect(within(body()).getByTestId("card-mode-hint").textContent).toMatch(/editing/i);
    expect(within(body()).queryAllByRole("button", { name: /^(Edit this card|Done editing this card|Add information)$/ })).toHaveLength(0);
  });

  it("the foot button '+ Add Information' stays at the foot of the body, as before", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    await userEvent.click(within(header()).getByTestId("card-edit"));
    expect(within(body()).getByTestId("card-add-info-button")).toBeTruthy();
  });
});
