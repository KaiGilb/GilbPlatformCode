// Ported from GilbApp src/components/records/RecordDetail.c214bnNick.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// C214-BN nickname sits in the Name group, directly under the family name (Kai 2026-10-23: "move the nickname up to the
// first and last name; right under last name"). Harness copied from RecordDetail.c214bn.test.tsx. Nickname is not a default
// row: it is drawn when the person already has a value, or after "+ Add information" → Record (the chooser adds a group).
// Birthday stays on that Record path.
//
// ⚠ The master here is the package's fixture master with `a:birthday` / `a:nickname` declared `a:fieldOf` Person.
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
/** Their online nickname, or null when their card has none. Existing cases keep "Kiki". */
let nickOnCard: string | null = "Kiki";
/** Fields dropped from their card for one case (their birthday would open the Record group, which is a different path). */
let dropTheirFields: ReadonlySet<string> = new Set();
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
    if (url.includes("/base/connect/public-card")) {
      const fields = (
        nickOnCard == null
          ? KARI_CARD.fields.filter((f) => f.field !== "a:nickname")
          : KARI_CARD.fields.map((f) => (f.field === "a:nickname" ? { ...f, value: nickOnCard } : f))
      ).filter((f) => !dropTheirFields.has(f.field));
      return new Response(JSON.stringify({ ...KARI_CARD, fields }), { status: 200, headers: { "content-type": "application/json" } });
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
  nickOnCard = "Kiki";
  dropTheirFields = new Set();
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
/** Direct rows of the Name group, in the order the card draws them. */
function nameRowIds(): string[] {
  const items = document.querySelector('[data-group="name"] [data-testid="card-group-items"]');
  if (!items) return [];
  return [...items.children]
    .filter((el) => el.getAttribute("data-testid") !== "one-card-both-kept")
    .map((row) => {
      const slug = row.getAttribute("data-field-slug") ?? row.querySelector("[data-field-slug]")?.getAttribute("data-field-slug");
      if (slug) return slug;
      const label = row.getAttribute("data-field-label") ?? row.querySelector("[data-field-label]")?.getAttribute("data-field-label");
      if (label) return label;
      const theirs = row.querySelector("[data-testid='one-card-row-label']")?.textContent?.trim();
      if (theirs) return theirs;
      return (row.querySelector("span")?.textContent ?? "").trim();
    });
}

/** Nickname is the row immediately after the family-name row. */
function nicknameFollowsFamily(ids: string[]) {
  const fam = ids.findIndex((id) => /family/i.test(id));
  expect(fam, ids.join(" | ")).toBeGreaterThan(-1);
  expect(ids[fam + 1], ids.join(" | ")).toMatch(/nick/i);
}

/**
 * Direct children of the Name group, in draw order. Their rows are `theirs:<label>:<value>` (placeOneCard orders those
 * rows by the group's field order, then CardGroup draws them before the own editors — the same theirs-then-yours order
 * the Email group uses). An own editor is `yours:<label>` plus `:Add nickname` when that is the empty invitation.
 */
function nameItemKeys(): string[] {
  const items = document.querySelector('[data-group="name"] [data-testid="card-group-items"]');
  if (!items) return [];
  return [...items.children].flatMap((row) => {
    if (row.getAttribute("data-testid") === "one-card-both-kept") return [];
    if (row.getAttribute("data-source") === "theirs") {
      const label = row.querySelector("[data-testid='one-card-row-label']")?.textContent?.trim() ?? "";
      const value = row.querySelector("[data-testid='one-card-row-value']")?.textContent?.trim() ?? "";
      return [`theirs:${label}:${value}`];
    }
    const labelled = row.querySelector("[data-field-label]");
    if (labelled) {
      const label = labelled.getAttribute("data-field-label") ?? "";
      const add = labelled.textContent?.match(/Add [a-z ]+/)?.[0] ?? "";
      return [`yours:${label}${add ? `:${add}` : ""}`];
    }
    const span = row.querySelector("span")?.textContent?.trim() ?? "";
    return span ? [`yours:${span}`] : [];
  });
}

describe("C214-BN: nickname sits under the family name", () => {
  it("a held nickname is in the Name group, immediately after the family name, in presentation and in edit", async () => {
    const { qc, rec } = bnWorld({ nickname: "Tommy" });
    mount(qc, rec);
    await ready();
    await screen.findByRole("button", { name: "Edit Nickname" });
    nicknameFollowsFamily(nameRowIds());
    const name = document.querySelector('[data-group="name"]') as HTMLElement;
    expect(within(name).getByRole("button", { name: "Edit Nickname" }).textContent).toBe("Tommy");
    expect(document.querySelector('[data-group="record"] [data-field-label="Nickname"]')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    nicknameFollowsFamily(nameRowIds());
    expect(within(document.querySelector('[data-group="name"]') as HTMLElement).getByRole("button", { name: "Edit Nickname" }).textContent).toBe("Tommy");
    expect(document.querySelector('[data-group="record"] [data-field-label="Nickname"]')).toBeNull();
  });

  it("with no nickname, presentation draws none; edit draws it in the Name group only after Record is added", async () => {
    const { qc, rec } = bnWorld();
    mount(qc, rec);
    await ready();
    expect(nameRowIds().some((id) => /nick/i.test(id))).toBe(false);
    expect(screen.queryByText("Nickname")).toBeNull();

    const user = userEvent.setup();
    await user.click(await screen.findByTestId("card-edit"));
    expect(nameRowIds().some((id) => /nick/i.test(id))).toBe(false);
    expect(screen.queryByRole("button", { name: "Edit Nickname" })).toBeNull();

    await user.click(screen.getByRole("button", { name: "Add information" }));
    await user.click(await screen.findByRole("button", { name: "Record" }));
    await waitFor(() => nicknameFollowsFamily(nameRowIds()));
    const name = document.querySelector('[data-group="name"]') as HTMLElement;
    expect(within(name).getByRole("button", { name: "Edit Nickname" })).toBeTruthy();
    expect(document.querySelector('[data-group="record"] [data-field-label="Nickname"]')).toBeNull();
  });

  it("a linked contact's nickname is in the Name group, immediately after their family name", async () => {
    const { qc, rec } = bnWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    await waitFor(() => {
      const name = document.querySelector('[data-group="name"]') as HTMLElement;
      const values = [...name.querySelectorAll("[data-testid='one-card-row-value']")].map((n) => n.textContent);
      const gi = values.indexOf("Gilb");
      expect(gi, values.join(" | ")).toBeGreaterThan(-1);
      expect(values[gi + 1]).toBe("Kiki");
    });
    const record = document.querySelector('[data-group="record"]');
    expect(record?.textContent ?? "").not.toContain("Kiki");
  });

  it("their nickname alone keeps the own empty Nickname input in the Name group, beside theirs, and only in edit", async () => {
    nickOnCard = "Jai";
    const { qc, rec } = bnWorld({ email: "tom@example.org" });
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const name = document.querySelector('[data-group="name"]') as HTMLElement;
    await waitFor(() => {
      const values = [...name.querySelectorAll("[data-testid='one-card-row-value']")].map((n) => n.textContent);
      const gi = values.indexOf("Gilb");
      expect(gi, values.join(" | ")).toBeGreaterThan(-1);
      expect(values[gi + 1]).toBe("Jai");
    });
    // Presentation draws no empty own row (FieldRow hides it; the Email group does the same for an empty own value).
    expect(name.textContent ?? "").not.toMatch(/Add nickname/);
    expect(within(name).queryByRole("button", { name: "Edit Nickname" })).toBeNull();
    expect(document.querySelector('[data-group="record"] [data-field-label="Nickname"]')).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    // Email: their row, then the own row, adjacent. Nickname follows that same theirs-then-yours order inside Name.
    const email = document.querySelector('[data-group="email"] [data-testid="card-group-items"]') as HTMLElement;
    const emailSources = [...email.children].map((el) => el.getAttribute("data-source") ?? el.getAttribute("data-testid"));
    const emailTheirs = emailSources.indexOf("theirs");
    expect(emailTheirs, emailSources.join(" | ")).toBeGreaterThan(-1);
    expect(emailSources[emailTheirs + 1]).toBe("yours");

    const keys = nameItemKeys();
    const fam = keys.findIndex((k) => k === "theirs:Family Name:Gilb");
    expect(fam, keys.join(" | ")).toBeGreaterThan(-1);
    expect(keys[fam + 1]).toBe("theirs:Nickname:Jai");
    const ownFam = keys.findIndex((k) => /^yours:Family Name/.test(k));
    expect(ownFam, keys.join(" | ")).toBeGreaterThan(-1);
    expect(keys[ownFam + 1]).toBe("yours:Nickname:Add nickname");
    const theirNick = keys.indexOf("theirs:Nickname:Jai");
    const ownNick = keys.indexOf("yours:Nickname:Add nickname");
    expect(ownNick).toBeGreaterThan(theirNick);
    expect(within(name).getByRole("button", { name: "Edit Nickname" }).textContent).toMatch(/Add nickname/);
    expect(document.querySelector('[data-group="record"] [data-field-label="Nickname"]')).toBeNull();
  });

  it("a linked person with no nickname on either card draws no nickname row", async () => {
    nickOnCard = null;
    // Their birthday lives in the Record group. That group being open is the "+ Add information" path, not this default.
    dropTheirFields = new Set(["a:birthday"]);
    const { qc, rec } = bnWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    expect(nameRowIds().some((id) => /nick/i.test(id))).toBe(false);
    expect(screen.queryByText("Nickname")).toBeNull();
    expect(screen.queryByText(/Add nickname/i)).toBeNull();

    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    expect(nameRowIds().some((id) => /nick/i.test(id))).toBe(false);
    expect(screen.queryByRole("button", { name: "Edit Nickname" })).toBeNull();
    expect(screen.queryByText(/Add nickname/i)).toBeNull();
  });
});
