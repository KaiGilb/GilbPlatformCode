// Ported from GilbApp's addedBy.sb1b2.test.tsx (9 tests): the CLIENT of the platform route (`GET /base/source-name?items=…`: chunking at 50, dedupe,
// URL-encoding, null handling, 404 on the route) and the REQUEST COUNT of a whole card view. Re-based on the real peers over the source's own test kit.
// The source's 9th test mounts three sections of the app (Interests, Skills, Organization number) that are in no unit; here the same claim (seven
// details of two other adders, three sections, ONE request carrying seven addresses, the viewer's own never asked about) is made with three
// sections that each draw `AddedByLine`. Hosts are `example.test` hosts under a test base origin.
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AddedByHostContext, AddedByLine, fetchSourceNames, useAddedBy } from "./index";
import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { installSourceName } from "../test/addedByTestkit";
import { ANNA, BO, HYTTA, client, itemAt, setUp, tearDown } from "../test/support";

beforeEach(setUp);
afterEach(() => {
  cleanup();
  tearDown();
});

const host = { useShell: () => null };
const Wrap = ({ qc, children }: { qc: ReturnType<typeof client>; children: React.ReactNode }) => (
  <AddedByHostContext.Provider value={host}>
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  </AddedByHostContext.Provider>
);
const mapOf = (card: (a: string) => { statedBy: string; name: string } | null) => (items: string[]) =>
  Object.fromEntries(items.map((a) => [a, card(a)])) as Record<string, { statedBy: string | null; name: string | null }>;
const settle = () => act(async () => void (await vi.advanceTimersByTimeAsync(200)));

describe("the client of GET /base/source-name", () => {
  it("dedupes, URL-encodes each address, sends them in ONE call under 50, and reads the names (trimmed)", async () => {
    const a = `${HYTTA}/base/e/a b?x=1&y=2`;
    const b = `${HYTTA}/base/e/b`;
    const rig = installSourceName(() => ({ [a]: { statedBy: ANNA, name: "  Anna Berg " }, [b]: { statedBy: null, name: null } }));
    const got = await fetchSourceNames([a, b, a, `  ${b}  `]);
    expect(rig.calls).toEqual([[a, b]]);
    expect(rig.urls[0]).toBe(`${vaultOriginOf(a)}/base/source-name?items=${encodeURIComponent(a)},${encodeURIComponent(b)}`);
    expect(got.get(a)).toEqual({ statedBy: ANNA, name: "Anna Berg" });
    expect(got.get(b)).toBeNull();
    rig.restore();
  });
  it("60 addresses are 2 calls (50 + 10)", async () => {
    const items = Array.from({ length: 60 }, (_, i) => `${HYTTA}/base/e/i${i}`);
    const rig = installSourceName(mapOf((a) => ({ statedBy: ANNA, name: `N ${a.slice(-2)}` })));
    const got = await fetchSourceNames(items);
    expect(rig.calls.map((c) => c.length).sort((x, y) => y - x)).toEqual([50, 10]);
    expect(got.size).toBe(60);
    rig.restore();
  });
  it("a 404 on the route, a half entry (a name with no card) and a network failure all give null, and never throw", async () => {
    const a = `${HYTTA}/base/e/a`;
    let rig = installSourceName(() => 404);
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
    rig.restore();
    rig = installSourceName(() => ({ [a]: { statedBy: null, name: "Anna" } }));
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
    rig.restore();
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect((await fetchSourceNames([a])).get(a)).toBeNull();
  });
  it("says why nothing is shown once per page, at debug level", async () => {
    const debug = vi.spyOn(console, "debug").mockImplementation(() => {});
    installSourceName(() => 404);
    await fetchSourceNames([`${HYTTA}/base/e/a`]);
    await fetchSourceNames([`${HYTTA}/base/e/b`]);
    expect(debug).toHaveBeenCalledTimes(1);
  });
});

function Probe({ items }: { items: Array<{ item: string; own: boolean }> }) {
  const who = useAddedBy(items);
  return <ul>{items.map((i) => <li key={i.item} data-testid="probe">{JSON.stringify(who(i.item))}</li>)}</ul>;
}

