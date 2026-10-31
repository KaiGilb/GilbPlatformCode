// Ported from GilbApp src/components/records/RecordDetail.s5dOneCard.test.tsx (release a703b3ed), onto the unit's host: see test/app.tsx.
// Cycle214 S5d: the ONE card body of a person linked to an online card, on the real RecordDetail (harness copied from
// RecordDetail.s13online.test.tsx). Spec: 3P.F.Stakeholders.OnlineAndLocalCards.GilbApp Status 18f (Kai: "it should become one card,
// not two. If there is an online card, that becomes the master, and then the user can add their own fields to it"), 18i (design
// approved); design note C214-OneCard-Design-Architect-2026-10-18 §4 (merge rules, marks, the online shade); mockup v6 tabs A and B.
// Cycle214 GAPP214.30 — THE CARD: a stakeholder kind's fields come from the package's field-set
// read, held for the session; "not known yet" offers no edit; a reference is written only through
// the package's checked write, naming the vault the merged list attributes the record to (R52).
//
// The real `RecordDetail` renders against the package's OWN fixture master and fixture platform at
// the pinned SHA, imported, ⛔ not mirrored (RuleBasetestImportNotMirror). Expected values are read
// from the package on the same master in the same test, never from a list written here.
import { RecordDetail, ShellContext, recordsKey, type ShellContextValue } from "../test/app";
import { rungChipWords } from "@kaigilb/gilbplatformcode-online-card";
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


const linked = (rec: BaseRecord) => {
  rec.served = { facts: { ...rec.facts, sameAs: { "@id": KARI } }, context: undefined, etag: rec.etag };
};
const nameGroup = () => screen.getAllByTestId("card-group").find((g) => g.getAttribute("data-group") === "name")!;
const groupOf = (kind: string) => document.querySelector<HTMLElement>(`section[data-group="${kind}"]`);

