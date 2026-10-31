// @vitest-environment jsdom
// Ported from GilbApp `CompanySearch.test.tsx` (2 of its 3 cases, re-based on the records finder: the third tests the organization-VAULT finder,
// which this unit does not have), and new: the finder's four answers (complete, not complete, failed, no vault) said as what they are.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CompanySearch, type CompanyFind, type CompanyFound } from "./index";

const VAULT = "https://hytta.platform.example.test/base";
const ACME = { uri: `${VAULT}/e/06gk0000000000000000000001`, label: "Acme" };
const SIDE = { uri: `${VAULT}/e/06gk0000000000000000000002`, label: "Acmeville Holding" };
const ANSWER = (hits: CompanyFound["hits"], complete = true): CompanyFound => ({ hits, complete });

let fetchSpy: ReturnType<typeof vi.fn>;
beforeEach(() => {
  fetchSpy = vi.fn(async () => new Response("{}", { status: 404 }));
  vi.stubGlobal("fetch", fetchSpy);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderSearch(
  find: CompanyFind,
  over: Partial<Parameters<typeof CompanySearch>[0]> = {},
): { onUseName: ReturnType<typeof vi.fn>; onUseRecord: ReturnType<typeof vi.fn>; container: HTMLElement } {
  const onUseName = vi.fn();
  const onUseRecord = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const view = render(
    <QueryClientProvider client={qc}>
      <CompanySearch value="" onUseName={onUseName} onUseRecord={onUseRecord} recordsVaultId={VAULT} find={find} {...over} />
    </QueryClientProvider>,
  );
  return { onUseName, onUseRecord, container: view.container };
}
const open = () => fireEvent.click(screen.getByLabelText("Edit Employment Company"));
const type = (text: string) => fireEvent.change(screen.getByLabelText("Edit Employment Company"), { target: { value: text } });
const body = () => document.body.textContent ?? "";

describe("CompanySearch, ported", () => {
  it("is the company field, and it lists the organization records the finder returns", async () => {
    const find = vi.fn(async () => ANSWER([ACME]));
    const { onUseRecord, onUseName } = renderSearch(find);
    open();
    type("ac");
    const hit = await screen.findByTestId(`company-search-hit-${ACME.uri}`);
    expect((hit).textContent).toContain("Acme");
    expect(find).toHaveBeenCalledWith(VAULT, "ac");
    expect(screen.queryByText("Ask to join")).toBeNull();
    fireEvent.click(hit);
    expect(onUseRecord).toHaveBeenCalledWith({ uri: ACME.uri, name: "Acme" });
    expect(onUseName).not.toHaveBeenCalled();
    await screen.findByTestId("company-search-closed");
  });

  it("a miss offers the typed name, and nothing is minted", async () => {
    const find = vi.fn(async () => ANSWER([]));
    const { onUseName } = renderSearch(find, { vaultName: "Hytta" });
    open();
    type("John AS");
    const use = await screen.findByTestId("company-use-typed");
    expect((screen.getByTestId("company-search-miss")).textContent).toContain("No organization record named “John AS” in Hytta.");
    fireEvent.click(use);
    expect(onUseName).toHaveBeenCalledWith("John AS");
    await screen.findByTestId("company-search-closed");
  });

  it("a failed search is said, and is not shown as 'no such company'", async () => {
    const find = vi.fn(async () => {
      throw new Error("Could not search (503)");
    });
    renderSearch(find, { vaultName: "Hytta" });
    open();
    type("Acme");
    await waitFor(() => expect((screen.getByRole("alert")).textContent).toContain("The search of Hytta could not be made."));
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
  });
});

describe("the finder's answers, said as what they are", () => {
  it("(i) complete, no hit: the miss names the vault asked; with no name given it says 'this vault'", async () => {
    renderSearch(vi.fn(async () => ANSWER([])), { vaultName: "Hytta" });
    open();
    type("Zeta");
    expect((await screen.findByTestId("company-search-miss")).textContent).toContain("No organization record named “Zeta” in Hytta.");
    cleanup();
    renderSearch(vi.fn(async () => ANSWER([])));
    open();
    type("Zeta");
    expect((await screen.findByTestId("company-search-miss")).textContent).toContain("No organization record named “Zeta” in this vault.");
    cleanup();
    renderSearch(vi.fn(async () => ANSWER([])), { vaultName: "   " });
    open();
    type("Zeta");
    expect((await screen.findByTestId("company-search-miss")).textContent).toContain("in this vault.");
  });

  it("(ii) complete: false, no hit: says the search was not complete, names the vault, draws no miss, and offers Try again", async () => {
    const find = vi.fn(async () => ANSWER([], false));
    const { onUseName } = renderSearch(find, { vaultName: "Hytta" });
    open();
    type("Zeta");
    const note = await screen.findByTestId("company-search-incomplete");
    expect((note).textContent).toContain("Not every record in Hytta was searched. This is not a statement that there is no such company.");
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
    expect(body()).not.toMatch(/No organization record named|No company named/);
    fireEvent.click(screen.getByTestId("company-search-retry"));
    await waitFor(() => expect(find).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByTestId("company-use-typed"));
    expect(onUseName).toHaveBeenCalledWith("Zeta");
  });

  it("(ii) an answer that does not say complete: true is read as not complete", async () => {
    renderSearch(vi.fn(async () => ({ hits: [] }) as unknown as CompanyFound), { vaultName: "Hytta" });
    open();
    type("Zeta");
    expect(await screen.findByTestId("company-search-incomplete")).toBeTruthy();
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
  });

  it("(iii) a failed search: the alert names the vault, there is no miss sentence, and the typed name can still be used", async () => {
    const { onUseName } = renderSearch(
      vi.fn(async () => {
        throw new Error("503");
      }),
      { vaultName: "Hytta" },
    );
    open();
    type("Zeta");
    const alert = await screen.findByRole("alert");
    expect((alert).textContent).toContain("The search of Hytta could not be made. This is not a statement that there is no such company.");
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
    expect(body()).not.toMatch(/No organization record named|No company named/);
    fireEvent.click(screen.getByTestId("company-use-typed"));
    expect(onUseName).toHaveBeenCalledWith("Zeta");
  });

  it("(iv) a partial list: the hits are offered and the list says it is not the whole; the typed name is offered too", async () => {
    const { onUseRecord } = renderSearch(vi.fn(async () => ANSWER([ACME, SIDE], false)), { vaultName: "Hytta" });
    open();
    type("Acme");
    await screen.findByTestId("company-search-hits");
    expect((screen.getByTestId("company-search-incomplete")).textContent).toContain("Not every record in Hytta was searched");
    expect(screen.getByTestId("company-use-typed")).toBeTruthy();
    fireEvent.click(screen.getByTestId(`company-search-hit-${SIDE.uri}`));
    expect(onUseRecord).toHaveBeenCalledWith({ uri: SIDE.uri, name: "Acmeville Holding" });
  });

  it("(iv) a complete list with hits offers the hits only (the typed name is chosen when nothing matches)", async () => {
    renderSearch(vi.fn(async () => ANSWER([ACME])), { vaultName: "Hytta" });
    open();
    type("Acm");
    await screen.findByTestId("company-search-hits");
    expect(screen.queryByTestId("company-use-typed")).toBeNull();
    expect(screen.queryByTestId("company-search-incomplete")).toBeNull();
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
  });

  it("(v) no vault: nothing is searched, the box says no vault is known and draws no miss; the typed name can be used", async () => {
    const find = vi.fn(async () => ANSWER([]));
    const { onUseName } = renderSearch(find, { recordsVaultId: null });
    open();
    type("Zeta");
    expect((await screen.findByTestId("company-search-not-made")).textContent).toContain("No vault is known here, so no organization record was searched.");
    expect(find).not.toHaveBeenCalled();
    expect(screen.queryByTestId("company-search-miss")).toBeNull();
    fireEvent.click(screen.getByTestId("company-use-typed"));
    expect(onUseName).toHaveBeenCalledWith("Zeta");
  });

  it("(vi) the visible text is the record's label: no address in the text, a label, a title, a placeholder or a value", async () => {
    const find = vi.fn(async () => ANSWER([ACME, SIDE], false));
    renderSearch(find, { vaultName: "Hytta" });
    open();
    type("Acme");
    await screen.findByTestId("company-search-hits");
    const all = [...document.body.querySelectorAll("*")];
    const shown = [body(), ...all.flatMap((e) => ["aria-label", "title", "placeholder", "value", "alt"].map((a) => e.getAttribute(a) ?? "")), ...(all.filter((e) => e instanceof HTMLInputElement) as HTMLInputElement[]).map((i) => i.value)];
    for (const t of shown) {
      expect(t).not.toContain("://");
      expect(t).not.toContain("06gk");
    }
    expect(body()).toContain("Acme");
  });
});

describe("what it asks, and when it writes", () => {
  it("an empty box asks nothing; typed text is asked once, with the vault; a pause is needed first", async () => {
    const find = vi.fn(async () => ANSWER([ACME]));
    renderSearch(find);
    open();
    await new Promise((r) => setTimeout(r, 400));
    expect(find).not.toHaveBeenCalled();
    type("A");
    type("Ac");
    type("Acm");
    await screen.findByTestId("company-search-hits");
    expect(find.mock.calls).toEqual([[VAULT, "Acm"]]);
  });

  it("it never makes a request of its own: the finder is the only thing it calls (no organization-vault directory)", async () => {
    renderSearch(vi.fn(async () => ANSWER([])), { vaultName: "Hytta" });
    open();
    type("Zeta");
    await screen.findByTestId("company-search-miss");
    cleanup();
    renderSearch(
      vi.fn(async () => {
        throw new Error("x");
      }),
    );
    open();
    type("Zeta");
    await screen.findByRole("alert");
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("opening, typing, leaving the box (blur) and Escape write nothing; Escape restores the value", async () => {
    const find = vi.fn(async () => ANSWER([]));
    const { onUseName, onUseRecord } = renderSearch(find, { value: "Acme" });
    open();
    const box = screen.getByLabelText("Edit Employment Company");
    fireEvent.change(box, { target: { value: "Acm" } });
    await screen.findByTestId("company-use-typed");
    fireEvent.blur(box);
    expect(onUseName).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: "Escape" });
    expect(onUseName).not.toHaveBeenCalled();
    expect(onUseRecord).not.toHaveBeenCalled();
    expect((screen.getByTestId("company-search-closed")).textContent).toContain("Acme");
  });

  it("Enter takes an exact match among the hits (the record), and nothing otherwise", async () => {
    const { onUseRecord, onUseName } = renderSearch(vi.fn(async () => ANSWER([ACME, SIDE])));
    open();
    type("acme");
    await screen.findByTestId("company-search-hits");
    fireEvent.keyDown(screen.getByLabelText("Edit Employment Company"), { key: "Enter" });
    expect(onUseRecord).toHaveBeenCalledWith({ uri: ACME.uri, name: "Acme" });
    expect(onUseName).not.toHaveBeenCalled();
  });

  it("Enter with no exact match writes nothing", async () => {
    const { onUseRecord, onUseName } = renderSearch(vi.fn(async () => ANSWER([SIDE])));
    open();
    type("Acme");
    await screen.findByTestId("company-search-hits");
    fireEvent.keyDown(screen.getByLabelText("Edit Employment Company"), { key: "Enter" });
    expect(onUseRecord).not.toHaveBeenCalled();
    expect(onUseName).not.toHaveBeenCalled();
  });

  it("with no onUseRecord a record pick uses its name; an empty typed name is never used", async () => {
    const { onUseName } = renderSearch(vi.fn(async () => ANSWER([ACME])), { onUseRecord: undefined });
    open();
    type("Acm");
    fireEvent.click(await screen.findByTestId(`company-search-hit-${ACME.uri}`));
    expect(onUseName).toHaveBeenCalledWith("Acme");
  });

  it("a disabled box cannot be opened; an empty value draws 'Add company' and the add marker", () => {
    renderSearch(vi.fn(async () => ANSWER([])), { disabled: true });
    const closed = screen.getByTestId("company-search-closed") as HTMLButtonElement;
    expect(closed.disabled).toBe(true);
    expect(closed.hasAttribute("data-card-add")).toBe(true);
    expect((closed).textContent).toContain("Add company");
  });

  it("startEditing opens the box at once with the cursor in it", () => {
    renderSearch(vi.fn(async () => ANSWER([])), { startEditing: true });
    expect(document.activeElement).toBe(screen.getByLabelText("Edit Employment Company"));
  });
});
