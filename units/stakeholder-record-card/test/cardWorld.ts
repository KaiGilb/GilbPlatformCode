// A person card's world for the unit's own tests: the package's fixture master (with the terms a person's card is made of declared on Person), a fixture
// platform for the vaults, and a `fetch` that records every request the card makes of anything else (its saves go to a host the platform does not serve).
import { vi } from "vitest";
import { QueryClient } from "@tanstack/react-query";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { fixtureMaster, ID, RIG } from "./fixtureMaster";
import { withReferenceTerms } from "./fixtureReference";
import { fixturePlatform, type FixturePlatform } from "./fixturePlatform";
import { recordsKey, type ShellContextValue } from "./app";

export const P = "https://p.gilb.test/vault";
export const Q = "https://q.gilb.test/vault";
export const AGENT = "https://id.gilb.test/base/p/0b6c9a52-agent";
export const HOLD = "https://h.gilb.test/base/e";

export interface Sent {
  method: string;
  url: string;
  body: Record<string, unknown>;
  ifMatch: string | null;
}
export interface CardWorld {
  m: ReturnType<typeof fixtureMaster>;
  platform: FixturePlatform;
  /** Every request that was not to the master or the platform fixture, as "METHOD url". */
  other: string[];
  /** The bodies of the card's own writes, in order. */
  writes: Sent[];
  masterInits: (RequestInit | undefined)[];
  /** A test's own answer for a request to the host the card writes to; undefined: the default (200, an empty body). */
  respond?: (method: string, url: string, init?: RequestInit) => Response | Promise<Response | undefined> | undefined;
}

/** The terms a person's card is made of, each declared a field of Person: [slug, label, encoding]. */
export const PERSON_TERMS: [string, string, string?, string?][] = [
  ["givenName", "Given Name"],
  ["familyName", "Family Name"],
  ["nickname", "Nickname"],
  ["postalAddress", "Postal Address"],
  ["employment", "Employment"],
  ["skill", "Skill"],
  ["contactLanguage", "Contact Language"],
  ["webAddress", "Web Address"],
];

export function cardWorld(opts: { master?: "up" | "hang" | "503"; terms?: [string, string, string?, string?][]; selector?: boolean; /** attributes taken off Person's field set */ notOfPerson?: string[] } = {}): CardWorld {
  const m = withReferenceTerms(fixtureMaster());
  m.selector = opts.selector ?? true;
  const pages: Record<string, unknown>[][] = [];
  for (let url: string | null = `${RIG}/base/vocab?status=all&limit=2000`, i = 0; url && i < 50; i++) {
    const page = m.docs.get(url) as { "@graph": Record<string, unknown>[]; next: string | null } | undefined;
    if (!page) break;
    pages.push(
      page["@graph"]
        .filter((n) => n["@id"] !== `${ID}/base/t/Unrelated`)
        .map((n) => {
          const slug = String(n["a:predicateAttribute"] ?? "").replace(/^a:/, "");
          if (!opts.notOfPerson?.includes(slug)) return n;
          const refs = (Array.isArray(n["a:fieldOf"]) ? n["a:fieldOf"] : n["a:fieldOf"] ? [n["a:fieldOf"]] : []) as { "@id": string }[];
          return { ...n, "a:fieldOf": refs.filter((r) => r["@id"] !== `${ID}/base/t/Person`) };
        }),
    );
    url = page.next ? `${RIG}${new URL(page.next).pathname}${new URL(page.next).search}` : null;
  }
  const terms = opts.terms ?? PERSON_TERMS;
  pages.push(
    terms.map(([slug, label, encoding, fieldOf]) => ({
      "@id": `${ID}/base/a/${slug}`,
      "a:predicateAttribute": `a:${slug}`,
      "a:label": label,
      "a:encoding": encoding ?? "inline-literal:text",
      "a:cardinality": "single",
      "a:fieldOf": [{ "@id": `${ID}/base/t/${fieldOf ?? "Person"}` }],
    })),
  );
  m.listing(pages as never);
  for (const [slug, label] of terms) m.put(`a/${slug}`, { "@context": {}, "@id": `${ID}/base/a/${slug}`, "a:predicateAttribute": `a:${slug}`, "a:label": label });
  const platform = fixturePlatform({ origin: new URL(Q).origin });
  platform.reach.add(P).add(Q);
  platform.nest(P, Q);
  const w: CardWorld = { m, platform, other: [], writes: [], masterInits: [] };
  const master = opts.master ?? "up";
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(ID) && master === "hang") return new Promise<Response>(() => {});
    if (url.startsWith(ID) && master === "503") return new Response("{}", { status: 503 });
    if (url.startsWith(ID)) {
      w.masterInits.push(init);
      return m.fetch(url.replace(ID, RIG), init);
    }
    if (url.startsWith(new URL(Q).origin)) return platform.fetch(url, init);
    w.other.push(`${init?.method ?? "GET"} ${url}`);
    const method = String(init?.method ?? "GET").toUpperCase();
    if (method !== "GET" && typeof init?.body === "string")
      w.writes.push({ method, url, body: JSON.parse(init.body), ifMatch: new Headers(init?.headers).get("if-match") });
    const own = await w.respond?.(method, url, init);
    if (own) return own;
    return new Response("{}", { status: 200, headers: { "content-type": "application/json", etag: '"sha256:x"' } });
  });
  return w;
}

export function personRecord(id: string, facts: Record<string, unknown> = {}, over: Partial<BaseRecord> = {}): BaseRecord {
  const rec = {
    id,
    entityUri: `${HOLD}/${id}`,
    typeUri: "t:Person",
    facts: { name: "Tom Gilb", ...facts },
    etag: '"sha256:0"',
    updatedAt: Date.now(),
    servedKeys: Object.keys(facts),
    ...over,
  } as unknown as BaseRecord;
  // The record as the card read it: the document served at its ETag.
  (rec as { served?: unknown }).served = { facts: { ...rec.facts }, context: undefined, etag: rec.etag };
  return rec;
}

export function shellOf(record: { id: string } | null, over: Partial<ShellContextValue> & { readVaultId?: string } = {}): ShellContextValue {
  const { readVaultId = P, ...rest } = over;
  return {
    contentScope: { readVaultId, readVault: null, vault: null, reach: null, vaultTargeted: true },
    writeGuard: { allowed: true, reason: null },
    selectedRecordId: record?.id ?? null,
    selectRecord: () => {},
    openRecordFromList: () => {},
    session: { principal: AGENT },
    vaults: [],
    ...rest,
  } as unknown as ShellContextValue;
}

export function putList(qc: QueryClient, vault: string, records: BaseRecord[]) {
  qc.setQueryData(recordsKey(vault), { pages: [{ records, total: records.length, complete: true, pageSize: 50, offset: 0 }], pageParams: [0] });
}

export const newQc = () => new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });

/** The vault row the shell lists for the vault that holds the record (the wide header and the picture are drawn only when the holder's vault is in the list). */
export const HELD_VAULT = { vaultId: P, entity: null, name: "Held", parent: null, parentAmbiguous: false, modes: ["read", "write"], represents: null, isLandingVault: false };
