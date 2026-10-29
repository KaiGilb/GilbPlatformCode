// Two gaps, measured in real Chromium:
// 1. Esc taken by the open Find must not ALSO reach the page: the phone's Detail drawer (`Overlay`) closes on any Escape that reaches the
//    document, and the card's edit mode on any Escape not prevented. No test held this (a mutant that neither stopped nor prevented it survived).
// 2. A mouse press on the Find's own words (a candidate's contact point, the search error, the foot's blank space) leaves Chromium's focus
//    on BODY, outside the foot, and Esc then does nothing while the Find stays open. jsdom does not move the focus on a press, so the press is
//    modelled as Chromium measured it: the focus leaves for the page (blur), and Esc is pressed there.
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

describe("Esc taken by the Find stays in the Find", () => {
  it("Esc in the open Find closes it and does not reach the document (the phone drawer listens there)", async () => {
    const r = rig();
    draw(r);
    const seen: boolean[] = [];
    const onDoc = (e: KeyboardEvent) => void (e.key === "Escape" && seen.push(e.defaultPrevented));
    document.addEventListener("keydown", onDoc);
    try {
      fireEvent.click(await screen.findByTestId("online-card-find-open"));
      const input = await screen.findByTestId("online-card-find-input");
      input.focus();
      fireEvent.keyDown(input, { key: "Escape" });
      await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
      expect(seen).toEqual([]);
      // with the Find closed, the next Esc is the page's
      fireEvent.keyDown(screen.getByTestId("online-card-find-open"), { key: "Escape" });
      expect(seen).toEqual([false]);
    } finally {
      document.removeEventListener("keydown", onDoc);
    }
  });
});

describe("Esc after a mouse press on the Find's own words", () => {
  it("results shown, a press on a candidate's contact point (focus to the page), then Esc: the Find closes", async () => {
    const r = rig();
    draw(r);
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    const cands = await screen.findAllByTestId("online-card-candidate");
    const words = within(cands[0]!).getAllByTestId("online-card-candidate-contact")[0]!;
    fireEvent.mouseDown(words);
    (document.activeElement as HTMLElement | null)?.blur(); // Chromium: a press on non-focusable text puts the focus on BODY (measured)
    fireEvent.click(words);
    expect(document.activeElement).toBe(document.body);
    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
  });
});
