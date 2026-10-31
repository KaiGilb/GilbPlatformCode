// @vitest-environment jsdom
// New. What the section says when it does not know, and what it never shows: unknown is not empty (the vault, a failed read), a company and a role by name
// (no address in any text, label, placeholder or value, in any state and mode), the work place as an absent slot, and what the company box says it searched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { EMPLOYMENT_READ_FAILED_TEXT } from "@kaigilb/gilbplatformcode-employments-state";
import { __resetEmploymentVocab } from "@kaigilb/gilbplatformcode-employment-vocab";
import { __resetEmploymentLinkVocab } from "@kaigilb/gilbplatformcode-org-terms";
import { EmploymentRows } from "./index";
import { VAULT, hooks, requests, seed, uriOf, writes } from "../test/vault";
import { setUp, tearDown } from "../test/support";
import { answerMaster, finder, show } from "../test/world";
import { master } from "../test/master";

vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => (await import("../test/master")).master);

const PLACE = "https://geo.platform.example.test/base/e/osm-r-2775550";
const settle = () => new Promise((r) => setTimeout(r, 150));

beforeEach(() => {
  setUp();
  __resetEmploymentVocab();
  __resetEmploymentLinkVocab();
  answerMaster();
  finder.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  expect(requests.filter((r) => r.method === "DELETE")).toEqual([]);
  expect(requests.filter((r) => r.url.includes("org-find"))).toEqual([]);
  cleanup();
  vi.restoreAllMocks();
  tearDown();
});

describe("unknown is not empty", () => {
  it("U1: the record names employments but no vault is known: one sentence, no list, no add box, and not one request or write", async () => {
    const a = seed("t:Employment", { org: "Acme" });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    const { q } = show(p, { vaultId: null });
    await settle();
    expect(q.getByTestId("employment-vault-unknown").textContent).toBe(
      "Employment is stored in a vault that is not known here, so it is not shown. This is not a statement that there is none.",
    );
    expect(q.queryAllByTestId("employment-row")).toHaveLength(0);
    expect(q.queryByTestId("employment-section-default")).toBeNull();
    expect(q.queryByRole("button", { name: /add employment/ })).toBeNull();
    expect(requests).toEqual([]);
  });

  it("U1: no vault and the record names none: nothing is said and nothing is drawn (that is a statement the data makes)", async () => {
    const p = seed("t:Person", { givenName: "Bob" });
    const { q } = show(p, { vaultId: null, canEdit: false });
    await settle();
    expect(q.queryByTestId("employment-vault-unknown")).toBeNull();
    expect(q.queryAllByTestId("employment-row")).toHaveLength(0);
    expect(requests).toEqual([]);
  });

  it("U1: the record's own document has not arrived (a placeholder): nothing is said yet", async () => {
    const p = seed("t:Person", { givenName: "Bob" });
    const { q } = show(p, { vaultId: null, servedEdges: `${VAULT}/e/u1`, servedReady: false });
    await settle();
    expect(q.queryByTestId("employment-vault-unknown")).toBeNull();
  });

  it("U1: with a vault known the sentence is not there", async () => {
    const a = seed("t:Employment", { org: "Acme" });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    const { q } = show(p);
    await waitFor(() => expect(q.getAllByTestId("employment-row")).toHaveLength(1));
    expect(q.queryByTestId("employment-vault-unknown")).toBeNull();
  });

  it("U2: a read that failed says one fixed sentence, withholds the add box and 'add employment', and writes nothing", async () => {
    const a = seed("t:Employment", { org: "Acme" });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    master.attributeSpelling.mockImplementation(async () => null as never);
    const { q } = show(p);
    const alert = await waitFor(() => q.getByRole("alert"));
    expect(alert.textContent).toBe(EMPLOYMENT_READ_FAILED_TEXT);
    expect(alert.textContent).not.toMatch(/a\/|org|jobTitle/);
    expect(q.queryByTestId("employment-section-default")).toBeNull();
    expect(q.queryByRole("button", { name: /add employment/ })).toBeNull();
    expect(q.queryByRole("button", { name: "Remove employment Acme" })).toBeNull();
    expect(writes()).toEqual([]);
  });

  it("U2: when the read works again the add box is back", async () => {
    const p = seed("t:Person", { givenName: "Bob" });
    master.attributeSpelling.mockImplementation(async () => null as never);
    const first = show(p);
    await waitFor(() => first.q.getByRole("alert"));
    cleanup();
    __resetEmploymentVocab();
    answerMaster();
    const again = show(p);
    await waitFor(() => expect(again.q.getByTestId("employment-section-default")).toBeTruthy());
    expect(again.q.queryByRole("alert")).toBeNull();
  });
});

