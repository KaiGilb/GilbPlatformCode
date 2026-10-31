// @vitest-environment jsdom
// The five cases of the source's `RelatedChildren.disclosure.test.tsx` (ported), and new ones for the list itself and the skip set.
// The source mocked `useRecords` and `useMemberOfChildren`. Here nothing is mocked: the vault's recency page is the page's query
// cache (seeded, fresh), and the reverse index is the real `useMemberOfChildren` over a fake platform (test/support.ts) whose
// find reports the total and whose reads serve the children.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { recordsKey } from "@kaigilb/gilbplatformcode-record-cache-kit";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { RelatedChildren, cachedRecordsPointingAt } from "./index";
import { SYSTEM, fakePlatform, setUp, tearDown } from "../test/support";

beforeEach(() => setUp());
afterEach(() => {
  cleanup();
  tearDown();
});

const PARENT_URI = `${SYSTEM}/base/e/osm-r-2978650`;
const parent = { id: "osm-r-2978650", entityUri: PARENT_URI };
const kidUri = (n: number) => `${SYSTEM}/base/e/kid-${n}`;

/** A child record whose `memberOf` fact points at the parent (as the vault's recency page holds it). */
function child(n: number, facts: Record<string, string> = {}): BaseRecord {
  return { id: `kid-${n}`, typeUri: "t:Municipality", entityUri: kidUri(n), facts: { title: `Kid ${n}`, memberOf: PARENT_URI, ...facts }, opaqueFacts: [], etag: `"sha256:kid-${n}"` };
}

/** The vault's list in the page's cache, and a fake platform whose reverse index holds `ids` (reported as `total`). */
function mount(opts: { list?: BaseRecord[]; ids?: number[]; total?: number; onOpen?: (id: string) => void; unreadable?: string[] } = {}) {
  const ids = opts.ids ?? [];
  const w = fakePlatform({
    stores: { [SYSTEM]: { [PARENT_URI]: ids.map(kidUri) } },
    counts: opts.total === undefined ? undefined : { [PARENT_URI]: opts.total },
    unreadable: opts.unreadable,
    childFacts: () => ({ "a:memberOf": PARENT_URI }),
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
  qc.setQueryData(recordsKey("vault1"), { pages: [{ records: opts.list ?? [], total: (opts.list ?? []).length, complete: true, pageSize: 50, offset: 0 }], pageParams: [0] });
  render(<QueryClientProvider client={qc}><RelatedChildren record={parent} vaultId="vault1" onOpen={opts.onOpen} /></QueryClientProvider>);
  return { w, qc };
}
const disclosure = () => screen.queryByText(/member-of children/i)?.textContent ?? null;

describe("RelatedChildren: withheld member-of children are disclosed (source disclosure.test)", () => {
  it("discloses `N of M member-of children` when the total exceeds what is rendered", async () => {
    mount({ ids: [1, 2, 3], total: 375 });
    await screen.findByText("kid-1");
    expect(screen.getByText("kid-3")).toBeTruthy();
    expect(disclosure()).toBe("3 of 375 member-of children");
  });

  it("does NOT invent a remainder when nothing is withheld (total === rendered)", async () => {
    mount({ ids: [1, 2], total: 2 });
    await screen.findByText("kid-2");
    expect(screen.getByText("kid-1")).toBeTruthy();
    expect(disclosure()).toBeNull();
  });

  it("counts each child ONCE: the recency page and the reverse set overlap", async () => {
    mount({ list: [child(1), child(2)], ids: [2, 3], total: 375 });
    await screen.findByText("kid-3");
    expect(screen.getAllByText("Kid 2")).toHaveLength(1);
    expect(screen.getByText("Kid 1")).toBeTruthy();
    expect(disclosure()).toBe("3 of 375 member-of children");
  });

  it("stays silent when the parent has no reverse-index children at all", async () => {
    const { w } = mount();
    await waitFor(() => expect(w.finds).toHaveLength(1));
    await waitFor(() => expect(screen.queryByText(/children/i)).toBeNull());
    expect(disclosure()).toBeNull();
  });

  it("still discloses when every child was withheld: the worst case is not the silent one", async () => {
    mount({ ids: [1, 2], total: 375, unreadable: ["kid-1", "kid-2"] });
    await waitFor(() => expect(disclosure()).toBe("0 of 375 member-of children"));
  });
});

describe("RelatedChildren: the list", () => {
  it("names each child by its display name and its slug, under a 'Children' heading", async () => {
    mount({ list: [child(1)] });
    await screen.findByText("Kid 1");
    expect(screen.getByText("Children")).toBeTruthy();
    expect(screen.getByText("memberOf")).toBeTruthy();
  });
  it("opens a child by its id when the host gives onOpen; else the name is plain text", async () => {
    const onOpen = vi.fn();
    mount({ list: [child(1)], onOpen });
    fireEvent.click(await screen.findByRole("button", { name: "Kid 1" }));
    expect(onOpen).toHaveBeenCalledWith("kid-1", kidUri(1));
    cleanup();
    mount({ list: [child(1)] });
    await screen.findByText("Kid 1");
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("uses the record card's name rule (the master tag, the file name, the address tail), not the short one", async () => {
    mount({ list: [child(1, { title: "", unitTag: "TAG-1" }), child(2, { title: "", fileName: "contract.pdf" })] });
    await screen.findByText("TAG-1");
    expect(screen.getByText("contract.pdf")).toBeTruthy();
  });
  it("the parent itself is never its own child", async () => {
    mount({ list: [{ id: parent.id, entityUri: PARENT_URI, typeUri: "t:Municipality", facts: { title: "Norway", memberOf: PARENT_URI }, opaqueFacts: [], etag: null }] });
    await waitFor(() => expect(screen.queryByText("Norway")).toBeNull());
  });
});

describe("RelatedChildren: identity pointers are not children (the skip set)", () => {
  const SKIP = ["claimSubject", "heldParty", "profilePhoto", "principalUri", "directReader", "directWriter", "aliasUri", "accountSubject", "registeredVault", "vaultAddress", "anchorBoundEmail"];
  const holder = (slug: string): BaseRecord => ({ id: `holder-${slug}`, typeUri: "t:Claim", entityUri: `${SYSTEM}/base/e/holder-${slug}`, facts: { title: `Holder ${slug}`, [slug]: PARENT_URI }, opaqueFacts: [], etag: null });

  it("a record that names the parent only through one of the eleven identity slugs is not listed", async () => {
    mount({ list: [...SKIP.map(holder), child(1)] });
    await screen.findByText("Kid 1");
    for (const slug of SKIP) expect(screen.queryByText(`Holder ${slug}`), slug).toBeNull();
  });
  it("any other slug that names the parent is listed, with its slug", async () => {
    mount({ list: [holder("partOf"), holder("employer")] });
    await screen.findByText("Holder partOf");
    expect(screen.getByText("Holder employer")).toBeTruthy();
    expect(screen.getByText("employer")).toBeTruthy();
  });
  it("the cached records that seed the reverse read skip them too (so they do not take room from the 80)", () => {
    const qc = new QueryClient();
    for (const slug of SKIP) qc.setQueryData(["base", "record", `holder-${slug}`, SYSTEM], holder(slug));
    qc.setQueryData(["base", "record", "holder-partOf", SYSTEM], holder("partOf"));
    expect(cachedRecordsPointingAt(qc, PARENT_URI).map((r) => r.id)).toEqual(["holder-partOf"]);
  });
});
