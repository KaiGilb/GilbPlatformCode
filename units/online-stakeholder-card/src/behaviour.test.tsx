// What the card draws and does that the ported tests do not pin: the three placements, the kept queries, which vault is the holder's own,
// when "+ Add your own" is offered, what it sends to the create and the link, and its failure words.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { forgetLinkedRecords, forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { CIRCLES, M, RECORDS, VOCAB, reset } from "../test/mocks";
import { setUp, tearDown } from "../test/support";
import { ANN, BEN, LAST, OWN, TEAM, draw, fakeHost, own, side, stubPlatform, team } from "../test/world";
import { CHECK_FAILED, LINK_FAILED_REMOVED, SAVE_FAILED } from "./index";

beforeEach(() => {
  setUp();
  reset();
  stubPlatform();
});
afterEach(() => {
  vi.unstubAllGlobals();
  forgetLinkedRecords();
  forgetPageLinks();
  forgetScreenLinks();
  tearDown();
});

const press = async () => {
  await screen.findAllByTitle("Ben Larsen");
  await userEvent.click(screen.getByRole("button", { name: "Add your own card" }));
};

describe("the three placements", () => {
  it("content and full draw the card, marked with the placement", async () => {
    for (const mode of ["content", "full"] as const) {
      const r = draw(mode);
      const card = await screen.findByTestId("online-stakeholder-card");
      expect(card.getAttribute("data-placement")).toBe(mode);
      r.unmount();
    }
  });

  it("beside the Card view the pane holds the actions: a heading, 'Name · Person', and the words that nothing can be changed; no add", async () => {
    draw("actions");
    const pane = await screen.findByTestId("online-stakeholder-actions");
    expect(pane.getAttribute("data-placement")).toBe("actions");
    expect(pane.querySelector("h2")?.textContent).toBe("Actions");
    // The name arrives with their card; the kind is always said.
    await waitFor(() => expect(pane.textContent).toContain("Ben Larsen · Person"));
    expect(pane.textContent).toContain("Their online card is theirs: nothing of it can be changed here.");
    expect(screen.queryByRole("button", { name: "Add your own card" })).toBeNull();
    expect(screen.queryByTestId("online-stakeholder-card")).toBeNull();
  });

  it("the refused line is drawn in the placement it was asked for", async () => {
    draw("full", "https://cy.platform.example.test/vault");
    const line = await screen.findByTestId("online-stakeholder-refused");
    expect(line.parentElement?.getAttribute("data-placement")).toBe("full");
  });
});

describe("the person-card query", () => {
  it("is kept as the app has it: its key, and staleTime 0, gcTime 0, no retry, no refetch on window focus", async () => {
    draw();
    await screen.findByTestId("online-stakeholder-card");
    const key = ["person-card", "principal", ANN, OWN, BEN];
    const q = LAST.qc!.getQueryCache().find({ queryKey: key });
    expect(q, "the query is under the app's key").toBeTruthy();
    const o = q!.observers[0]!.options;
    expect(o.staleTime).toBe(0);
    expect(o.gcTime).toBe(0);
    expect(o.retry).toBe(false);
    expect(o.refetchOnWindowFocus).toBe(false);
  });

  it("is not asked without a session: it is off, and nothing is requested", async () => {
    const fake = fakeHost({}, { session: undefined });
    draw("content", BEN, fake);
    const q = LAST.qc!.getQueryCache().findAll({ queryKey: ["person-card"] });
    expect(q.map((x) => x.observers[0]!.options.enabled)).toEqual([false]);
    expect(q[0]!.state.fetchStatus).toBe("idle");
    expect(CIRCLES.requests).toBe(0);
  });

  it("is not asked when the holder's own vault is not known: it is off", async () => {
    const fake = fakeHost({}, { vaults: [team, side], session: { principal: ANN, vault: null } });
    draw("content", BEN, fake);
    const q = LAST.qc!.getQueryCache().findAll({ queryKey: ["person-card"] });
    expect(q.map((x) => x.observers[0]!.options.enabled)).toEqual([false]);
    expect(CIRCLES.requests).toBe(0);
  });
});

describe("which vault is the holder's own", () => {
  it("the content scope's row comes first: the card is made in it, though another vault is flagged as the landing vault", async () => {
    const fake = fakeHost({}, { contentScope: { reach: { vaultId: TEAM } } });
    // The team vault must be a vault the holder can write; it is, and its `reach` row names it.
    draw("content", BEN, fake);
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made).toEqual([{ vault: TEAM, name: "Ben Larsen" }]);
  });

  it("with no row, the vault the platform flags as the landing vault (not the first, not the last)", async () => {
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made).toEqual([{ vault: OWN, name: "Ben Larsen" }]);
  });

  it("with neither, the root of the session vault's entity", async () => {
    const fake = fakeHost({}, { vaults: [{ ...team }, { ...own, isLandingVault: false }, { ...side }], contentScope: { reach: null } });
    draw("content", BEN, fake);
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made).toEqual([{ vault: OWN, name: "Ben Larsen" }]);
  });
});

