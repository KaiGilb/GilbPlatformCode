import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StyleStudio, normaliseWebAddress } from "./studio/index";
import { defaultSheet } from "./studio/model";
import type { SavedIds } from "./save/styleStore";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const tab = (name: string) => screen.getByRole("tab", { name });
const BASE = "https://vault.test";

function fakeVault() {
  const calls: { method: string; url: string; body?: unknown; headers: Record<string, string> }[] = [];
  let n = 0;
  const f = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    calls.push({ method, url, body: typeof init?.body === "string" ? JSON.parse(init.body) : init?.body, headers: (init?.headers ?? {}) as Record<string, string> });
    if (url.includes("/files?")) return new Response(JSON.stringify({ fileEntity: `${BASE}/lws/vault/v/f/${++n}` }), { status: 201 });
    if (url.endsWith("/c")) return new Response(null, { status: 201, headers: { location: `${BASE}/lws/vault/v/e/${++n}`, etag: '"1"' } });
    if (method === "PUT") return new Response(null, { status: 200, headers: { etag: '"2"' } });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("Studio save to the vault", () => {
  it("with a vault prop, Save writes records, shows the sheet URL and a Copy button, and does not call onSave", async () => {
    const { f, calls } = fakeVault();
    const onSave = vi.fn();
    const onSaved = vi.fn();
    const writeText = vi.fn(async () => {});
    vi.stubGlobal("navigator", Object.assign(Object.create(navigator), { clipboard: { writeText } }));
    const initial = { ...defaultSheet(), logo: { primary: "data:image/png;base64,iVBORw0KGgo=" } };
    render(<StyleStudio initial={initial} onSave={onSave} onSaved={onSaved} vault={{ vaultBase: BASE, vaultId: "v", publicGrantee: "https://example.test/base/t/PublicGrantee", fetch: f, auth: async (m, u) => ({ dpop: `${m} ${u}` }) }} />);
    fireEvent.click(tab("Save & export"));
    fireEvent.click(screen.getByTestId("gs-save"));
    const box = await screen.findByTestId("gs-sheet-url");
    expect(box.textContent).toContain("Your app reads its style from:");
    const posts = calls.filter((c) => c.url.endsWith("/c")).map((c) => (c.body as { type: string }).type);
    expect(posts).toEqual(["t:ColourPalette", "t:BrandKit", "t:AppStyleSheet"]);
    expect(calls[0]!.url).toContain("/files?name=logo.png");
    expect(calls[0]!.body).toBeInstanceOf(Blob);
    expect(onSave).not.toHaveBeenCalled();
    expect(onSaved).toHaveBeenCalledTimes(1);
    const ids = onSaved.mock.calls[0]![0] as SavedIds;
    expect(box.textContent).toContain(ids.sheet.id);
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(ids.sheet.id));

    // a second save updates the same records (PUT with If-Match) and does not upload the unchanged logo again
    calls.length = 0;
    fireEvent.click(screen.getByTestId("gs-save"));
    await waitFor(() => expect(onSaved).toHaveBeenCalledTimes(2));
    expect(calls.filter((c) => c.method === "PUT" && !c.url.includes("/files?")).length).toBe(3);
    expect(calls.some((c) => c.url.includes("/files?"))).toBe(false);
    expect(calls.filter((c) => c.url.endsWith("/c")).length).toBe(0);
  });

  it("shows the server failure in plain words", async () => {
    const f = (async () => new Response("no", { status: 403 })) as unknown as typeof fetch;
    render(<StyleStudio vault={{ vaultBase: BASE, vaultId: "v", publicGrantee: "https://example.test/base/t/PublicGrantee", fetch: f, auth: async () => ({}) }} />);
    fireEvent.click(tab("Save & export"));
    fireEvent.click(screen.getByTestId("gs-save"));
    expect((await screen.findByRole("alert")).textContent).toMatch(/palette step failed \(HTTP 403\)/);
    expect(screen.queryByTestId("gs-sheet-url")).toBeNull();
  });

  it("without a vault prop, onSave is called as before", async () => {
    const onSave = vi.fn();
    render(<StyleStudio onSave={onSave} />);
    fireEvent.click(tab("Save & export"));
    fireEvent.click(screen.getByTestId("gs-save"));
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("gs-sheet-url")).toBeNull();
  });
});

describe("website address field", () => {
  it("starts empty with the example placeholder", () => {
    render(<StyleStudio extractFromUrl={async () => ({ colors: [], fonts: [] })} />);
    fireEvent.click(tab("From website"));
    const input = screen.getByLabelText("Website address") as HTMLInputElement;
    expect(input.value).toBe("");
    expect(input.placeholder).toBe("https://example.com");
  });

  it("normaliseWebAddress adds https:// and collapses a doubled one", () => {
    expect(normaliseWebAddress("example.com")).toBe("https://example.com");
    expect(normaliseWebAddress("  example.com/x ")).toBe("https://example.com/x");
    expect(normaliseWebAddress("https://https://example.com")).toBe("https://example.com");
    expect(normaliseWebAddress("https://example.com")).toBe("https://example.com");
    expect(normaliseWebAddress("")).toBe("");
  });

  it.each([["example.com"], ["https://https://example.com"]])("submitting %s reads https://example.com", async (typed) => {
    const extract = vi.fn(async () => ({ colors: ["#0b6e4f"], fonts: [] }));
    render(<StyleStudio extractFromUrl={extract} />);
    fireEvent.click(tab("From website"));
    fireEvent.change(screen.getByLabelText("Website address"), { target: { value: typed } });
    fireEvent.click(screen.getByRole("button", { name: "Read styles" }));
    await waitFor(() => expect(extract).toHaveBeenCalledWith("https://example.com"));
  });
});
