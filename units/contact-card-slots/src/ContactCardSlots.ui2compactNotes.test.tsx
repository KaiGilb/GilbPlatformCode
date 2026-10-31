// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/components/records/ContactCardSlots.ui2compactNotes.test.tsx`. An empty My Note and Where / How we met are a compact single-line input that grows when typed into; typed text saves as before.
// Changes: the module mocks of the app's record client, vault sets, find-by-attribute, term slots, relation doors, `dpop` and adder card are replaced by the
// library's peers running over the fake platform of test/fakePlaceStore.ts (a `fetch` stub, test/support.ts), plus module mocks of `term-slots`, of the typed list
// (`listVaultRecordsPage` of `lws-vault-sets`), of the viewer's own card (`adder-card`, test/adderCardMock.ts) and, where the source mocked them, of the four
// relation doors (`lws-relations`) and of the annotations route's two functions (`contact-annotation`); the hosts are example.test hosts.
import userEvent from "@testing-library/user-event";
import * as fake from "../test/fakePlaceStore";
import { routedFetch, setUp, stubNetwork, tearDown } from "../test/support";
import { installAnnotationsRoute, resetRoute, route } from "../test/annotationsRoute";


vi.mock("@kaigilb/gilbplatformcode-term-slots", async () => {
  const f = await import("../test/fakePlaceStore");
  return { attributeSpelling: f.attributeSpelling, typeSpelling: f.typeSpelling, attributeLabel: f.attributeLabel };
});
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({
  ...(await orig<typeof import("@kaigilb/gilbplatformcode-lws-vault-sets")>()),
  listVaultRecordsPage: (await import("../test/fakePlaceStore")).listVaultRecordsPage,
}));
vi.mock("@kaigilb/gilbplatformcode-adder-card", async (orig) => (await import("../test/adderCardMock")).adderCardMock(await orig<typeof import("@kaigilb/gilbplatformcode-adder-card")>(), async () => stater.uri));

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { masterFetch } from "../test/masterFetch";
import { CardModeBar, CardModeProvider } from "@kaigilb/gilbplatformcode-card-mode";
import { CardGroup, CardTopSlots } from "@kaigilb/gilbplatformcode-card-group";
import { AddInformationButton, AddInformationSheet } from "@kaigilb/gilbplatformcode-add-information";
import { contactCardSlots } from "./ContactCardSlots";
import { growBox } from "@kaigilb/gilbplatformcode-contact-annotation";
import { __resetContactLabelVocab } from "@kaigilb/gilbplatformcode-contact-labels";
import { __resetCatalogueCache } from "@kaigilb/gilbplatformcode-contact-kind-catalogue";
import { __resetHeldNoteChains } from "@kaigilb/gilbplatformcode-held-notes";

afterEach(() => {
  cleanup();
  tearDown();
});

const stater = vi.hoisted(() => ({ uri: "" }));


const { VAULT } = fake;
const M = "https://ontology.example.test/base";
const HOLDER = "https://id.platform.example.test/base/p/kai";
let party: string;

function Card({ vaultId = VAULT, own = VAULT, typeUri = `${M}/t/Person`, canEdit = true }: { vaultId?: string; own?: string; typeUri?: string; canEdit?: boolean }) {
  const slots = contactCardSlots({ vaultId, ownVaultId: own, principal: HOLDER, recordEntityUri: party, typeUri, canEdit });
  return (
    <CardModeProvider canEdit={canEdit}>
      <CardModeBar />
      <CardTopSlots slots={slots} />
      <CardGroup kind="name" title="Name" aside={slots.nameAside} keepInEdit empty={false}>
        <p>Rita Larsen</p>
      </CardGroup>
      <AddInformationButton />
      <AddInformationSheet />
    </CardModeProvider>
  );
}
const mount = (props: Parameters<typeof Card>[0] = {}) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Card {...props} />
    </QueryClientProvider>,
  );
};
/** The record the annotations route keeps a note in: it carries `a:heldParty` like a claim, so the card's own find sees it (s9: that is the evidence the route is worth asking). */
const seedNoteRecord = (text = "x") => fake.seed("t:ContactPrivateNote", { "a:heldParty": { "@id": party }, "a:contactPrivateNote": text });