describe("when '+ Add your own' is offered", () => {
  it("not when the holder's own vault cannot be written", async () => {
    const fake = fakeHost({}, { vaults: [team, { ...own, modes: ["read"] }, side] });
    draw("content", BEN, fake);
    await screen.findAllByTitle("Ben Larsen");
    expect(screen.queryByRole("button", { name: "Add your own card" })).toBeNull();
  });

  it("not when the master gave no field sets", async () => {
    VOCAB.noFieldSets = true;
    draw();
    await screen.findAllByTitle("Ben Larsen");
    expect(screen.queryByRole("button", { name: "Add your own card" })).toBeNull();
  });

  it("the button is off while a card is being made, and on again after", async () => {
    let release!: () => void;
    M.gate = new Promise<void>((r) => (release = r));
    draw();
    await press();
    await waitFor(() => expect(screen.getByRole("button", { name: "Add your own card" })).toBeDisabled());
    release();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Add your own card" })).not.toBeDisabled());
  });
});

describe("what the create and the link are given", () => {
  it("the create: the holder's own vault, the vaults, the holder, the Person kind, their name, no boxes and no values", async () => {
    const fake = fakeHost();
    draw("content", BEN, fake);
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.createArgs).toHaveLength(1);
    const { input, deps } = M.createArgs[0]! as { input: Record<string, unknown>; deps: Record<string, unknown> };
    expect(input).toEqual({ vault: own, vaults: fake.shell.vaults, agent: ANN, kind: { name: "Person", kind: "https://ontology.example.test/base/t/Person", fields: [] }, name: "Ben Larsen", boxes: [], values: {} });
    // The picker reading, and the session's own query client.
    expect(deps.reading).toEqual({ grammar: { separator: "." } });
    expect(deps.queryClient).toBe(LAST.qc);
  });

  it("the link: ONE merge patch of the new record, carrying the person, at the record's own address", async () => {
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.patched).toEqual([{ id: "newrec", patch: { sameAs: { "@id": BEN } }, uri: `${RECORDS}newrec` }]);
  });

  it("a create that answers only an id: the address is made from the vault and the id", async () => {
    M.record = "newrec";
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.patched).toEqual([{ id: "newrec", patch: { sameAs: { "@id": BEN } }, uri: `${OWN}/e/newrec` }]);
  });

  it("after the writes: afterRecordPerson is given the session's query client and what the create answered", async () => {
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.afterArgs).toHaveLength(1);
    expect(M.afterArgs[0]!.qc).toBe(LAST.qc);
    expect(M.afterArgs[0]!.made).toMatchObject({ record: `${RECORDS}newrec`, vaultId: OWN });
  });

  it("the new card's name is the person's name from their card, trimmed", async () => {
    stubPlatform({ ben: { given: "Ben", family: "Larsen" } });
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made[0]!.name).toBe(M.made[0]!.name.trim());
    expect(M.made[0]!.name).toBe("Ben Larsen");
  });
});

describe("failures", () => {
  it("a link that cannot be made twice: both removals are made at their own address, the tag first", async () => {
    M.patchFails = 2;
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent(LINK_FAILED_REMOVED);
    expect(M.deleteArgs).toEqual([
      ["newtag", `${RECORDS}newtag`],
      ["newrec", `${RECORDS}newrec`],
    ]);
  });

  it("the record cannot be removed either: the card names the kept card, once", async () => {
    M.patchFails = 2;
    M.deleteFails = new Set(["newrec"]);
    draw();
    await press();
    const err = await screen.findByTestId("online-stakeholder-add-error");
    expect(err.textContent).toBe('The card could not be linked to their online card, and the new card "Ben Larsen" could not be removed. Remove it from Records, then try again.');
  });

  it("the lists cannot be read again after a failed link: the failure is still said and the lists are still asked for", async () => {
    M.patchFails = 2;
    M.afterFails = 1;
    const { fake } = draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent(LINK_FAILED_REMOVED);
    expect(fake.refreshed.n).toBe(1);
  });

  it("the lists cannot be read again after a made card: the error is said, the record does not open", async () => {
    M.afterFails = 1;
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent("the lists could not be read again");
    expect(M.opened).toEqual([]);
  });

  it("a create that throws an Error: its message is said", async () => {
    M.createThrows = new Error("boom");
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent("boom");
    expect(M.opened).toEqual([]);
  });

  it("a create that throws something that is not an Error: it is said as text", async () => {
    M.createThrows = "plain words";
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent("plain words");
  });

  it("the Person kind is not known: nothing is created and the card says so", async () => {
    M.noKind = true;
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent("The person kind is not known yet, so a card cannot be made now.");
    expect(M.made).toEqual([]);
    expect(M.createArgs).toEqual([]);
  });

  it("a second press after a failure clears the failure and makes the card", async () => {
    M.patchFails = 2;
    draw();
    await press();
    await screen.findByTestId("online-stakeholder-add-error");
    await userEvent.click(screen.getByRole("button", { name: "Add your own card" }));
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(screen.queryByTestId("online-stakeholder-add-error")).toBeNull();
  });

  it("the words of a failed save and of a failed check are the exported ones", async () => {
    M.partial = 1;
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent(SAVE_FAILED);
    expect(CHECK_FAILED.length).toBeGreaterThan(0);
  });
});
