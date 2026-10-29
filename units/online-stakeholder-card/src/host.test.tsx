// Each member of the host: what it is called with, when, and how often; and the order of the hooks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";

vi.mock("@kaigilb/gilbplatformcode-person-create", async (orig) => (await import("../test/mocks")).personCreateMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => (await import("../test/mocks")).lwsRecordsMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-card-vocabulary", async (orig) => (await import("../test/mocks")).vocabularyMock(await orig<object>()));
vi.mock("@kaigilb/gilbplatformcode-stakeholder-list-state", async (orig) => (await import("../test/mocks")).listStateMock(await orig<{ forgetLinkedFinds: () => void }>()));

import { forgetLinkedRecords, forgetPageLinks, forgetScreenLinks } from "@kaigilb/gilbplatformcode-stakeholder-list-state";
import { FIND, LOG, M, VOCAB, reset } from "../test/mocks";
import { setUp, tearDown } from "../test/support";
import { BEN, STRANGER, draw, fakeHost, newClient, personFields, stubPlatform } from "../test/world";
import { OnlineStakeholderCard, useOnlineStakeholderCardHost } from "./index";

beforeEach(() => {
  setUp();
  reset();
  stubPlatform();
});
afterEach(() => {
  cleanup();
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

describe("the host provider", () => {
  it("without a provider the card throws an error that names it", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <QueryClientProvider client={newClient()}>
            <OnlineStakeholderCard principal={BEN} placementMode="content" />
          </QueryClientProvider>,
        ),
      ).toThrow("The online stakeholder card needs a OnlineStakeholderCardHostContext.Provider above it.");
    } finally {
      quiet.mockRestore();
    }
  });
  it("useOnlineStakeholderCardHost throws the same error outside a provider", () => {
    expect(() => useOnlineStakeholderCardHost()).toThrow();
  });
});

describe("the order of the hooks", () => {
  /** The first entry of each render: the host's hook, then the vocabulary query (its options are made on every render), then the photo keys. */
  const RENDER = ["useShell", "vocabulary", "photoReadKeys"];
  const renders = () => LOG.filter((e) => RENDER.includes(e));

  it("every render calls useShell FIRST, then the vocabulary query, then the photo keys: once each", async () => {
    draw();
    await screen.findByTestId("online-stakeholder-card");
    const log = renders();
    expect(log.length).toBeGreaterThanOrEqual(3);
    expect(log.length % 3).toBe(0);
    for (let i = 0; i < log.length; i += 3) expect(log.slice(i, i + 3)).toEqual(RENDER);
  });

  it("the same holds when the refused line is drawn", async () => {
    draw("content", STRANGER);
    await screen.findByTestId("online-stakeholder-refused");
    const log = renders();
    expect(log.length % 3).toBe(0);
    for (let i = 0; i < log.length; i += 3) expect(log.slice(i, i + 3)).toEqual(RENDER);
  });

  it("the same holds when the card is drawn beside the Card view (the actions pane)", async () => {
    draw("actions");
    await screen.findByTestId("online-stakeholder-actions");
    const log = renders();
    expect(log.length % 3).toBe(0);
    for (let i = 0; i < log.length; i += 3) expect(log.slice(i, i + 3)).toEqual(RENDER);
  });

  it("all hooks are called before the early returns: signing in after a first draw with no session adds no hook", async () => {
    const fake = fakeHost();
    const signedIn = fake.shell.session;
    fake.shell.session = undefined;
    const qc = newClient();
    const { Providers } = await import("../test/world");
    const tree = () => (
      <Providers host={fake.host} qc={qc}>
        <OnlineStakeholderCard principal={BEN} placementMode="content" />
      </Providers>
    );
    const r = render(tree());
    // No session: nothing is drawn (the first early return), and every hook has run.
    expect(r.container.textContent).toBe("");
    fake.shell.session = signedIn;
    r.rerender(tree());
    expect(await screen.findByTestId("online-stakeholder-card")).toBeInTheDocument();
    // And back to the early return again.
    fake.shell.session = undefined;
    r.rerender(tree());
    expect(screen.queryByTestId("online-stakeholder-card")).toBeNull();
  });

  it("a host whose useShell is a hook of its own (it calls useState) works: the card calls it unconditionally", async () => {
    const React = await import("react");
    const fake = fakeHost();
    const base = fake.host.useShell;
    fake.host.useShell = () => {
      React.useState(0);
      React.useRef(null);
      return base();
    };
    draw("content", BEN, fake);
    expect(await screen.findByTestId("online-stakeholder-card")).toBeInTheDocument();
  });
});

describe("useShell", () => {
  it("the shell's session names the holder: with no session the card draws nothing and reads nothing", async () => {
    const fake = fakeHost({}, { session: undefined });
    const r = draw("content", BEN, fake);
    expect(r.container.textContent).toBe("");
    expect(LOG).toContain("useShell");
    expect(M.opened).toEqual([]);
  });

  it("openRecordFromList is called with the id of the record, once, after the refresh", async () => {
    draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(LOG.filter((e) => e.startsWith("open:"))).toEqual(["open:newrec"]);
    expect(LOG.indexOf("refresh")).toBeLessThan(LOG.indexOf("open:newrec"));
  });
});

