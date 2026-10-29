// Esc must close the Find in the two states real Chromium left it dead: while "Connecting…" after a mouse press (the Connect button becomes
// `disabled` and Chromium drops the focus to BODY), and after a failed Connect (the focus moves to the foot's alert, which sits outside
// the panel's Esc handler). Esc is heard by the foot that holds the whole Find, so the cases below walk every remaining busy and error
// state of the Find, each through the real NoOnlineCardFoot and the real controller.
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { createOnlineCardController, type ControllerDeps } from "@kaigilb/gilbplatformcode-online-card";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";
import { NoOnlineCardFoot } from "./OneCardFind";
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

describe("Esc after or during a Connect", () => {
  it("after a failed Connect (the focus on the foot's alert), Esc closes the Find and puts the focus back on 'Find their online card'", async () => {
    const r = rig();
    r.deps.writeLink = async () => {
      throw new Error("tester 500");
    };
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate");
    fireEvent.click(within(cands[0]!).getByTestId("online-card-connect"));
    const alert = await screen.findByTestId("one-card-find-error");
    await waitFor(() => expect(document.activeElement).toBe(alert));
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("online-card-find-open")));
  });
  it("while 'Connecting…' the pressed Connect stays focusable (not `disabled`), so Esc is still heard; one write only", async () => {
    const r = rig();
    let release: () => void = () => {};
    const held = new Promise<void>((res) => (release = res));
    r.deps.writeLink = async (w) => {
      await held;
      r.link.push(w);
    };
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate");
    const connect = within(cands[0]!).getByTestId("online-card-connect");
    connect.focus();
    fireEvent.click(connect);
    await waitFor(() => expect(connect).toHaveTextContent("Connecting…"));
    expect(connect).not.toBeDisabled();
    fireEvent.click(connect);
    release();
    await waitFor(() => expect(r.link.length).toBe(1));
  });
});

/** Open the Find and search, giving the candidates. */
async function openAndSearch() {
  fireEvent.click(await screen.findByTestId("online-card-find-open"));
  fireEvent.click(screen.getByTestId("online-card-find-submit"));
  return screen.findAllByTestId("online-card-candidate");
}

/** Esc pressed where the focus is closes the Find, and the focus goes back on "Find their online card". */
async function escCloses() {
  fireEvent.keyDown(document.activeElement ?? document.body, { key: "Escape" });
  await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
  await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("online-card-find-open")));
}

describe("Esc closes the Find in every busy and error state (the foot holds the Esc)", () => {
  it("while 'Connecting…' (the focus on the pressed, aria-disabled Connect), Esc closes the Find; the write is the controller's, sent once", async () => {
    const r = rig();
    let release: () => void = () => {};
    const held = new Promise<void>((res) => (release = res));
    r.deps.writeLink = async (w) => {
      await held;
      r.link.push(w);
    };
    draw(r);
    const connect = within((await openAndSearch())[0]!).getByTestId("online-card-connect");
    connect.focus();
    fireEvent.click(connect);
    await waitFor(() => expect(connect).toHaveTextContent("Connecting…"));
    expect(connect).toHaveAttribute("aria-disabled", "true");
    expect(document.activeElement).toBe(connect);
    await escCloses();
    release();
    await waitFor(() => expect(r.link.length).toBe(1));
  });

  it("while 'Connecting…', every Connect in the list is aria-disabled, not `disabled`, and a press on another sends no second write", async () => {
    const r = rig();
    let release: () => void = () => {};
    const held = new Promise<void>((res) => (release = res));
    r.deps.writeLink = async (w) => {
      await held;
      r.link.push(w);
    };
    draw(r);
    const cands = await openAndSearch();
    expect(cands.length).toBe(2);
    fireEvent.click(within(cands[0]!).getByTestId("online-card-connect"));
    const other = within(cands[1]!).getByTestId("online-card-connect");
    await waitFor(() => expect(other).toHaveAttribute("aria-disabled", "true"));
    expect(other).not.toBeDisabled();
    fireEvent.click(other);
    release();
    await waitFor(() => expect(r.link.length).toBe(1));
  });

  it("after a failed Connect, Esc from the Connect button (the focus moved back into the list) still closes the Find", async () => {
    const r = rig();
    r.deps.writeLink = async () => {
      throw new Error("coder 429");
    };
    draw(r);
    const connect = within((await openAndSearch())[0]!).getByTestId("online-card-connect");
    fireEvent.click(connect);
    await screen.findByTestId("one-card-find-error");
    await waitFor(() => expect(connect).not.toHaveAttribute("aria-disabled"));
    connect.focus();
    await escCloses();
  });

  it("after a failed search (the find's own error), Esc closes the Find", async () => {
    const r = rig();
    const inner = r.deps.platform.fetch;
    r.deps.platform = {
      ...r.deps.platform,
      fetch: async (url, init) => (new URL(url).pathname === "/base/connect/find-by-name" ? new Response("{}", { status: 500 }) : inner(url, init)),
    };
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    const submit = screen.getByTestId("online-card-find-submit");
    submit.focus();
    fireEvent.click(submit);
    await screen.findByTestId("online-card-find-error");
    await escCloses();
    expect(r.nonGet).toEqual([]);
  });

  it("after a search that finds no one, Esc closes the Find", async () => {
    const r = rig();
    const inner = r.deps.platform.fetch;
    r.deps.platform = {
      ...r.deps.platform,
      fetch: async (url, init) =>
        new URL(url).pathname === "/base/connect/find-by-name" ? new Response(JSON.stringify({ total: 0, connectVaultId: "x", matches: [] }), { status: 200 }) : inner(url, init),
    };
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    const submit = screen.getByTestId("online-card-find-submit");
    submit.focus();
    fireEvent.click(submit);
    await screen.findByTestId("online-card-find-empty");
    await escCloses();
  });

  it("with the Find closed, Esc in the foot is not taken: it goes on to the card (not prevented)", async () => {
    const r = rig();
    draw(r);
    const open = await screen.findByTestId("online-card-find-open");
    open.focus();
    const ev = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true });
    open.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(false);
  });
});
