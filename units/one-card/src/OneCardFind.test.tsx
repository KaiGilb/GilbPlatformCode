// The foot of the one card with no online card: the Find and connect, over the REAL controller and a fake platform.
// What each test pins: nothing is read before a search, Find shows who before it writes, Connect writes the link alone, a reader gets no Find.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createOnlineCardController, type ControllerDeps } from "@kaigilb/gilbplatformcode-online-card";
import { readLink, type LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import { NoOnlineCardFoot } from "./OneCardFind";
import { ConnectedMarker } from "./ConnectedMarker";
import { useOnlineCardState } from "./useOnlineCardState";
import type { OnlineCardController } from "@kaigilb/gilbplatformcode-online-card";

afterEach(cleanup);

const RECORD = "https://holder.example.test/vault/e/rec1";
const HOLDER = "https://holder.example.test/vault";
const KARI = "https://ann.example.test/vault";
const NAMESAKE = "https://ann2.example.test/vault";

interface Rig {
  deps: ControllerDeps;
  http: string[];
  link: unknown[];
  /** Every request that was not a GET: the card may write nothing to any vault. */
  nonGet: string[];
}

const annCard = {
  principal: KARI,
  fields: [
    { principal: KARI, field: "a:givenName", value: "Ann", sourceEntity: `${KARI}/e/gn`, claimVaultId: KARI, rung: "public" },
    { principal: KARI, field: "a:email", value: "ann@example.org", sourceEntity: `${KARI}/e/em`, claimVaultId: KARI, rung: "public", kind: "email" },
    { principal: KARI, field: "a:phone", value: "+47 1", sourceEntity: `${KARI}/e/ph`, claimVaultId: KARI, rung: "t:SignedInGrantee", kind: "phone" },
  ],
  skills: [],
};

function rig(opts: { link?: LinkReading; canWrite?: boolean; resolve?: { status: number; body: unknown } } = {}): Rig {
  const r: Rig = { deps: undefined as never, http: [], link: [], nonGet: [] };
  const resolve = opts.resolve ?? { status: 200, body: { kind: "person", principal: KARI, entity: KARI } };
  r.deps = {
    platform: {
      origin: "https://id.example.test",
      fetch: async (url, init) => {
        const u = new URL(url);
        if (init?.method && init.method !== "GET") r.nonGet.push(`${init.method} ${u.pathname}`);
        r.http.push(`${u.pathname}${u.search}`);
        if (u.pathname === "/base/connect/online-card-anchor") return new Response(JSON.stringify(resolve.body), { status: resolve.status });
        if (u.pathname === "/base/connect/public-card") {
          const who = u.searchParams.get("principal");
          if (who === NAMESAKE)
            return new Response(JSON.stringify({ principal: NAMESAKE, fields: [
              { principal: NAMESAKE, field: "a:givenName", value: "Ann", sourceEntity: "n1", claimVaultId: NAMESAKE, rung: "public" },
              { principal: NAMESAKE, field: "a:familyName", value: "Ben", sourceEntity: "n2", claimVaultId: NAMESAKE, rung: "public" },
            ], skills: [] }), { status: 200 });
          return new Response(JSON.stringify(annCard), { status: 200 });
        }
        if (u.pathname === "/base/connect/find-by-name")
          return new Response(
            JSON.stringify({ total: 2, connectVaultId: "x", matches: [
              { principal: KARI, field: "a:givenName", value: "Ann", sourceEntity: "e1", claimVaultId: KARI, rung: "public" },
              { principal: NAMESAKE, field: "a:givenName", value: "Ann", sourceEntity: "e2", claimVaultId: NAMESAKE, rung: "public" },
            ] }),
            { status: 200 },
          );
        return new Response("{}", { status: 404 });
      },
    },
    subject: { uri: RECORD, holder: HOLDER, link: opts.link ?? { state: "none" } },
    canWrite: opts.canWrite ?? true,
    writeLink: async (w) => void r.link.push(w),
  };
  return r;
}

function Foot({ controller, searchName, canWrite }: { controller: OnlineCardController; searchName: string; canWrite: boolean }) {
  const state = useOnlineCardState(controller);
  if (!state) return null;
  return (
    <>
      <span data-testid="link-state">{state.link.state}</span>
      <NoOnlineCardFoot controller={controller} state={state} searchName={searchName} canWrite={canWrite} />
    </>
  );
}

const draw = (r: Rig, over: Partial<{ canWrite: boolean; searchName: string }> = {}) => {
  const controller = createOnlineCardController(r.deps);
  const ui = render(<Foot controller={controller} searchName={over.searchName ?? "Ann N"} canWrite={over.canWrite ?? true} />);
  return { controller, ui };
};

describe("the foot of a card with no online card", () => {
  it("says it is your card only, offers the existing Find, and asks the platform nothing", async () => {
    const r = rig();
    draw(r, { searchName: "Ann Nordmann" });
    const foot = await screen.findByTestId("one-card-find-foot");
    expect(foot.textContent).toContain("This is your card of Ann. Only you see it. No online card is connected.");
    expect(within(foot).getByTestId("online-card-find-open")).toHaveTextContent("Find their online card");
    expect(r.http).toEqual([]);
  });
  it("a card with no name says 'your card', with no name in it", async () => {
    draw(rig(), { searchName: "  " });
    expect((await screen.findByTestId("one-card-find-foot")).textContent).toContain("This is your card. Only you see it.");
  });
  it("two links: says no online card is chosen", async () => {
    draw(rig({ link: { state: "ambiguous" } }));
    expect((await screen.findByTestId("one-card-find-foot")).textContent).toContain("more than one link, so no online card is chosen");
  });
  it("a reader is offered no way to find or connect (the act is the holder's), and is not told it is her card", async () => {
    const r = rig({ canWrite: false });
    draw(r, { canWrite: false });
    expect((await screen.findByTestId("one-card-find-foot")).textContent?.trim()).toBe("No online card is connected.");
    expect(screen.queryByTestId("online-card-find-open")).toBeNull();
    expect(r.http).toEqual([]);
  });
});

describe("Find and connect", () => {
  it("opens with the local name filled in, shows name and contact points of each person, and writes nothing until a Connect", async () => {
    const r = rig();
    draw(r, { searchName: "Ann N" });
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    expect((screen.getByTestId("online-card-find-input") as HTMLInputElement).value).toBe("Ann N");
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate");
    expect(cands.length).toBe(2);
    expect(within(cands[0]!).getByText("Ann")).toBeTruthy();
    expect(within(cands[0]!).getByText("ann@example.org")).toBeTruthy();
    expect(within(cands[1]!).getByText("Ann Ben")).toBeTruthy();
    expect(within(cands[1]!).getByText(/publish no contact point to you/)).toBeTruthy();
    expect(r.link).toEqual([]);
    expect(r.nonGet).toEqual([]);
  });
  it("a search cut at five says 'Showing 5 of 9' and warns the person may not be listed; an uncut search says nothing of the kind", async () => {
    const r = rig();
    const inner = r.deps.platform.fetch;
    const nine = Array.from({ length: 9 }, (_, i) => `https://p${i}.example.test/vault`);
    r.deps.platform = { ...r.deps.platform, fetch: async (url, init) => (new URL(url).pathname === "/base/connect/find-by-name" ? new Response(JSON.stringify({ total: 9, matches: nine.map((p) => ({ principal: p, field: "a:givenName", value: "Ann" })) }), { status: 200 }) : inner(url, init)) };
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    expect((await screen.findAllByTestId("online-card-candidate")).length).toBe(5);
    expect(screen.getByTestId("online-card-find-cut")).toHaveTextContent("Showing 5 of 9");
    cleanup();
    const r2 = rig();
    draw(r2);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    expect((await screen.findAllByTestId("online-card-candidate")).length).toBe(2);
    expect(screen.queryByTestId("online-card-find-cut")).toBeNull();
  });
  it("Connect writes the link alone (a:sameAs, a reference), then reads the online card once; the link is now 'linked'", async () => {
    const r = rig();
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate");
    fireEvent.click(within(cands.find((c) => c.getAttribute("data-principal") === KARI)!).getByTestId("online-card-connect"));
    await waitFor(() => expect(r.link).toEqual([{ record: RECORD, patch: { sameAs: { "@id": KARI } } }]));
    await waitFor(() => expect(screen.getByTestId("link-state")).toHaveTextContent("linked"));
    await waitFor(() => expect(r.http.filter((h) => h.startsWith("/base/connect/online-card-anchor")).length).toBe(1));
    expect(r.nonGet).toEqual([]);
  });
  it("Cancel closes the search and writes nothing", async () => {
    const r = rig();
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-cancel"));
    expect(screen.getByTestId("online-card-find-open")).toBeTruthy();
    expect(r.link).toEqual([]);
  });
  it("Cancel closes the search and puts the focus back on 'Find their online card'", async () => {
    draw(rig());
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-cancel"));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("online-card-find-open")));
  });
  it("Esc closes the search, writes nothing, and puts the focus back on 'Find their online card'", async () => {
    const r = rig();
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.keyDown(screen.getByTestId("online-card-find-input"), { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("online-card-find-open")));
    expect(r.link).toEqual([]);
  });
  it("a Search pressed with the mouse keeps the focus in the Find while 'Searching…', so Esc still closes it; one search only", async () => {
    // Real Chromium moved the focus to BODY when the pressed Search button became `disabled` during "Searching…", and the panel's Esc
    // handler never heard the key (resume walk, rig :33681). The button must stay focusable (aria-disabled) and ignore a second press.
    const r = rig();
    const inner = r.deps.platform.fetch;
    let release: () => void = () => {};
    const held = new Promise<void>((res) => (release = res));
    r.deps.platform = {
      ...r.deps.platform,
      fetch: async (url, init) => {
        if (new URL(url).pathname === "/base/connect/find-by-name") await held;
        return inner(url, init);
      },
    };
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    const submit = screen.getByTestId("online-card-find-submit");
    submit.focus();
    fireEvent.click(submit);
    await waitFor(() => expect(submit).toHaveTextContent("Searching…"));
    expect(submit).not.toBeDisabled();
    expect(submit).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(submit);
    fireEvent.click(submit);
    release();
    await screen.findAllByTestId("online-card-candidate");
    expect(r.http.filter((h) => h.startsWith("/base/connect/find-by-name")).length).toBe(1);
    expect(screen.getByTestId("online-card-find").contains(document.activeElement)).toBe(true);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("online-card-find-open")));
    expect(r.link).toEqual([]);
  });
  it("says that connecting grants nobody anything", async () => {
    draw(rig());
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    expect(screen.getByText(/grants nobody anything/)).toBeTruthy();
  });
});

describe("the list marker", () => {
  it("draws only for a link the row already read, with no request", () => {
    const { rerender } = render(<ConnectedMarker connected={false} />);
    expect(screen.queryByTestId("connected-marker")).toBeNull();
    rerender(<ConnectedMarker connected />);
    expect(screen.getByTestId("connected-marker")).toHaveTextContent("Connected");
    expect(readLink({ sameAs: { "@id": KARI } }).state).toBe("linked");
  });
});