describe("S5d one card on the real RecordDetail", () => {
  // Spec 18f + design §4 marks and shade: Theirs rows shaded, read-only, marked; Yours rows plain, marked "Yours · private".
  it("draws ONE card: their rows shaded and marked Theirs, the holder's own rows plain and marked Yours · private, a legend once", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    const theirs = await screen.findAllByTestId("one-card-row");
    expect(screen.queryByTestId("online-and-local")).toBeNull();
    expect(screen.queryByTestId("local-card-side")).toBeNull();
    for (const row of theirs) {
      expect(row.getAttribute("data-source")).toBe("theirs");
      expect(row.style.background).toContain("--online-shade");
      // C214-UI2 (changed on purpose): the mark of a row of theirs is the chain link, its words "From their online card" (was "Theirs").
      expect(within(row).getByTestId("one-card-mark").textContent).toBe("From their online card");
      expect(row.querySelector("input, textarea, select")).toBeNull();
    }
    expect(theirs.map((r) => within(r).getByTestId("one-card-row-value").textContent)).toEqual(["Kari", "Gilb", "kari@example.org", "Architect"]);
    expect(within(theirs[0]!).getByTestId("one-card-row-why").textContent).toBe(`Shown to you as: ${rungChipWords("public")}`);
    expect(within(theirs[1]!).getByTestId("one-card-row-why").textContent).toBe(`Shown to you as: ${rungChipWords("t:EitherContextCloseCircleGrantee")}`);
    const own = screen.getAllByTestId("one-card-own-row");
    expect(own.length).toBeGreaterThan(0);
    for (const row of own) {
      expect(row.getAttribute("data-source")).toBe("yours");
      expect(row.style.background).toBe("");
      // C214-UI2 (changed on purpose): a row of yours carries no mark (was "Yours · private").
      expect(within(row).queryByTestId("one-card-mark")).toBeNull();
    }
    // the holder's own Web Address is a row of his, marked
    expect(own.some((r) => r.textContent?.includes("gilb.com"))).toBe(true);
    // C214-UI2 (changed on purpose, Kai "Just remove all this, less is more"): no legend, no "their online card is the master".
    expect(screen.queryByTestId("one-card-legend")).toBeNull();
    expect(screen.queryByText(/their online card is the master/)).toBeNull();
  });

  it("both differ (a one-value field): both rows in the same group, theirs first, and both are kept", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const name = nameGroup();
    const text = name.textContent ?? "";
    expect(text.indexOf("Kari")).toBeGreaterThan(-1);
    expect(text.indexOf("Tom")).toBeGreaterThan(text.indexOf("Kari"));
    expect(within(name).getByTestId("one-card-both-kept").textContent).toBe("Theirs and yours differ. Both are kept; nothing is overwritten.");
    // C214-UI2 (changed on purpose): the row of yours is drawn, with no mark.
    expect(within(within(name).getAllByTestId("one-card-own-row").find((r) => r.textContent?.includes("Tom"))!).queryByTestId("one-card-mark")).toBeNull();
  });

  it("equal values: ONE row of theirs that says you have the same; your equal value is not drawn twice, and is there to change in Edit", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const name = nameGroup();
    expect((name.textContent ?? "").split("Gilb").length - 1).toBe(1);
    const fam = within(name).getAllByTestId("one-card-row").find((r) => r.textContent?.includes("Gilb"))!;
    expect(within(fam).getByTestId("one-card-row-same").textContent).toBe("You have the same on your card.");
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    const family = within(nameGroup()).getByRole("textbox", { name: /Family Name/i }) as HTMLInputElement;
    expect(family.value).toBe("Gilb");
    // in Edit their row says only they can change it
    expect(within(within(nameGroup()).getAllByTestId("one-card-row")[0]!).getByTestId("one-card-row-why").textContent).toContain("only they can change this");
  });

  it("hidden or absent values draw nothing: another principal's value and a blank value are no row, and no field is hinted", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    expect(screen.queryByText("other.example")).toBeNull();
    for (const row of screen.getAllByTestId("one-card-row")) expect(row.textContent).not.toContain("Web Address");
    expect(screen.getAllByTestId("one-card-row")).toHaveLength(4);
  });

  it("opening the card writes nothing", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    await new Promise((r) => setTimeout(r, 300));
    expect(appWrites).toEqual([]);
    expect(idReqs(/online-card-anchor/).length).toBe(1);
    expect(idReqs(/public-card/).length).toBe(1);
  });

  it("Unlink is a quiet link in the card's foot: it asks, then removes the link only (the existing unlink), and the card is yours only", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const user = userEvent.setup();
    expect(screen.getByTestId("one-card-foot").textContent).toContain("Connected to their online card.");
    await user.click(screen.getByTestId("one-card-unlink"));
    expect(appWrites).toEqual([]);
    await user.click(screen.getByTestId("one-card-unlink-confirm"));
    await waitFor(() => expect(appWrites.length).toBe(1), { timeout: 4000 });
    expect(JSON.stringify(appWrites[0]!.body)).toContain("sameAs");
    // the card is the holder's own now: no row of theirs, no marks (S5f: its foot offers Find again, RecordDetail.s5fNoOnlineCard)
    expect(appWrites[0]!.method).toBe("PATCH");
    expect(appWrites[0]!.url).toBe("https://h.gilb.test/lws/r/pn");
    // the card is the holder's own now: no row of theirs, no marks, no foot
    await waitFor(() => expect(screen.queryAllByTestId("one-card-row")).toHaveLength(0));
    expect(screen.queryAllByTestId("one-card-mark")).toHaveLength(0);
    expect(screen.queryByTestId("one-card-foot")).toBeNull();
  });

  it("an unlinked person card is the same one card with one source (S5f, state D): no frame, no marks, Find in the foot", async () => {
    const { qc, rec } = personWorld();
    mount(qc, rec);
    await ready();
    expect(within(await screen.findByTestId("one-card-find-foot")).getByTestId("online-card-find-open")).toBeTruthy();
    expect(screen.queryByTestId("local-card-title")).toBeNull();
    expect(screen.getByTestId("one-card").getAttribute("data-online-status")).toBe("none");
    expect(screen.queryAllByTestId("one-card-mark")).toHaveLength(0);
  });

  it("their email is in the card's own Email group; a field the card has no group for is a group of its own, theirs only", async () => {
    const { qc, rec } = personWorld();
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const email = groupOf("email")!;
    expect(within(email).getAllByTestId("one-card-row").map((r) => within(r).getByTestId("one-card-row-value").textContent)).toEqual(["kari@example.org"]);
    expect(within(email).queryAllByTestId("one-card-own-row")).toHaveLength(0);
    const own = groupOf("theirs:a:jobTitle")!;
    expect(own).not.toBeNull();
    expect(within(own).getAllByTestId("one-card-row").map((r) => within(r).getByTestId("one-card-row-value").textContent)).toEqual(["Architect"]);
    expect(within(own).queryAllByTestId("one-card-own-row")).toHaveLength(0);
  });
});

