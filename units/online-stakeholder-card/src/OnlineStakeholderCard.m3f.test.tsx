/**
 * An online stakeholder with no local record, opened from the Stakeholders grid: their card, read only, in the same pane (the contact header
 * with the holder's vault on the left joined to the person on the right, their photo and the chain-link badge; the one card's body with their
 * rows marked "Theirs").
 *
 *   - opening writes nothing;
 *   - "Add your own" makes ONE local record of the person in the holder's own vault through `recordPerson`, links it to the person through the
 *     card's own link door (`a:sameAs`, `patchRecord`), and opens it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { recordPerson } from "@kaigilb/gilbplatformcode-person-create";
import { connectionsKey } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import {
  forgetDeletedLinkedRecord,
  forgetLinkedFinds,
  forgetLinkedRecords,
  forgetPageLinks,
  forgetScreenLinks,
  isDeletedLinkedRecord,
  notePageLinks,
  setScreenLinks,
} from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { CIRCLES, FIND, M, reset } from "../test/mocks";
import { setUp, tearDown } from "../test/support";
import { ANN, BEN, FOREIGN, LAST, OWN, STRANGER, draw, sent, stubPlatform } from "../test/world";

beforeEach(() => {
  setUp();
  reset();
  stubPlatform();
});
afterEach(() => {
  vi.unstubAllGlobals();
  // Each test is a new page: the session's kept find answers and page links start empty.
  forgetLinkedRecords();
  forgetPageLinks();
  forgetScreenLinks();
  tearDown();
});

const addButton = () => screen.getByRole("button", { name: "Add your own card" });
async function press() {
  await screen.findAllByTitle("Ben Larsen");
  await userEvent.click(addButton());
}

describe("an online stakeholder's card (no local record)", () => {
  it("their card in today's header and body: their name, the chain-link badge, their rows marked Theirs; nothing written on open", async () => {
    draw();
    // The card shows once the session's circles say the person is in them.
    expect(await screen.findByTestId("online-stakeholder-card")).toBeInTheDocument();
    // The header draws the name in its own layout (one word per line where narrow), named whole by its title.
    expect((await screen.findAllByTitle("Ben Larsen")).length).toBeGreaterThan(0);
    expect(screen.getByTestId("contact-card-link-note")).toBeInTheDocument();
    expect(await screen.findByText("ben@example.test")).toBeInTheDocument();
    // Nothing written: every request is a read.
    expect(sent.filter((s) => !s.startsWith("GET "))).toEqual([]);
  });

  it("'Add your own' makes ONE local record in the holder's own vault (the create), links it to the person, and opens it", async () => {
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made).toEqual([{ vault: OWN, name: "Ben Larsen" }]);
    expect(JSON.stringify(M.patched)).toContain(BEN);
    expect(JSON.stringify(M.patched)).toContain("sameAs");
  });
});

// ── "+ Add your own" never makes a second local record of a person already held ───────────────
describe("'+ Add your own' on a person the holder already holds a linked record of", () => {
  afterEach(() => forgetPageLinks());
  it("a loaded record already links the person: it is opened, and nothing is created or written", async () => {
    // "Loaded" is this holder's screen now (setScreenLinks, as the records grid sets it), not every link the page ever read.
    setScreenLinks(ANN, new Map([[BEN, "ada1"]]));
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["ada1"]));
    expect(M.made).toEqual([]);
    expect(M.patched).toEqual([]);
  });
  it("none loaded, but the store's find names one (any held vault): it is opened, and nothing is created", async () => {
    FIND.ids = ["https://team.platform.example.test/vault/e/bo9"];
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["bo9"]));
    expect(M.made).toEqual([]);
    FIND.ids = [];
  });
});

describe("a check that cannot be made makes nothing", () => {
  it("the store's find fails: nothing is created or written, and the card says so", async () => {
    FIND.fail = true;
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent("could not be checked");
    expect(M.made).toEqual([]);
    expect(M.patched).toEqual([]);
    FIND.fail = false;
  });
});

// ── The check looks only at THIS holder's records, as they are NOW ───────────────────
// After a sign-out and another holder's sign-in in the same tab, "+ Add your own" opened the first holder's record; after a delete it opened the
// deleted record. The check now asks only the records the signed-in holder's grid holds now (kept per holder, replaced on every change, cleared on
// sign-out), never a deleted one, and otherwise the per-holder find.
describe("'+ Add your own' never opens another holder's or a deleted record", () => {
  it("another holder's screen links (a sign-out and sign-in in the same tab): not opened; this holder's own record is made", async () => {
    notePageLinks([{ id: "kkrec", entityUri: "https://other.platform.example.test/vault/e/kkrec", typeUri: "t:Person", updatedAt: 0, body: { sameAs: { "@id": BEN } } } as never]);
    setScreenLinks("https://other.platform.example.test/vault", new Map([[BEN, "kkrec"]]));
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made).toEqual([{ vault: OWN, name: "Ben Larsen" }]);
  });

  it("this holder's screen linked a record that was then deleted: the deleted record is not opened", async () => {
    setScreenLinks(ANN, new Map([[BEN, "delrec"]]));
    forgetDeletedLinkedRecord("delrec");
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.opened).not.toContain("delrec");
  });

  it("this holder's screen links a live record of the person: it is opened, and nothing is made", async () => {
    setScreenLinks(ANN, new Map([[BEN, "liverec"]]));
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["liverec"]));
    expect(M.made).toEqual([]);
  });
});

// ── Atomic, once, and only for a person in the holder's circles ──────────────────────────────────────────────────
describe("'+ Add your own' is atomic, once, and only for a person in the holder's circles", () => {
  it("the link write fails twice: the new record is removed, nothing unlinked stays, and the card says so", async () => {
    M.patchFails = 2;
    draw();
    await press();
    expect(await screen.findByTestId("online-stakeholder-add-error")).toHaveTextContent(/could not be linked/i);
    // The record AND its tag are removed, so "Nothing was kept" is true and the same name can be saved.
    expect(M.deleted).toEqual(["newtag", "newrec"]); // newest first (the tag, then the record)
    expect(screen.getByTestId("online-stakeholder-add-error")).toHaveTextContent(/Nothing was kept/);
    expect(M.opened).toEqual([]);
  });

  it("the tag cannot be removed: the card does not say 'Nothing was kept'; it names what is left", async () => {
    M.patchFails = 2;
    M.deleteFails = new Set(["newtag"]);
    draw();
    await press();
    const err = await screen.findByTestId("online-stakeholder-add-error");
    expect(err).not.toHaveTextContent(/Nothing was kept/);
    expect(err).toHaveTextContent(/name "Ben Larsen" is still taken/);
  });

  it("the link write fails once: it is tried again, and the linked record opens", async () => {
    M.patchFails = 1;
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.deleted).toEqual([]);
    expect(JSON.stringify(M.patched)).toContain("sameAs");
  });

  it("the create is made ONCE and sends no tag (the platform makes the record's tag)", async () => {
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.tags).toEqual([null]);
    expect(M.made).toHaveLength(1);
  });

  it("two presses in the same task make ONE record", async () => {
    let release!: () => void;
    M.gate = new Promise<void>((r) => (release = r));
    draw();
    await screen.findAllByTitle("Ben Larsen");
    const btn = addButton();
    act(() => {
      btn.click();
      btn.click();
    });
    release();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.made).toHaveLength(1);
  });

  it("a person NOT in the holder's circles: no card and no '+ Add your own'", async () => {
    draw("content", STRANGER);
    // The refused line is said once the circles have answered; nothing else is drawn.
    await screen.findByTestId("online-stakeholder-refused");
    expect(screen.queryByTestId("online-stakeholder-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add your own card" })).toBeNull();
  });

  it("the holder herself: no card", async () => {
    draw("content", ANN);
    await screen.findByTestId("online-stakeholder-refused");
    expect(screen.queryByTestId("online-stakeholder-card")).toBeNull();
  });

  it("a refused ?ons= reads NOTHING about that person (0 public-card reads), for a stranger and for a foreign address", async () => {
    for (const who of [STRANGER, FOREIGN]) {
      sent.length = 0;
      const r = draw("content", who);
      await screen.findByTestId("online-stakeholder-refused");
      expect(sent.filter((x) => x.includes("public-card"))).toEqual([]);
      r.unmount();
    }
  });

  it("?ons= naming the holder herself reads NOTHING (not even her own public card), also when she placed herself in a circle", async () => {
    for (const alsoSelf of [false, true]) {
      CIRCLES.alsoSelf = alsoSelf;
      sent.length = 0;
      const r = draw("content", ANN);
      await screen.findByTestId("online-stakeholder-refused");
      expect(sent.filter((x) => x.includes("public-card"))).toEqual([]);
      r.unmount();
    }
    CIRCLES.alsoSelf = false;
  });

  it("while the circles answer is read again, no refused line is said (it comes back with the answer)", async () => {
    draw("content", STRANGER);
    await screen.findByTestId("online-stakeholder-refused");
    let release!: () => void;
    CIRCLES.hold = new Promise<void>((r) => (release = r));
    try {
      await act(async () => {
        LAST.qc!.removeQueries({ queryKey: connectionsKey(ANN, OWN) });
        void LAST.qc!.invalidateQueries({ queryKey: ["person-card"] });
      });
      await waitFor(() => expect(screen.queryByTestId("online-stakeholder-refused")).toBeNull());
      release();
      expect(await screen.findByTestId("online-stakeholder-refused")).toBeTruthy();
    } finally {
      CIRCLES.hold = null;
    }
  });

  it("the refused line is said only once the circles have answered (not before)", async () => {
    let release!: () => void;
    CIRCLES.hold = new Promise<void>((r) => (release = r));
    try {
      draw("content", STRANGER);
      // The circles read is out and held: the card has been asked, and has nothing to say yet.
      await waitFor(() => expect(CIRCLES.requests).toBe(1));
      await act(async () => {});
      expect(screen.queryByTestId("online-stakeholder-refused")).toBeNull();
      release();
      expect(await screen.findByTestId("online-stakeholder-refused")).toBeTruthy();
    } finally {
      CIRCLES.hold = null;
    }
  });

  it("a refused ?ons= (not in the holder's circles) shows ONE plain line, not a blank pane, and no add", async () => {
    draw("content", STRANGER);
    expect(await screen.findByTestId("online-stakeholder-refused")).toHaveTextContent("This person is not one of your stakeholders.");
    expect(screen.queryByTestId("online-stakeholder-card")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add your own card" })).toBeNull();
  });
});

describe("after a record is made", () => {
  it("the list is drawn again and the kept link answers are forgotten", async () => {
    vi.mocked(forgetLinkedFinds).mockClear();
    const { fake } = draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(fake.refreshed.n).toBeGreaterThan(0);
    expect(vi.mocked(forgetLinkedFinds)).toHaveBeenCalled();
  });
});

// ── The name form, the newest record, deleted ids, and two tabs at once ──────────────────────────────────────────────────────
describe("the newest record, deleted ids, and a platform that makes no tags", () => {
  it("on a cold deep link the find names two linked records: the NEWEST (the person's row) is opened", async () => {
    FIND.ids = ["https://team.platform.example.test/vault/e/06aaaaaaaaaaaaaaaaaaaaaaaa", "https://team.platform.example.test/vault/e/06zzzzzzzzzzzzzzzzzzzzzzzz"];
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["06zzzzzzzzzzzzzzzzzzzzzzzz"]));
    FIND.ids = [];
  });

  it("making a record keeps the session's deleted ids (a deleted record is still never opened afterwards)", async () => {
    forgetDeletedLinkedRecord("gone1");
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(isDeletedLinkedRecord("gone1")).toBe(true);
  });

  it("a platform that makes no tags: the record is KEPT with no tag, linked and opened; nothing is deleted and no error is said", async () => {
    // `recordPerson` answers a created record with no tag (the platform has no tag routes).
    const real = vi.mocked(recordPerson).getMockImplementation()!;
    vi.mocked(recordPerson).mockImplementationOnce((async (_host: unknown, _deps: unknown, input: { vault: { vaultId: string }; name: string }) => {
      M.made.push({ vault: input.vault.vaultId, name: input.name });
      return { created: true, record: "https://ann.platform.example.test/vault/e/newrec", vaultId: input.vault.vaultId, tag: null, tagHandle: null, held: [] };
    }) as never);
    try {
      draw();
      await press();
      await waitFor(() => expect(M.opened).toEqual(["newrec"]));
      expect(M.deleted).toEqual([]);
      expect(screen.queryByTestId("online-stakeholder-add-error")).toBeNull();
    } finally {
      vi.mocked(recordPerson).mockImplementation(real);
    }
  });

  it("a record written and then not finished is removed again, nothing opens, the card says it could not be saved, and no second record is made", async () => {
    M.partial = 1;
    draw();
    await press();
    const err = await screen.findByTestId("online-stakeholder-add-error");
    expect(err).toHaveTextContent(/could not be saved/i);
    expect(M.deleted).toEqual(["loser"]);
    expect(M.opened).toEqual([]);
    expect(M.tags).toEqual([null]);
    expect(M.made).toEqual([]);
    expect(screen.queryByText(/was created and its tag could not be read or made/)).toBeNull();
  });
});
