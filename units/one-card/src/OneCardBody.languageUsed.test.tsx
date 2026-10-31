// New (0.2.0). A language of theirs is drawn by its name and flag, linked and unlinked; a birthday and a skill are drawn as before.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OneCardField } from "@kaigilb/gilbplatformcode-one-card-merge";
import { useOneCard } from "@kaigilb/gilbplatformcode-one-card-context";
import { __resetLanguageEntries } from "@kaigilb/gilbplatformcode-language-entry";
import { __resetFetchPool } from "@kaigilb/gilbplatformcode-language-fetch-pool";
import { __resetFlags, geoFlagSource, setFlagSource, setFlagStore } from "@kaigilb/gilbplatformcode-flag-source";
import { OneCardBody, OneCardOwnGroups, type OneCardBodyProps } from "./OneCardBody";
import { __resetTheirPlaces } from "./theirPlaces";
import { HostProvider, fakeHost } from "../test/fakeHost";
import { controllerOf, field, rig } from "../test/rig";
import { ANN } from "../test/rig";

const NOR = "https://veda.example.test/base/e/xja6zz79cmva";
const NORWAY = "https://geo.example.test/base/e/osm-r-2978650";
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 480"><path fill="#ed2939" d="M0 0h640v480H0z"/></svg>';

const FIELDS: OneCardField[] = [
  { term: "a:givenName", label: "Given name", readKeys: ["givenName"], writeKey: "a:givenName", many: false },
  { term: "a:birthday", label: "Birthday", readKeys: ["birthday"], writeKey: "a:birthday", many: false },
];

let asked: { url: string; method: string }[] = [];
function installFetch() {
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    asked.push({ url, method: init?.method ?? "GET" });
    const json = (p: unknown) => new Response(JSON.stringify(p), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === NOR) return json({ "@id": NOR, label: "Norwegian", iso6393Code: "nor", languageCountry: [{ "@id": NORWAY }] });
    const m = /^https:\/\/geo\.example\.test\/(files|base\/e)\/flag-osm-r-2978650$/.exec(url);
    if (m) return m[1] === "files" ? new Response(SVG, { status: 200, headers: { "content-type": "image/svg+xml" } }) : json({ fileTag: ["flag", "no"] });
    return new Response("no", { status: 404 });
  });
  vi.stubGlobal("fetch", f);
  setFlagSource(geoFlagSource({ fetchFn: f as unknown as typeof fetch }));
}

const props = (over: Partial<OneCardBodyProps> = {}): OneCardBodyProps => ({
  controller: null,
  labelFor: (p) => (p === "a:languageUsed" ? "Language Used" : ""),
  searchName: "Ann Nordmann",
  canWrite: true,
  fieldOrder: FIELDS,
  servedFacts: {},
  skillPredicate: null,
  groupOf: (g) => (g.field === "a:givenName" ? "name" : null),
  skip: () => false,
  order: () => 0,
  personCard: null,
  recordUri: "https://holder.example.test/vault/e/rec1",
  children: <OneCardOwnGroups labelFor={(p) => (p === "a:languageUsed" ? "Language Used" : "")} />,
  ...over,
});

function draw(p: OneCardBodyProps) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <HostProvider host={fakeHost()}>{children}</HostProvider>
    </QueryClientProvider>
  );
  return render(<OneCardBody {...p} />, { wrapper: wrap });
}

function Values({ rows }: { rows: { field: string; value: string }[] }) {
  const view = useOneCard();
  return (
    <div data-testid="values">
      {rows.map((r) => (
        <span key={r.field + r.value} data-testid={`v-${r.field}`}>
          {view ? view.valueText({ ...r, source: "theirs", editable: false }) : "no view"}
        </span>
      ))}
    </div>
  );
}

