// Pins of `partyTie`: the hook's gates, its key and options, and the ontology origin read when a call is made.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { __resetCatalogueCache, CATALOGUE_TTL_MS } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { masterFetch } from "../test/masterFetch";
import { defaultLinkPredicate, isPartyTypeRef, masterTypeAddress, useDefaultLinkPredicate } from "./partyTie";

const M = "https://ontology.example.test/base";

function wrap(qc: QueryClient) {
  return ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  __resetCatalogueCache();
  setTermOrigin("https://ontology.example.test");
});
afterEach(() => {
  vi.unstubAllGlobals();
  resetTermOrigin();
});

describe("masterTypeAddress", () => {
  it("reads the ontology origin when it is called, not when the module loaded", () => {
    expect(masterTypeAddress("Person")).toBe(`${M}/t/Person`);
    setTermOrigin("https://other.example.test");
    expect(masterTypeAddress("Person")).toBe("https://other.example.test/base/t/Person");
  });
  it("takes the last segment after / or :, ignores trailing slashes and spaces, and gives nothing for a blank", () => {
    expect(masterTypeAddress("  t:Person  ")).toBe(`${M}/t/Person`);
    expect(masterTypeAddress("https://x.example.test/base/t/Person///")).toBe(`${M}/t/Person`);
    expect(masterTypeAddress("   ")).toBe("");
    expect(masterTypeAddress(undefined)).toBe("");
  });
});

describe("isPartyTypeRef and defaultLinkPredicate", () => {
  it("a blank type is not a party and asks the master nothing", async () => {
    const m = masterFetch();
    vi.stubGlobal("fetch", m.fetchImpl);
    await expect(isPartyTypeRef("")).resolves.toBe(false);
    await expect(isPartyTypeRef(null)).resolves.toBe(false);
    expect(m.log).toEqual([]);
  });
  it("isPartyTypeRef rejects when the master cannot be read, while defaultLinkPredicate does not", async () => {
    vi.stubGlobal("fetch", async () => new Response("{}", { status: 503 }));
    await expect(isPartyTypeRef("Person")).rejects.toBeInstanceOf(Error);
    await expect(defaultLinkPredicate("Person", "Person")).resolves.toBe("t:ConnectedTo");
  });
  it("two parties give the associated-with tie, in either order of a person and an organization", async () => {
    vi.stubGlobal("fetch", masterFetch().fetchImpl);
    await expect(defaultLinkPredicate("Organization", "Person")).resolves.toBe("t:AssociatedWith");
    await expect(defaultLinkPredicate("Person", "Organization")).resolves.toBe("t:AssociatedWith");
    await expect(defaultLinkPredicate("Person", undefined)).resolves.toBe("t:ConnectedTo");
  });
});

describe("useDefaultLinkPredicate", () => {
  it("is connected-to at once when it is not enabled or an end is missing, and asks nothing", () => {
    const m = masterFetch();
    vi.stubGlobal("fetch", m.fetchImpl);
    const qc = new QueryClient();
    expect(renderHook(() => useDefaultLinkPredicate("Person", "Person", false), { wrapper: wrap(qc) }).result.current).toBe("t:ConnectedTo");
    expect(renderHook(() => useDefaultLinkPredicate(null, "Person"), { wrapper: wrap(qc) }).result.current).toBe("t:ConnectedTo");
    expect(renderHook(() => useDefaultLinkPredicate("Person", undefined), { wrapper: wrap(qc) }).result.current).toBe("t:ConnectedTo");
    expect(m.log).toEqual([]);
  });
  it("is null while it is read, then the tie, under a key of the two master addresses, kept for the catalogue's 30 minutes and never retried", async () => {
    vi.stubGlobal("fetch", masterFetch().fetchImpl);
    const qc = new QueryClient();
    const { result } = renderHook(() => useDefaultLinkPredicate("Person", "t:Organization"), { wrapper: wrap(qc) });
    expect(result.current).toBeNull();
    await waitFor(() => expect(result.current).toBe("t:AssociatedWith"));
    const key = ["contact-labels", "default-link-predicate", `${M}/t/Person`, `${M}/t/Organization`];
    const q = qc.getQueryCache().find({ queryKey: key });
    expect(q).toBeDefined();
    expect((q!.options as { staleTime: number; retry: boolean }).staleTime).toBe(CATALOGUE_TTL_MS);
    expect((q!.options as { retry: boolean }).retry).toBe(false);
  });
  it("is connected-to for a link that is not between parties", async () => {
    vi.stubGlobal("fetch", masterFetch().fetchImpl);
    const qc = new QueryClient();
    const { result } = renderHook(() => useDefaultLinkPredicate("File", "Task"), { wrapper: wrap(qc) });
    await waitFor(() => expect(result.current).toBe("t:ConnectedTo"));
  });
});