// Adopted from Agent.Tester s48 (Kai-Zen ruling): T1 closes mutation M6 (own rows must carry the Yours mark), T3 is defect D1.
describe("Tester s48 gaps: the one card", () => {

  // Gap (mutation M6 survived): an own email that differs from theirs is a row of yours, marked Yours · private.
  it("T1 an own email different from theirs is drawn as a row of yours (C214-UI2: with no mark)", async () => {
    const { qc, rec } = personWorld({ email: "tom@other.org" });
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const email = groupOf("email")!;
    const own = within(email).getAllByTestId("one-card-own-row");
    const mine = own.find((r) => r.textContent?.includes("tom@other.org"));
    expect(mine).toBeTruthy();
    // C214-UI2 (changed on purpose): a row of yours, with no mark (was "Yours · private").
    expect(mine!.getAttribute("data-source")).toBe("yours");
    expect(within(mine!).queryByTestId("one-card-mark")).toBeNull();
    expect(within(email).getAllByTestId("one-card-row").map((r) => within(r).getByTestId("one-card-row-value").textContent)).toEqual(["kari@example.org"]);
  });

  // Equal after normalising (email: case): ONE row of theirs that says so, the own value not drawn twice while presented.
  it("T2 an own email equal to theirs but in another case is folded into their row", async () => {
    const { qc, rec } = personWorld({ email: "KARI@Example.org" });
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const email = groupOf("email")!;
    expect(within(email).queryAllByTestId("one-card-own-row")).toHaveLength(0);
    expect(within(email).getByTestId("one-card-row-same")).toBeTruthy();
    expect((email.textContent ?? "").toLowerCase().split("kari@example.org").length - 1).toBe(1);
  });

  // Defect D1 (mockup A/B): the server serves the slot (email-work); the theirs row shows its sub-label "Work".
  it("T3 a theirs email served with slot email-work shows the sub-label Work (mockup A/B)", async () => {
    const card = KARI_CARD.fields[2] as Record<string, unknown>;
    card.slot = "email-work";
    try {
      const { qc, rec } = personWorld();
      linked(rec);
      mount(qc, rec);
      await ready();
      await screen.findAllByTestId("one-card-row");
      const row = within(groupOf("email")!).getAllByTestId("one-card-row")[0]!;
      expect(row.textContent).toMatch(/Work/);
    } finally {
      delete card.slot;
    }
  });

  it("Merge labels (gs 867cbd28): the same email published as Work and as Private is ONE row of theirs labelled 'Work · Private'", async () => {
    const card = KARI_CARD.fields[2] as Record<string, unknown>;
    card.slot = "email-work";
    // the same address in another case, at the same rung, stated as Private (the card read drops an exact repeat; the merge folds case twins)
    const twin = { ...card, value: "KARI@example.org", slot: "emailPrivate", sourceEntity: `${KARI}/e/em2` };
    KARI_CARD.fields.splice(3, 0, twin as unknown as (typeof KARI_CARD.fields)[number]);
    try {
      const { qc, rec } = personWorld();
      linked(rec);
      mount(qc, rec);
      await ready();
      await screen.findAllByTestId("one-card-row");
      const rows = within(groupOf("email")!).getAllByTestId("one-card-row");
      expect(rows).toHaveLength(1);
      expect(within(rows[0]!).getByTestId("one-card-row-label").textContent).toBe("Work · Private");
    } finally {
      KARI_CARD.fields.splice(3, 1);
      delete card.slot;
    }
  });

  // T4 (empty strip under Postal Address) dropped: the package fixture master has no address group, so it cannot reproduce; measured on the rig instead.
});

