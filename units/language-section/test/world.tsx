// Test-only. The world the new section tests run in: the fake platform (fakePlaceStore) for the record doors, a language catalogue and a geo catalogue as served fixtures,
// a recorder of every request with its method and body, and a harness that mounts the section the way a record card does (the record's own contact tag kept in a variable).
import { vi } from "vitest";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { AddedByHostContext } from "@kaigilb/gilbplatformcode-added-by";
import { geoFlagSource, setFlagSource } from "@kaigilb/gilbplatformcode-flag-source";
import * as fake from "./fakePlaceStore";
import { LanguageSection } from "../src/index";

export const { VAULT, store } = fake;
export const AGENT = "https://id.platform.example.test/base/p/kai";
export const NOR = "https://veda.platform.example.test/base/e/xja6zz79cmva";
export const ENG = "https://veda.platform.example.test/base/e/eng000000001";
export const POR = "https://veda.platform.example.test/base/e/por000000001";
export const NORWAY = "https://geo.platform.example.test/base/e/osm-r-2978650";
export const UK = "https://geo.platform.example.test/base/e/osm-r-62149";
export const USA = "https://geo.platform.example.test/base/e/osm-r-148838";
export const AUS = "https://geo.platform.example.test/base/e/osm-r-80500";
export const SVG = (c: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="${c}" d="M0 0h640v480H0z"/></svg>`;
export const uriOf = (id: string) => `${VAULT}/e/${id}`;
export const ID_TAIL = /xja6zz79cmva|eng000000001|por000000001/;

export interface Wire {
  method: string;
  url: string;
  body: unknown;
}
export const world = {
  catalogue: {} as Record<string, { label?: string; iso6393Code: string; languageCountry?: string[] }>,
  geoFlags: {} as Record<string, { code: string; svg: string }>,
  failing: new Set<string>(),
  /** Entries whose read is held until `release(entry)` is called. */
  held: new Map<string, Promise<void>>(),
  wire: [] as Wire[],
  contact: { tag: "" },
  contactWrites: [] as string[],
};

export function resetWorld(): void {
  world.catalogue = {
    [NOR]: { label: "Norwegian", iso6393Code: "nor", languageCountry: [NORWAY] },
    [ENG]: { label: "English", iso6393Code: "eng", languageCountry: [UK, USA, AUS] },
    [POR]: { label: "Portuguese", iso6393Code: "por" },
  };
  world.geoFlags = {};
  world.failing = new Set();
  world.held = new Map();
  world.wire = [];
  world.contact = { tag: "" };
  world.contactWrites = [];
}

export function installWorld(): void {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const json = (p: unknown, status = 200) => new Response(JSON.stringify(p), { status, headers: { "Content-Type": "application/json" } });
    world.wire.push({ method: (init?.method ?? "GET").toUpperCase(), url, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
    if (url.startsWith("https://geo.platform.example.test/")) {
      const m = /^https:\/\/geo\.platform\.example\.test\/(base\/e|files)\/(flag-[a-z0-9-]+)$/.exec(url);
      if (m) {
        const hit = world.geoFlags[m[2]!];
        if (!hit) return new Response("no", { status: 404 });
        return m[1] === "files" ? new Response(hit.svg, { status: 200, headers: { "Content-Type": "image/svg+xml" } }) : json({ fileTag: ["flag", hit.code] });
      }
      return new Response("no", { status: 404 });
    }
    if (url.includes("/base/search") && url.includes("type=HumanLanguage")) {
      const q = (new URL(url).searchParams.get("q") ?? "").toLowerCase();
      return json({ hits: Object.entries(world.catalogue).filter(([, d]) => (d.label ?? "").toLowerCase().startsWith(q)).map(([entity, d]) => ({ entity, label: d.label ?? "", typeUri: null, does: null })), next: null });
    }
    const entry = Object.keys(world.catalogue).find((k) => url === k);
    if (entry) {
      await world.held.get(entry);
      if (world.failing.has(entry)) return json({}, 503);
      const d = world.catalogue[entry]!;
      return json({ "@id": entry, ...(d.label !== undefined ? { label: d.label } : {}), iso6393Code: d.iso6393Code, ...(d.languageCountry ? { languageCountry: d.languageCountry.map((c) => ({ "@id": c })) } : {}) });
    }
    return fake.fakeFetch(input, init);
  });
  vi.stubGlobal("fetch", f);
  setFlagSource(geoFlagSource({ fetchFn: f as unknown as typeof fetch }));
}

export const writesOf = () => world.wire.filter((w) => w.method !== "GET");

export function Harness({ canEdit = true, tom, renderCountrySearch }: { canEdit?: boolean; tom: string; renderCountrySearch?: (p: { onPick(country: string): void }) => ReactNode }) {
  const [tag, setTag] = useState(world.contact.tag);
  return (
    <LanguageSection
      vaultId={VAULT}
      principal={AGENT}
      recordEntityUri={uriOf(tom)}
      canEdit={canEdit}
      contactTag={tag}
      renderCountrySearch={renderCountrySearch}
      writeContact={(t) => {
        world.contactWrites.push(t);
        world.contact.tag = t;
        setTag(t);
      }}
    />
  );
}

export function show(tom: string, props: { canEdit?: boolean; renderCountrySearch?: (p: { onPick(country: string): void }) => ReactNode } = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (p: typeof props) => (
    <AddedByHostContext.Provider value={{ useShell: () => null }}>
      <QueryClientProvider client={qc}>
        <Harness tom={tom} {...p} />
      </QueryClientProvider>
    </AddedByHostContext.Provider>
  );
  const view = render(tree(props));
  return { ...view, again: (p: typeof props) => view.rerender(tree(p)) };
}
