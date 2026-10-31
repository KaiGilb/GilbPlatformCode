// Ported from GilbApp src/components/records/RecordDetail.c214bn.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// C214-BN on GilbApp's person card (Kai 2026-10-23, "Yes, build it"), on the real RecordDetail (harness copied from
// RecordDetail.s5dOneCard.test.tsx). A contact's card: the holder records Birthday and Nickname privately on his own record
// (inline `a:birthday` / `a:nickname`, Agent.Concept §3); the birthday is PICKED (day + month, year optional, no free text), an
// impossible day is never written, and it reads "14 March" / "14 March 1980". A linked contact's own shared values show on their
// side of the card with the chain link, worded the same way.
//
// ⚠ The master here is the package's fixture master with `a:birthday` / `a:nickname` declared `a:fieldOf` Person, the state Agent.Concept
// re-enables once this build is ready (C214-BirthdayNickname-AgentConcept-2026-10-23 §7). Today's live master has the offer
// retracted; that state is the s5d suite's (no Birthday row is offered).
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
    // C214-BN: her own shared birthday and nickname
    { principal: KARI, field: "a:birthday", value: "1980-03-14", sourceEntity: `${KARI}/e/bd`, claimVaultId: KARI, rung: "t:PersonalCloseCircleGrantee", kind: "birthday" },
    { principal: KARI, field: "a:nickname", value: "Kiki", sourceEntity: `${KARI}/e/nn`, claimVaultId: KARI, rung: "public", kind: "nickname" },
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


// The fixture master, with the two C214-BN terms declared as Agent.Concept will re-declare them (§7): a:fieldOf Person; Birthday's
// encoding `inline-literal:date-or-month-day`, Nickname's `inline-literal:text`; both single.
function bnWorld(extra: Record<string, unknown> = {}) {
  world();
  const node = (slug: string, label: string, encoding = "inline-literal:text") => ({
    "@id": `${ID}/base/a/${slug}`,
    "a:predicateAttribute": `a:${slug}`,
    "a:label": label,
    "a:encoding": encoding,
    "a:cardinality": "single",
    "a:fieldOf": [{ "@id": `${ID}/base/t/Person` }],
  });
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(page["@graph"]);
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  const terms: [string, string, string?][] = [
    ["givenName", "Given Name"],
    ["familyName", "Family Name"],
    ["birthday", "Birthday", "inline-literal:date-or-month-day"],
    ["nickname", "Nickname"],
  ];
  pages.push(terms.map(([s, l, e]) => node(s, l, e)));
  m.listing(pages as never);
  for (const [slug, label] of terms)
    m.put(`a/${slug}`, { "@context": {}, "@id": `${ID}/base/a/${slug}`, "a:predicateAttribute": `a:${slug}`, "a:label": label });
  const qc = newQc();
  const rec = personRecord("pn", "https://h.gilb.test/base/e/pn", { givenName: "Tom", familyName: "Gilb", ...extra });
  putList(qc, P, [rec]);
  return { qc, rec };
}

const linked = (rec: BaseRecord) => {
  rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
};
const sel = (id: string) => screen.getByTestId(id) as HTMLSelectElement;
const written = () => JSON.stringify(appWrites.map((w) => w.body));