beforeEach(() => {
  setUp();
  fake.resetStore();
  __resetContactLabelVocab();
  __resetCatalogueCache();
  __resetHeldNoteChains();
  resetRoute();
  stater.uri = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Kai's vault" })}`;
  party = `${VAULT}/e/${fake.seed("t:Person", { "a:name": "Rita Larsen" })}`;
  stubNetwork();
  installAnnotationsRoute(VAULT);
});

const group = (kind: string) => document.querySelector<HTMLElement>(`section[data-group="${kind}"]`)!;

describe("C214-UI2: an empty My Note and Where / How we met are one line each", () => {
  it("on a card the holder can write, each empty one is ONE line: title, a one-row box to type in, PRIVATE; no click into Edit first", async () => {
    mount();
    const note = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    const origin = (await screen.findByTestId("connection-origin-editor")) as HTMLTextAreaElement;
    for (const [kind, box, words] of [["my-note", note, "Something only you will see…"], ["how-we-met", origin, "e.g. Madrid Conference"]] as const) {
      const g = group(kind);
      expect(g.getAttribute("data-inline")).toBe("true");
      expect(g.getAttribute("data-compact")).toBe("true");
      expect(box.getAttribute("rows")).toBe("1");
      expect(box.placeholder).toBe(words);
      // its name is the visible title, not the placeholder
      expect(box.getAttribute("aria-labelledby")).toBeTruthy();
      expect(document.getElementById(box.getAttribute("aria-labelledby")!)?.textContent).toBe(kind === "my-note" ? "My Note" : "Where / How we met");
      // title, box and PRIVATE sit in the one row of the group
      expect(within(g).getByText("Private")).toBeTruthy();
      expect(g.querySelector("header")).toBeNull();
    }
    expect(screen.queryByTestId("contact-note-text")).toBeNull();
    expect(screen.queryByTestId("connection-origin-text")).toBeNull();
    // the card is still presented (nothing turned Edit on), and nothing is saved by drawing
    expect(screen.queryByTestId("card-done")).toBeNull();
    expect(route.saves).toHaveLength(0);
  });

  it("typing into the empty box saves exactly as today (the route's write with the typed text), keeps the cursor in the box, then shows the text", async () => {
    mount();
    const box = (await screen.findByTestId("connection-origin-editor")) as HTMLTextAreaElement;
    const user = userEvent.setup();
    await user.click(box);
    await user.type(box, "Madrid Conference");
    // still the same box, still focused, still one group (it does not jump to another layout under the cursor)
    expect(screen.getByTestId("connection-origin-editor")).toBe(box);
    expect(document.activeElement).toBe(box);
    expect(group("how-we-met").getAttribute("data-compact")).toBe("true");
    await user.tab();
    await waitFor(() => expect(route.origin).toBe("Madrid Conference"));
    const last = route.saves.at(-1)!;
    expect(last.origin).toBe("Madrid Conference");
    expect(last.heldParty).toBe(party);
    expect("note" in last).toBe(false);
    // left with text in it: drawn as before (the text, a click to edit)
    expect(await screen.findByTestId("connection-origin-text")).toHaveTextContent("Madrid Conference");
    expect(group("how-we-met").getAttribute("data-inline")).toBeNull();
  });

  it("a note with text is drawn as before (not one line)", async () => {
    route.note = "Met her through Walker";
    seedNoteRecord();
    mount();
    expect(await screen.findByTestId("contact-note-text")).toHaveTextContent("Met her through Walker");
    expect(group("my-note").getAttribute("data-inline")).toBeNull();
    // the empty one next to it is still one line
    expect(group("how-we-met").getAttribute("data-inline")).toBe("true");
  });

  // C214-UI2 round 2 (Agent.Tester s133 D1, a regression from main): in Edit, clearing a filled note swapped in the compact box under the
  // cursor; focus fell to BODY and the next typed text was lost. Typing is never lost: the group keeps its shape while its box has focus.
  for (const [field, kind, seedIt] of [
    ["contact-note", "my-note", () => { route.note = "Met her through Walker"; seedNoteRecord(); }],
    ["connection-origin", "how-we-met", () => { route.origin = "Madrid Conference"; seedNoteRecord(); }],
  ] as const) {
    it(`in Edit, clearing a filled ${kind} and typing on keeps the cursor in the same box and saves what was typed`, async () => {
      seedIt();
      mount();
      const user = userEvent.setup();
      await user.click(await screen.findByTestId(`${field}-text`));
      const box = (await screen.findByTestId(`${field}-editor`)) as HTMLTextAreaElement;
      await waitFor(() => expect(document.activeElement).toBe(box));
      await user.keyboard("{Control>}a{/Control}{Backspace}");
      expect(box.value).toBe("");
      // the box is not swapped while it has focus
      expect(screen.getByTestId(`${field}-editor`)).toBe(box);
      expect(document.activeElement).toBe(box);
      expect(group(kind).getAttribute("data-compact")).toBeNull();
      await user.keyboard("XYZ");
      expect(box.value).toBe("XYZ");
      expect(document.activeElement).toBe(box);
      await user.tab();
      await waitFor(() => expect(route[field === "contact-note" ? "note" : "origin"]).toBe("XYZ"));
    });
  }

  it("in Edit, a note cleared and LEFT empty turns into the one-line box once focus has gone", async () => {
    route.note = "Met her through Walker";
    seedNoteRecord();
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("contact-note-text"));
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(box));
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(group("my-note").getAttribute("data-compact")).toBeNull();
    await user.tab();
    await waitFor(() => expect(group("my-note").getAttribute("data-compact")).toBe("true"));
  });

  it("a card the holder may NOT write still draws no empty note (no box to type in)", async () => {
    mount({ canEdit: false });
    await screen.findByText("Rita Larsen");
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("contact-note-editor")).toBeNull();
    expect(screen.queryByTestId("connection-origin-editor")).toBeNull();
  });

  it("the box grows to what it holds and shrinks back (growBox)", () => {
    const el = document.createElement("textarea");
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 96 });
    growBox(el);
    expect(el.style.height).toBe("96px");
    Object.defineProperty(el, "scrollHeight", { configurable: true, get: () => 36 });
    growBox(el);
    expect(el.style.height).toBe("36px");
  });
});