describe("refreshOnlineStakeholders", () => {
  it("is called with no argument, once, before an existing card of the person is opened", async () => {
    FIND.ids = ["https://team.platform.example.test/vault/e/bo9"];
    const refresh = vi.fn();
    draw("content", BEN, fakeHost({ refreshOnlineStakeholders: refresh }));
    await press();
    await waitFor(() => expect(M.opened).toEqual(["bo9"]));
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledWith();
    expect(M.made).toEqual([]);
  });

  it("after a card was made and linked: the lists are asked after the writes and before the record opens, once", async () => {
    const { fake } = draw();
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(fake.refreshed.n).toBe(1);
    const order = LOG.filter((e) => ["recordPerson", "patchRecord", "afterRecordPerson", "refresh"].includes(e) || e.startsWith("open:"));
    expect(order).toEqual(["recordPerson", "patchRecord", "afterRecordPerson", "refresh", "open:newrec"]);
  });

  it("after a failed link was cleaned up: once, and the record is not opened", async () => {
    M.patchFails = 2;
    const { fake } = draw();
    await press();
    await screen.findByTestId("online-stakeholder-add-error");
    expect(fake.refreshed.n).toBe(1);
    expect(M.opened).toEqual([]);
    // The clean-up first, then the lists (newest first).
    const order = LOG.filter((e) => ["deleteRecord", "afterRecordPerson", "refresh"].includes(e));
    expect(order).toEqual(["deleteRecord", "deleteRecord", "afterRecordPerson", "refresh"]);
  });

  it("is not called when the check could not be made, or when the create failed", async () => {
    M.createThrows = new Error("boom");
    const { fake } = draw();
    await press();
    await screen.findByTestId("online-stakeholder-add-error");
    expect(fake.refreshed.n).toBe(0);
  });
});

describe("photoReadKeysSync", () => {
  it("a group whose field is a photo key is not drawn (the header draws the picture); the key's `a:` prefix is dropped", async () => {
    VOCAB.fields = personFields([
      ["GivenName", "Given Name", "givenName"],
      ["FamilyName", "Family Name", "familyName"],
    ]);
    const fake = fakeHost({ photoReadKeysSync: () => ["a:givenName"] });
    draw("content", BEN, fake);
    await screen.findByRole("heading", { name: "Family Name" });
    expect(screen.queryByRole("heading", { name: "Given Name" })).toBeNull();
  });

  it("with no photo keys (the term is not known yet) every group is drawn", async () => {
    VOCAB.fields = personFields([
      ["GivenName", "Given Name", "givenName"],
      ["FamilyName", "Family Name", "familyName"],
    ]);
    draw();
    await screen.findByRole("heading", { name: "Family Name" });
    expect(screen.getByRole("heading", { name: "Given Name" })).toBeInTheDocument();
  });

  it("is read on every render, so a key that arrives later takes the group off at the next render", async () => {
    VOCAB.fields = personFields([
      ["GivenName", "Given Name", "givenName"],
      ["FamilyName", "Family Name", "familyName"],
    ]);
    let keys: readonly string[] = [];
    const fake = fakeHost({ photoReadKeysSync: () => keys });
    const r = draw("content", BEN, fake);
    await screen.findByRole("heading", { name: "Given Name" });
    keys = ["a:givenName"];
    const { Providers } = await import("../test/world");
    r.rerender(
      <Providers host={fake.host} qc={r.qc}>
        <OnlineStakeholderCard principal={BEN} placementMode="content" />
      </Providers>,
    );
    await waitFor(() => expect(screen.queryByRole("heading", { name: "Given Name" })).toBeNull());
  });
});

describe("the three hosts passed to the peers", () => {
  it("doors: linkedRecordsOf is given the host's own object, and reads heldRecordFreshMs from it", async () => {
    const reads: string[] = [];
    const base = fakeHost();
    const doors = new Proxy(base.host.doors, {
      get(t, k, rcv) {
        reads.push(String(k));
        return Reflect.get(t, k, rcv);
      },
    });
    // The find answers nothing: the card is made, so the doors were asked.
    draw("content", BEN, fakeHost({ doors }));
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(reads).toContain("heldRecordFreshMs");
  });

  it("person: recordPerson and afterRecordPerson are given the host's own object first", async () => {
    const fake = fakeHost();
    draw("content", BEN, fake);
    await press();
    await waitFor(() => expect(M.opened).toEqual(["newrec"]));
    expect(M.personHosts).toEqual([fake.host.person]);
    expect(M.personHosts[0]).toBe(fake.host.person);
    expect(M.afterHosts).toHaveLength(1);
    expect(M.afterHosts[0]).toBe(fake.host.person);
  });

  it("person: the failed-link clean-up also gives afterRecordPerson the host's object", async () => {
    M.patchFails = 2;
    const fake = fakeHost();
    draw("content", BEN, fake);
    await press();
    await screen.findByTestId("online-stakeholder-add-error");
    expect(M.afterHosts).toHaveLength(1);
    expect(M.afterHosts[0]).toBe(fake.host.person);
  });

  it("vocabulary: the query is made with the host's own object, on every render", async () => {
    const fake = fakeHost();
    draw("content", BEN, fake);
    await screen.findByTestId("online-stakeholder-card");
    expect(VOCAB.hosts.length).toBeGreaterThan(0);
    for (const h of VOCAB.hosts) expect(h).toBe(fake.host.vocabulary);
  });
});
