// Ported from GilbApp src/components/records/RecordDetail.s10iter1focus.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 s10 iteration 1 FEEDBACK (Kai, 2026-10-16, verbatim): "After '+ Add information', then picking an information type, it should auto
// place the cursor in the right field so the user can just start typing." The whole person card: every kind its chooser offers puts the cursor in
// the new row's field (or, for a chip picker, on its first chip). Harness copied from RecordDetail.s8cardlook.test.tsx.
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

/** What the focus is, in words a failure shows. */

describe("s10 iter1 — the person card: after the pick the cursor is in the right field", () => {
  it("Member of: the record finder's box has the focus", async () => {
    const { rec, qc } = linkWorld();
    mount(qc, rec);
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Member of");
    const g = await screen.findByRole("region", { name: "Member of" });
    expect(document.activeElement).toBe(within(g).getByRole("textbox"));
  });

  it("Preferred Contact Channel: the first contact value to choose (a chip) has the focus, once the choices are read", async () => {
    const { rec, qc } = linkWorld({ email: "tom@example.test" });
    mount(qc, asRead(rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Preferred Contact Channel");
    const g = await screen.findByRole("region", { name: /Preferred contact channel/i });
    const chip = await within(g).findByRole("button", { name: "Email address" }, { timeout: 4000 });
    await waitFor(() => expect(document.activeElement).toBe(chip), { timeout: 4000 });
  });

  it("Record (web address): the field's box is open and has the focus", async () => {
    const { qc, rec } = personWorld();
    const bare = { ...rec, facts: { name: "Tom", givenName: "Tom", familyName: "Gilb" }, servedKeys: [] } as BaseRecord;
    putList(qc, P, [bare]);
    mount(qc, bare);
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    await addInformation("Record");
    const box = await screen.findByRole("textbox", { name: "Edit Web Address" });
    expect(document.activeElement).toBe(box);
  });

  it("a late choice list does not steal the focus from where the person went meanwhile", async () => {
    const { rec, qc } = linkWorld({ email: "tom@example.test" });
    mount(qc, asRead(rec));
    await ready();
    await userEvent.click(screen.getByTestId("card-edit"));
    const name = screen.getAllByRole("textbox")[0] as HTMLElement;
    await addInformation("Preferred Contact Channel");
    name.focus();
    const g = await screen.findByRole("region", { name: /Preferred contact channel/i });
    await within(g).findByRole("button", { name: "Email address" }, { timeout: 4000 });
    await new Promise((r) => setTimeout(r, 100));
    expect(document.activeElement).toBe(name);
  });
});