beforeEach(() => {
  asked = [];
  __resetTheirPlaces();
  __resetLanguageEntries();
  __resetFetchPool();
  __resetFlags();
  setFlagStore(null);
  installFetch();
});
afterEach(() => {
  cleanup();
  setFlagSource(null);
  setFlagStore(null);
  vi.unstubAllGlobals();
});

describe("a language of theirs on the one card (N-f)", () => {
  it("linked: the Language Used group draws the language's name and flag, not its address", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:languageUsed", NOR)] });
    draw(props({ controller: controllerOf(r) }));
    const group = await screen.findByTestId("card-group");
    expect(group).toHaveTextContent("Language Used");
    await waitFor(() => expect(screen.getByTestId("language-row-name").textContent).toBe("Norwegian"));
    await waitFor(() => expect(screen.getByRole("img", { name: "Flag of Norway" })).toBeInTheDocument());
    expect(screen.getByTestId("one-card-row-value").textContent ?? "").not.toContain("://");
    expect(document.body.textContent ?? "").not.toContain(NOR);
    expect(r.nonGet).toEqual([]);
  });
  it("linked: the value of the row is the language row, whatever the state it is in (never the address)", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:languageUsed", NOR)] });
    draw(props({ controller: controllerOf(r) }));
    const row = await screen.findByTestId("one-card-row-value");
    expect(row.textContent ?? "").not.toContain("xja6zz79cmva");
    expect(row.querySelector('[data-testid="language-row"]')).not.toBeNull();
  });
  it("unlinked: a row on the language term draws the language row", async () => {
    const r = rig();
    draw(props({ controller: controllerOf(r), children: <Values rows={[{ field: "a:languageUsed", value: NOR }]} /> }));
    await waitFor(() => expect(screen.getByTestId("v-a:languageUsed").querySelector('[data-testid="language-row"]')).not.toBeNull());
    await waitFor(() => expect(screen.getByTestId("language-row-name").textContent).toBe("Norwegian"));
  });
  it("the term is found with or without its prefix", async () => {
    draw(props({ controller: controllerOf(rig()), children: <Values rows={[{ field: "languageUsed", value: NOR }]} /> }));
    await waitFor(() => expect(screen.getByTestId("v-languageUsed").querySelector('[data-testid="language-row"]')).not.toBeNull());
  });
  it("a value that is not on the language term is drawn as before, linked and unlinked (the text of a plain row and of a birthday)", async () => {
    const rows = [
      { field: "a:nickname", value: NOR },
      { field: "a:givenName", value: "Ann" },
      { field: "a:birthday", value: "--03-14" },
    ];
    draw(props({ controller: controllerOf(rig({ link: { state: "linked", target: ANN } })), children: <Values rows={rows} /> }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByTestId("v-a:nickname").textContent).toBe(NOR);
    expect(screen.getByTestId("v-a:givenName").textContent).toBe("Ann");
    expect(screen.getByTestId("v-a:birthday").textContent).toMatch(/14 March|March 14/);
    expect(screen.queryByTestId("language-row")).toBeNull();
    cleanup();
    draw(props({ controller: controllerOf(rig()), children: <Values rows={rows} /> }));
    await screen.findByTestId("one-card");
    expect(screen.getByTestId("v-a:nickname").textContent).toBe(NOR);
    expect(screen.getByTestId("v-a:birthday").textContent).toBe("--03-14");
    expect(screen.queryByTestId("language-row")).toBeNull();
  });
  it("a skill of theirs is still drawn by its label, and a language whose address looks like a skill's is not one", async () => {
    const SKILL = "https://veda.example.test/base/t/Welding";
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:skill", SKILL)] });
    draw(props({ controller: controllerOf(r), skillPredicate: "a:skill", labelFor: (p) => (p === SKILL ? "Welding" : ""), children: <OneCardOwnGroups labelFor={() => "Skill"} /> }));
    await waitFor(() => expect(screen.getByTestId("one-card-row-value").textContent).toBe("Welding"));
    expect(screen.queryByTestId("language-row")).toBeNull();
  });
});