// Cycle214 S5e (mockup v6 tab C): "+ Add your own" in place, on the real RecordDetail. Spec 18f, Kai verbatim: "If there is an online
// card, that becomes the master, and then the user can add their own fields to it."
describe("S5e + Add your own on the real RecordDetail", () => {
  /** The master names MyNet's sidecar term (the rows' labels): without it the card's Email rows are read-only (no guessed key). */
  const withSidecar = <T,>(w: T): T => {
    m.put("a/fieldMeta", { "@context": {}, "@id": `${ID}/base/a/fieldMeta`, "a:predicateAttribute": "a:fieldMeta", "a:label": "Field meta" });
    return w;
  };
  it("their email group offers '+ Add your own' while the card is presented; the Name group does not (mockup tab C)", async () => {
    const { qc, rec } = withSidecar(personWorld());
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    await waitFor(() => expect(within(groupOf("email")!).getByTestId("add-own")).toBeTruthy(), { timeout: 4000 });
    expect(within(nameGroup()).queryByTestId("add-own")).toBeNull();
    // in Edit the editor's own add is there instead
    const user = userEvent.setup();
    await user.click(screen.getByTestId("card-edit"));
    expect(within(groupOf("email")!).queryByTestId("add-own")).toBeNull();
  });

  it("a read-only holder sees no '+ Add your own' anywhere on the card", async () => {
    const { qc, rec } = withSidecar(personWorld());
    linked(rec);
    mount(qc, rec, false);
    await ready();
    await screen.findAllByTestId("one-card-row");
    await new Promise((r) => setTimeout(r, 300));
    expect(screen.queryAllByTestId("add-own")).toHaveLength(0);
  });

  it("an unlinked person card has no '+ Add your own' (one source: nothing of theirs to add beside)", async () => {
    const { qc, rec } = withSidecar(personWorld({ email: "tom@other.org" }));
    mount(qc, rec);
    await ready();
    expect(await screen.findByTestId("online-card-find-open")).toBeTruthy();
    expect(screen.queryAllByTestId("add-own")).toHaveLength(0);
  });

  it("adding an email from the card: one write, to the holder's own record, of the email and its sidecar", async () => {
    const { qc, rec } = withSidecar(personWorld());
    linked(rec);
    mount(qc, rec);
    await ready();
    await screen.findAllByTestId("one-card-row");
    const user = userEvent.setup();
    await waitFor(() => expect(within(groupOf("email")!).getByTestId("add-own")).toBeTruthy(), { timeout: 4000 });
    await user.click(within(groupOf("email")!).getByTestId("add-own"));
    await user.type(within(groupOf("email")!).getByRole("textbox", { name: /Your own/ }), "tom@home.org{Enter}");
    await waitFor(() => expect(appWrites.length).toBe(1), { timeout: 4000 });
    expect(appWrites[0]!.method).toBe("PATCH");
    expect(appWrites[0]!.url).toBe("https://h.gilb.test/lws/r/pn");
    expect(JSON.stringify(appWrites[0]!.body)).toContain("tom@home.org");
    expect(JSON.stringify(appWrites[0]!.body)).not.toContain("kari@example.org");
  });
});