describe("a company and a role by name: no address in any text, label, placeholder or value", () => {
  const strings = (): string[] => {
    const all = [...document.body.querySelectorAll("*")];
    return [
      document.body.textContent ?? "",
      ...all.flatMap((el) => ["aria-label", "title", "placeholder", "value", "alt"].map((a) => el.getAttribute(a) ?? "")),
      ...(all.filter((el) => el instanceof HTMLInputElement) as HTMLInputElement[]).map((i) => i.value),
    ];
  };
  const noAddress = (state: string) => {
    for (const s of strings()) {
      expect(s, state).not.toContain("://");
      expect(s, state).not.toContain("06gk");
      expect(s, state).not.toContain("osm-");
      expect(s, state).not.toContain("base:e/");
    }
  };
  const ORGREC = () => seed("t:Organization", { name: "Butikk AS" });
  type World = [string, () => string];
  const worlds: World[] = [
    ["named", () => seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(seed("t:Employment", { org: "Acme", jobTitle: "CEO", startDate: "2019-03", workLocation: { "@id": PLACE } })) } })],
    ["a company that is an address", () => seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(seed("t:Employment", { org: `${VAULT}/e/06gk0000000000000000000abc`, jobTitle: "base:e/06gk0000000000000000000def" })) } })],
    ["no company text but a linked organization", () => { const o = ORGREC(); return seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(seed("t:Employment", { jobTitle: "CEO", employer: { "@id": uriOf(o) } })) } }); }],
    ["a stored place that does not read", () => seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(seed("t:Employment", { org: "Acme", startDate: "2019-03", workLocation: { "@id": `${PLACE}-missing` } })) } })],
    ["an edge that did not read, and a legacy text", () => seed("t:Person", { givenName: "Bob", employment: [{ "@id": uriOf("06gkgone") }, "Old Firm AS", { "@id": uriOf(seed("t:Employment", { org: "Acme" })) }] })],
  ];
  for (const [name, make] of worlds) {
    for (const mode of ["presentation", "edit", "read-only"] as const) {
      it(`${name}, ${mode}`, async () => {
        const p = make();
        const { q } = show(p, mode === "read-only" ? { canEdit: false } : {});
        noAddress(`${name}, ${mode}, while reading`);
        await settle();
        if (mode === "edit") {
          const closed = q.queryAllByTestId("company-search-closed")[0];
          if (closed) fireEvent.click(closed);
        }
        noAddress(`${name}, ${mode}`);
      });
    }
  }

  it("a presentation card (the record card's mode) draws the same words", async () => {
    const o = seed("t:Employment", { org: `${VAULT}/e/06gk0000000000000000000abc`, jobTitle: "base:e/06gk0000000000000000000def", startDate: "2019-03" });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(o) } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit>
          <EmploymentRows title="Employment" recordId={p} recordEntityUri={uriOf(p)} vaultId={VAULT} edgeKey="employment" servedEdges={{ "@id": uriOf(o) }} canEdit find={finder} />
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(container.querySelector("[data-testid=employment-company-value]")).not.toBeNull());
    expect(container.querySelector("[data-testid=employment-company-value]")!.textContent).toBe("A company");
    expect(container.querySelector("[data-testid=employment-title-value]")!.textContent).toBe("A role");
    noAddress("presentation card");
  });
});

