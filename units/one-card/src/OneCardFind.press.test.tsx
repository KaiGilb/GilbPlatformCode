/**
 * Esc closes the open Find after a mouse press anywhere in it.
 *
 * Measured in real Chromium: a press on text that cannot take the focus moves the focus to the nearest focusable
 * ancestor, or to the page when there is none. jsdom does not move the focus on a press, so `pressLikeChromium` does that walk itself.
 * With the foot focusable while the Find is open, every press in the Find keeps the focus in the foot, where Esc is heard.
 */
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

function rig(opts: { link?: LinkReading; canWrite?: boolean; resolve?: { status: number; body: unknown }; findFails?: boolean } = {}): Rig {
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
        if (u.pathname === "/base/connect/find-by-name" && opts.findFails) return new Response("{}", { status: 500 });
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


/** Chromium's press: focus the nearest focusable ancestor of the pressed element, else the page. Returns the focused element. */
function pressLikeChromium(el: Element): Element | null {
  fireEvent.mouseDown(el);
  let n: Element | null = el;
  while (n && !(n instanceof HTMLElement && (n.hasAttribute("tabindex") || n.matches("button:not([disabled]), input, a[href]")))) n = n.parentElement;
  if (n instanceof HTMLElement) n.focus();
  else (document.activeElement as HTMLElement | null)?.blur();
  fireEvent.mouseUp(el);
  fireEvent.click(el);
  return document.activeElement;
}

/** Records every Escape that reaches the document, and whether it was prevented. */
function watchDocEsc() {
  const seen: boolean[] = [];
  const on = (e: KeyboardEvent) => void (e.key === "Escape" && seen.push(e.defaultPrevented));
  document.addEventListener("keydown", on);
  return { seen, stop: () => document.removeEventListener("keydown", on) };
}

/** Press `el`, check the focus stayed in the foot, then Esc where the focus is: the Find closes, the key stays in the Find. */
async function pressThenEsc(el: Element) {
  const foot = screen.getByTestId("one-card-find-foot");
  const at = pressLikeChromium(el);
  expect(at).not.toBe(document.body);
  expect(foot.contains(at)).toBe(true);
  const doc = watchDocEsc();
  try {
    fireEvent.keyDown(at!, { key: "Escape" });
    await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
    expect(doc.seen).toEqual([]);
    expect(document.activeElement).toBe(screen.getByTestId("online-card-find-open"));
  } finally {
    doc.stop();
  }
}

async function openWithResults() {
  fireEvent.click(await screen.findByTestId("online-card-find-open"));
  fireEvent.click(screen.getByTestId("online-card-find-submit"));
  return screen.findAllByTestId("online-card-candidate");
}

// Esc closes the Find in every state.
describe("a press anywhere in the open Find keeps the focus there, so Esc closes it", () => {
  it("a press on the Find's own words (the platform's words under the list)", async () => {
    draw(rig());
    await openWithResults();
    await pressThenEsc(within(screen.getByTestId("online-card-find")).getByText(/Check who it is/));
  });

  it("a press on a candidate's contact point", async () => {
    draw(rig());
    const cands = await openWithResults();
    await pressThenEsc(within(cands[0]!).getAllByTestId("online-card-candidate-contact")[0]!);
  });

  it("a press on the search-error words", async () => {
    draw(rig({ findFails: true }));
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    fireEvent.click(screen.getByTestId("online-card-find-submit"));
    await pressThenEsc(await screen.findByTestId("online-card-find-error"));
  });

  it("a press on blank space in the foot", async () => {
    draw(rig());
    await openWithResults();
    await pressThenEsc(screen.getByTestId("one-card-find-foot"));
  });

  it("the foot is out of the Tab order while open (tabIndex -1), and plain again when closed", async () => {
    draw(rig());
    const foot = await screen.findByTestId("one-card-find-foot");
    expect(foot.hasAttribute("tabindex")).toBe(false);
    fireEvent.click(screen.getByTestId("online-card-find-open"));
    expect(foot.getAttribute("tabindex")).toBe("-1");
    fireEvent.click(screen.getByTestId("online-card-find-cancel"));
    expect(foot.hasAttribute("tabindex")).toBe(false);
  });
});

describe("what the Find must not take", () => {
  it("with the Find closed, a press on the foot's words leaves the focus on the page and Esc there is not taken", async () => {
    draw(rig());
    await screen.findByTestId("online-card-find-open");
    const at = pressLikeChromium(screen.getByTestId("one-card-find-foot").querySelector("p")!);
    expect(at).toBe(document.body);
    const doc = watchDocEsc();
    try {
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(doc.seen).toEqual([false]);
    } finally {
      doc.stop();
    }
  });

  it("open Find, focus on the page, but a dialog is open over the card (the palette): Esc is the dialog's, the Find stays open", async () => {
    draw(rig());
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    const dialog = document.createElement("div");
    dialog.setAttribute("role", "dialog");
    dialog.setAttribute("aria-modal", "true");
    document.body.appendChild(dialog);
    const doc = watchDocEsc();
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document.body, { key: "Escape" });
      expect(doc.seen).toEqual([false]);
      expect(screen.getByTestId("online-card-find")).toBeTruthy();
    } finally {
      doc.stop();
      dialog.remove();
    }
  });

  it("a closed dialog that stays in the page (the section menu's panel: inert, aria-hidden) does not stop Esc on the page closing the Find", async () => {
    draw(rig());
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    const closed = document.createElement("div");
    closed.setAttribute("role", "dialog");
    closed.setAttribute("aria-modal", "true");
    closed.setAttribute("aria-hidden", "true");
    closed.setAttribute("inert", "");
    document.body.appendChild(closed);
    const doc = watchDocEsc();
    try {
      (document.activeElement as HTMLElement | null)?.blur();
      fireEvent.keyDown(document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
      expect(doc.seen).toEqual([]);
    } finally {
      doc.stop();
      closed.remove();
    }
  });

  it("open Find, focus on the page: Esc closes it, is prevented and does not reach the document; typing keys are not taken", async () => {
    draw(rig());
    fireEvent.click(await screen.findByTestId("online-card-find-open"));
    (document.activeElement as HTMLElement | null)?.blur();
    const doc = watchDocEsc();
    const keys: string[] = [];
    const onKey = (e: KeyboardEvent) => void (!e.defaultPrevented && keys.push(e.key));
    document.addEventListener("keydown", onKey);
    try {
      for (const key of ["a", " ", "ArrowDown", "Tab", "k"]) fireEvent.keyDown(document.body, { key });
      fireEvent.keyDown(document.body, { key: "k", metaKey: true });
      expect(keys).toEqual(["a", " ", "ArrowDown", "Tab", "k", "k"]);
      expect(screen.getByTestId("online-card-find")).toBeTruthy();
      fireEvent.keyDown(document.body, { key: "Escape" });
      await waitFor(() => expect(screen.queryByTestId("online-card-find")).toBeNull());
      expect(doc.seen).toEqual([]);
    } finally {
      doc.stop();
      document.removeEventListener("keydown", onKey);
    }
  });
});