describe("the hook: requests asked for together are one batch", () => {
  it("60 other-adder items -> 2 requests (50 + 10)", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({ item: `${HYTTA}/base/e/i${i}`, own: false }));
    const rig = installSourceName(mapOf((a) => ({ statedBy: ANNA, name: `N${a.split("/i").pop()}` })));
    render(<Wrap qc={client()}><Probe items={items} /></Wrap>);
    await waitFor(() => expect(screen.getAllByTestId("probe")[59]!.textContent).toContain("N59"));
    expect(rig.calls.map((c) => c.length).sort((x, y) => y - x)).toEqual([50, 10]);
  });
  it("a viewer whose details are all their own -> 0 requests, and every line says 'you'", async () => {
    vi.useFakeTimers();
    const items = Array.from({ length: 5 }, (_, i) => ({ item: `${HYTTA}/base/e/i${i}`, own: true }));
    const rig = installSourceName(() => ({}));
    render(<Wrap qc={client()}><Probe items={items} /></Wrap>);
    await settle();
    expect(rig.calls).toHaveLength(0);
    expect(screen.getAllByTestId("probe").every((e) => e.textContent === '{"kind":"you"}')).toBe(true);
  });
  it("the same address on two lines is asked once; a second mount inside the staleness window asks nothing", async () => {
    const item = `${HYTTA}/base/e/same`;
    const rig = installSourceName(() => ({ [item]: { statedBy: ANNA, name: "Anna Berg" } }));
    const qc = client();
    const view = render(<Wrap qc={qc}><AddedByLine item={item} own={false} /><AddedByLine item={item} own={false} /></Wrap>);
    await waitFor(() => expect(screen.getAllByTestId("added-by")).toHaveLength(2));
    expect(rig.calls).toEqual([[item]]);
    view.unmount();
    render(<Wrap qc={qc}><AddedByLine item={item} own={false} /></Wrap>);
    await waitFor(() => expect(screen.getByTestId("added-by").textContent).toBe("Added by Anna Berg"));
    expect(rig.calls).toHaveLength(1);
  });
  it("the link is the card the platform returned (statedBy), not anything built from the name", async () => {
    const item = `${HYTTA}/base/e/x`;
    installSourceName(() => ({ [item]: { statedBy: ANNA, name: "Anna Berg" } }));
    render(<Wrap qc={client()}><AddedByLine item={item} own={false} /></Wrap>);
    const link = (await screen.findByTestId("added-by-link")) as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe(ANNA);
    expect(link.getAttribute("href")).not.toMatch(/anna-berg|Anna%20Berg/i);
  });
});

describe("a whole card view: three sections, seven details of two other adders -> ONE request carrying seven addresses", () => {
  it("(adapted) Interests (3) + Skills (2) + Organization number (2); the viewer's own details are not in the request", async () => {
    const mine = [itemAt(HYTTA, "mine-1"), itemAt(HYTTA, "mine-2")];
    const sections = [
      [["i1", ANNA], ["i2", ANNA], ["i3", BO]],
      [["s1", ANNA], ["s2", BO]],
      [["o1", ANNA], ["o2", BO]],
    ] as const;
    const others = sections.flat().map(([id]) => itemAt(HYTTA, id));
    const adderOf = new Map(sections.flat().map(([id, by]) => [itemAt(HYTTA, id), by]));
    const rig = installSourceName(mapOf((a) => (adderOf.has(a) ? { statedBy: adderOf.get(a)!, name: adderOf.get(a) === ANNA ? "Anna Berg" : "Bo Hansen" } : null)));
    const Section = ({ rows }: { rows: readonly (readonly [string, string])[] }) => (
      <section>{rows.map(([id]) => <AddedByLine key={id} item={itemAt(HYTTA, id)} own={false} />)}</section>
    );
    render(
      <Wrap qc={client()}>
        <Section rows={sections[0]} />
        <Section rows={sections[1]} />
        <Section rows={sections[2]} />
        {mine.map((m) => <AddedByLine key={m} item={m} own />)}
      </Wrap>,
    );
    await waitFor(() => expect(screen.getAllByTestId("added-by-link")).toHaveLength(7));
    expect(screen.getAllByTestId("added-by").filter((e) => e.textContent === "Added by you")).toHaveLength(2);
    expect(rig.calls).toHaveLength(1);
    expect([...rig.calls[0]!].sort()).toEqual([...others].sort());
    expect(screen.getAllByTestId("added-by-link").map((e) => e.textContent).sort()).toEqual(["Anna Berg", "Anna Berg", "Anna Berg", "Anna Berg", "Bo Hansen", "Bo Hansen", "Bo Hansen"]);
  });
});