describe("the work place is an absent slot", () => {
  it("with no slot a stored place is drawn nowhere (not as a name, not as an address), and the date line is", async () => {
    const a = seed("t:Employment", { org: "Acme", startDate: "2019-03", ongoing: true, workLocation: { "@id": PLACE } });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    const { q, container } = show(p, { canEdit: false });
    await waitFor(() => expect(q.getByTestId("experience-role")).toBeTruthy());
    expect(q.getByTestId("experience-role").textContent).toMatch(/2019 – Present/);
    expect(container.textContent).not.toMatch(/osm|geo\.|Oslo/);
    cleanup();
    show(p);
    await waitFor(() => expect(document.querySelector("[aria-label='Role start']")).not.toBeNull());
    expect(document.querySelector("[aria-label='Role location']")).toBeNull();
    expect(document.body.textContent).not.toMatch(/Location/);
  });

  it("an employment that has only a place is not drawn by a card with no slot", async () => {
    const a = seed("t:Employment", { workLocation: { "@id": PLACE } });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const { container } = render(
      <QueryClientProvider client={qc}>
        <CardModeProvider canEdit={false}>
          <EmploymentRows title="Employment" recordId={p} recordEntityUri={uriOf(p)} vaultId={VAULT} edgeKey="employment" servedEdges={{ "@id": uriOf(a) }} canEdit={false} find={finder} />
        </CardModeProvider>
      </QueryClientProvider>,
    );
    await settle();
    expect(container.querySelector("[data-testid=employment-row]")).toBeNull();
  });

  it("given a name slot, the section draws the place through it; given a Location slot, edit mode has it", async () => {
    const a = seed("t:Employment", { org: "Acme", startDate: "2019-03", workLocation: { "@id": PLACE } });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    const { q } = show(p, {
      canEdit: false,
      renderPlaceName: (s) => <p data-testid="slot-place">{s.placeLabel || "A place"}</p>,
    });
    // The stored compact or full place reads as an address only with the catalogue's origin; here the full address is stored.
    await waitFor(() => expect(q.getByTestId("slot-place").textContent).toBe("A place"));
    cleanup();
    const second = show(p, { renderWorkLocation: (s) => <span data-testid="slot-location">{s.placeId}</span> });
    await waitFor(() => expect(second.q.getByTestId("slot-location").textContent).toBe(PLACE));
  });
});

describe("the catalogue's origin is passed on", () => {
  it("a place stored as a compact id reads as an address with the origin given, and as none without it", async () => {
    const a = seed("t:Employment", { org: "Acme", startDate: "2019-03", workLocation: "base:e/osm-r-2775550" });
    const p = seed("t:Person", { givenName: "Bob", employment: { "@id": uriOf(a) } });
    const slot = { renderWorkLocation: (s: { placeId: string }) => <span data-testid="slot-location">{s.placeId || "(none)"}</span> };
    const withOrigin = show(p, { ...slot, catalogueOrigin: "https://geo.platform.example.test" });
    await waitFor(() => expect(withOrigin.q.getByTestId("slot-location").textContent).toBe("https://geo.platform.example.test/base/e/osm-r-2775550"));
    cleanup();
    const without = show(p, slot);
    await waitFor(() => expect(without.q.getByTestId("slot-location").textContent).toBe("(none)"));
  });
});

describe("the company box says what it searched", () => {
  it("asks the vault the section holds, by text, and names it by the name it was given", async () => {
    const p = seed("t:Person", { givenName: "Bob" });
    finder.mockResolvedValueOnce({ hits: [], complete: false });
    const { q } = show(p);
    fireEvent.click(await q.findByLabelText("Edit Employment Company"));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    const note = await q.findByTestId("company-search-incomplete");
    expect(note.textContent).toContain("Not every record in Hytta was searched.");
    expect(finder).toHaveBeenCalledWith(VAULT, "Zeta");
    expect(q.queryByTestId("company-search-miss")).toBeNull();
    expect(document.body.textContent).not.toMatch(/No company named/);
  });

  it("a finder that fails: the search is said not to have been made, no miss sentence, the typed name can be used", async () => {
    const p = seed("t:Person", { givenName: "Bob" });
    finder.mockRejectedValueOnce(new Error("503"));
    const { q } = show(p, { vaultName: undefined });
    fireEvent.click(await q.findByLabelText("Edit Employment Company"));
    fireEvent.change(q.getByLabelText("Edit Employment Company"), { target: { value: "Zeta" } });
    const alert = await q.findByRole("alert");
    expect(alert.textContent).toContain("The search of this vault could not be made.");
    expect(q.queryByTestId("company-search-miss")).toBeNull();
    fireEvent.click(q.getByTestId("company-use-typed"));
    await waitFor(() => expect(hooks.failCreate).toBe(false));
    await waitFor(() => expect(requests.some((r) => r.method === "POST")).toBe(true));
  });
});