describe("C214-BN: Birthday and Nickname on a contact's card in GilbApp", () => {
  it("a held birthday reads '4 July' (no year) and the held nickname as written", async () => {
    const { qc, rec } = bnWorld({ birthday: "--07-04", nickname: "Tommy" });
    mount(qc, rec);
    await ready();
    expect((await screen.findByRole("button", { name: "Edit Birthday" })).textContent).toBe("4 July");
    expect(screen.getByRole("button", { name: "Edit Nickname" }).textContent).toBe("Tommy");
  });

  it("the birthday is PICKED: tapping it opens day / month / year lists, ⛔ no text box; 14 / March saves '--03-14' on the holder's record", async () => {
    const { qc, rec } = bnWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    // An empty row is drawn in the card's Edit mode (s8 card look: presentation draws no empty row).
    await user.click(await screen.findByTestId("card-edit"));
    await user.click(screen.getByRole("button", { name: "Add information" }));
    // The plain fields of a person card are added from "+ Add information" → Record (s10).
    await user.click(await screen.findByRole("button", { name: "Record" }));
    // The pick presses the first empty row, Birthday: its picker opens with the day list focused.
    const picker = await screen.findByTestId("birthday-picker");
    expect(picker.querySelector("input")).toBeNull();
    await user.selectOptions(sel("birthday-day"), "14");
    await user.selectOptions(sel("birthday-month"), "3");
    await user.click(screen.getByTestId("birthday-save"));
    await waitFor(() => expect(written()).toContain('"--03-14"'));
    // On the holder's own record (the card's own save), under the master's spelling, ⛔ never a claim of the contact.
    const w = appWrites.find((x) => JSON.stringify(x.body).includes('"--03-14"'))!;
    expect(JSON.stringify(w.body)).toMatch(/"(a:)?birthday":"--03-14"/);
    expect(w.url).not.toContain("/base/connect/profile-field-claims");
    expect((await screen.findByRole("button", { name: "Edit Birthday" })).textContent).toBe("14 March");
  });

  it("with a year it saves '1980-03-14' and reads '14 March 1980'", async () => {
    const { qc, rec } = bnWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    // An empty row is drawn in the card's Edit mode (s8 card look: presentation draws no empty row).
    await user.click(await screen.findByTestId("card-edit"));
    await user.click(screen.getByRole("button", { name: "Add information" }));
    // The plain fields of a person card are added from "+ Add information" → Record (s10).
    await user.click(await screen.findByRole("button", { name: "Record" }));
    // The pick presses the first empty row, Birthday: its picker opens with the day list focused.
    await screen.findByTestId("birthday-picker");
    await user.selectOptions(sel("birthday-day"), "14");
    await user.selectOptions(sel("birthday-month"), "3");
    await user.selectOptions(sel("birthday-year"), "1980");
    await user.click(screen.getByTestId("birthday-save"));
    await waitFor(() => expect(written()).toContain('"1980-03-14"'));
    expect((await screen.findByRole("button", { name: "Edit Birthday" })).textContent).toBe("14 March 1980");
  });

  it("29 February 2023 is never written: Save stays off and the card says why", async () => {
    const { qc, rec } = bnWorld();
    mount(qc, rec);
    await ready();
    const user = userEvent.setup();
    // An empty row is drawn in the card's Edit mode (s8 card look: presentation draws no empty row).
    await user.click(await screen.findByTestId("card-edit"));
    await user.click(screen.getByRole("button", { name: "Add information" }));
    // The plain fields of a person card are added from "+ Add information" → Record (s10).
    await user.click(await screen.findByRole("button", { name: "Record" }));
    // The pick presses the first empty row, Birthday: its picker opens with the day list focused.
    await screen.findByTestId("birthday-picker");
    await user.selectOptions(sel("birthday-day"), "29");
    await user.selectOptions(sel("birthday-month"), "2");
    await user.selectOptions(sel("birthday-year"), "2023");
    expect((screen.getByTestId("birthday-save") as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("birthday-no-such-day").textContent).toBe("There is no 29 February 2023.");
    await user.click(screen.getByTestId("birthday-save"));
    expect(written()).not.toContain("2023-02-29");
  });

  it("an older or odd held value is shown as stored, never a guessed date", async () => {
    const { qc, rec } = bnWorld({ birthday: "March 14th" });
    mount(qc, rec);
    await ready();
    expect((await screen.findByRole("button", { name: "Edit Birthday" })).textContent).toBe("March 14th");
  });

  it("a linked contact's own shared birthday and nickname show on their side with the chain link, worded as a day", async () => {
    const { qc, rec } = bnWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    const theirs = await screen.findAllByTestId("one-card-row");
    const bday = theirs.find((r) => within(r).getByTestId("one-card-row-value").textContent === "14 March 1980");
    expect(bday, theirs.map((r) => r.textContent).join(" | ")).toBeTruthy();
    expect(within(bday!).getByTestId("one-card-mark").textContent).toBe("From their online card");
    expect(screen.queryByText("1980-03-14")).toBeNull();
    const nick = theirs.find((r) => within(r).getByTestId("one-card-row-value").textContent === "Kiki");
    expect(nick).toBeTruthy();
    expect(within(nick!).getByTestId("one-card-mark").textContent).toBe("From their online card");
  });
});