// The empty note's hint names its colour (a variable of the page), so it is never left to the browser's half-ink placeholder (3.02:1). CHANGED from the source:
// the source also resolved that variable from GilbApp's `styles/tokens.css` and measured 4.5:1 in every theme; that stylesheet is the app's, not the unit's, so
// the contrast is the host's to measure (README "Styling" names the variable) and only the contract that the hint names a variable is pinned here.
describe("the empty note's hint names its colour", () => {
  const hintToken = (box: HTMLTextAreaElement) => /placeholder:text-\[var\((--[\w-]+)\)\]/.exec(box.className)?.[1];
  const assertReadable = (token: string | undefined) => {
    expect(token, "the hint names its colour (never left to the browser's half-ink)").toBeTruthy();
    expect(token).toBe("--ink-soft");
  };

  it("the one-line empty box: My Note and Where / How we met", async () => {
    mount();
    for (const id of ["contact-note-editor", "connection-origin-editor"]) {
      const box = (await screen.findByTestId(id)) as HTMLTextAreaElement;
      expect(box.getAttribute("rows")).toBe("1");
      assertReadable(hintToken(box));
    }
  });

  it("the full box, when a note is cleared in Edit and the hint shows", async () => {
    route.note = "Met her through Walker";
    seedNoteRecord();
    mount();
    const user = userEvent.setup();
    await user.click(await screen.findByTestId("contact-note-text"));
    const box = (await screen.findByTestId("contact-note-editor")) as HTMLTextAreaElement;
    await waitFor(() => expect(document.activeElement).toBe(box));
    await user.keyboard("{Control>}a{/Control}{Backspace}");
    expect(group("my-note").getAttribute("data-compact")).toBeNull();
    assertReadable(hintToken(box));
  });
});
