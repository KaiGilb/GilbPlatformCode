// The online stakeholder card drawn inside ONLY the provider, over a fake platform: it draws, reads and adds with no host object written.
// The master and the platform are the fixtures of `person-create` (copied into `test/`); the world around them is `test/world.ts`.
import { describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { identityFetch } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import { NO_OWN_CARD_SAYS } from "./index";
import { ANN, BEN, FOREIGN, FOREIGN_HOST, HOST, P, STRANGER, createWorld, type World } from "../test/world";
import { mountInProvider, newClient, type ProviderOverrides } from "../test/harness";

async function draw(world: World, over: ProviderOverrides = {}, principal: string = BEN) {
  vi.stubGlobal("fetch", world.fetch);
  const queryClient = newClient();
  const opened: string[] = [];
  let refreshed = 0;
  const view = mountInProvider(world, <OnlineStakeholderCard principal={principal} placementMode="content" />, {
    queryClient,
    onOpenRecord: (id) => void opened.push(id),
    refreshOnlineStakeholders: () => void (refreshed += 1),
    ...over,
  });
  return { ...view, queryClient, opened, get refreshed() { return refreshed; } };
}

const rows = () => screen.getAllByTestId("one-card-row-value").map((e) => e.textContent);
const groups = () => [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')].map((e) => e.getAttribute("data-group"));
const writes = (world: World) => world.calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url));

describe("the card inside the provider alone", () => {
  test("the header draws, with her vault, the circle, their name and their initials", async () => {
    const world = await createWorld();
    await draw(world);
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-card")).toBeTruthy());
    const header = screen.getByTestId("contact-shell-header");
    expect(header.querySelector(".gsh-hname-name")!.textContent).toBe("Ann");
    expect(within(header).getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    expect(within(header).getByTestId("contact-card-initials").textContent).toBe("BL");
    expect(within(header).getByTestId("person-placement-chip").textContent).toBe("Personal Inner Circle");
  });

  test("the body draws their rows, each marked as theirs, in the order of the person kind", async () => {
    const world = await createWorld();
    await draw(world);
    // The order is the person kind's, as the master lists its fields (the card first draws in the order their card came, then in the kind's).
    await waitFor(() => expect(groups()).toEqual(["theirs:a:email", "theirs:a:familyName", "theirs:a:givenName"]));
    expect(rows()).toEqual(["ben@example.test", "Larsen", "Ben"]);
    expect(screen.getAllByTestId("one-card-mark").length).toBe(3);
  });

  test("it signs its reads with the session, for the platform's hosts only, and never writes while drawing", async () => {
    const world = await createWorld();
    await draw(world);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    const card = world.requests("GET", /\/base\/connect\/public-card\?/)[0]!;
    expect(card.headers.authorization).toBe("DPoP fake-access-token");
    expect(card.headers.dpop).toBe(`proof(GET ${card.url})`);
    expect(world.signed.length).toBeGreaterThan(0);
    expect(writes(world)).toEqual([]);
  });

  test("a person who is not in her circles is refused in one plain line, and their card is not read", async () => {
    const world = await createWorld({ benPlaced: false });
    await draw(world);
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-refused").textContent).toBe("This person is not one of your stakeholders."));
    expect(world.requests("GET", /public-card/)).toEqual([]);
  });

  test("the actions pane says their card cannot be changed here", async () => {
    const world = await createWorld();
    vi.stubGlobal("fetch", world.fetch);
    mountInProvider(world, <OnlineStakeholderCard principal={BEN} placementMode="actions" />, { queryClient: newClient() });
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-actions").textContent).toContain("nothing of it can be changed here"));
  });

  test("the vault list is decorated: without its landing row the header is not drawn, as in production", async () => {
    const decorated = await createWorld();
    await draw(decorated);
    await waitFor(() => expect(screen.getByTestId("contact-shell-header")).toBeTruthy());
    expect(decorated.requests("GET", /\/lws\/vaults$/).length).toBe(1);
  });

  test("while the decoration has failed the rows are lean: the card body is drawn, and the header and the add are not", async () => {
    const world = await createWorld({ vaultsStatus: 503 });
    await draw(world);
    // With no landing row the person's own vault is the root of the session vault's entity, which is no vault id of the set.
    await waitFor(() => expect(world.requests("GET", /\/lws\/vaults$/).length).toBeGreaterThan(0));
    await new Promise((r) => setTimeout(r, 50));
    expect(screen.queryByTestId("contact-shell-header")).toBeNull();
    expect(screen.queryByTestId("add-own")).toBeNull();
  });
});

describe("+ Add your own", () => {
  test("with an own card, it makes the person's card in her vault, links it, remembers where it was made and opens it", async () => {
    const world = await createWorld();
    const view = await draw(world);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(view.opened.length).toBe(1), { timeout: 8000 });

    const creates = world.requests("POST", /\/lws\/vault\/[^/]+\/c$/);
    expect(creates.length).toBe(1); // the platform makes the record's tag itself, so there is no second create
    const create = creates[0]!;
    expect(create.url).toBe(`${HOST}/lws/vault/${encodeURIComponent(P)}/c`);
    expect(create.headers.authorization).toBe("DPoP fake-access-token");
    expect(create.headers.dpop).toBe(`proof(POST ${create.url})`);
    const body = JSON.parse(create.body!) as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:Person");
    expect(body.facts["a:name"]).toBe("Ben Larsen");
    expect(body.facts["a:statedBy"]).toEqual({ "@id": world.ownCardUri });

    const id = view.opened[0]!;
    // The link: the card's own door, a merge patch of `a:sameAs` to the person.
    const link = world.requests("PATCH", new RegExp(`/lws/r/${id}$`))[0]!;
    expect(link.headers.authorization).toBe("DPoP fake-access-token");
    expect(link.headers.dpop).toBe(`proof(PATCH ${link.url})`);
    expect(JSON.parse(link.body!)).toMatchObject({ "a:sameAs": { "@id": BEN } });
    // The host's `rememberCreatedIn`: the vault the create wrote into, for the session.
    expect(view.queryClient.getQueryData(["created-in-vault", id])).toBe(P);
    // The host's `refreshOnlineStakeholders` ran before the record was opened.
    expect(view.refreshed).toBeGreaterThan(0);
    // The card stays in place: opening is the page's act, and this page opened nothing itself.
    expect(screen.getByTestId("online-stakeholder-card")).toBeTruthy();
  });

  test("without an own card it says so in one sentence and makes no write", async () => {
    const world = await createWorld({ ownCard: false });
    const view = await draw(world);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-add-error").textContent).toBe(NO_OWN_CARD_SAYS));
    expect(writes(world)).toEqual([]);
    expect(view.opened).toEqual([]);
  });

  test("a person she already holds a card of opens that card and makes nothing", async () => {
    const world = await createWorld();
    const existing = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:sameAs": { "@id": BEN } });
    const view = await draw(world);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(view.opened.length).toBe(1));
    expect(view.opened[0]).toBe(existing.slice(existing.lastIndexOf("/") + 1));
    expect(writes(world)).toEqual([]);
  });
});

describe("the credential gate", () => {
  test("the card's own platform client sends the session to the platform's hosts and to no other host", async () => {
    const world = await createWorld();
    await draw(world);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    // The wiring the card builds its requests on: a URL outside the platform's family gets no part of the session.
    const foreign = `${FOREIGN_HOST}/base/connect/public-card?principal=x`;
    await identityFetch(foreign);
    await identityFetch(`${HOST}/base/connect/public-card?principal=x`);
    const toForeign = world.calls.filter((c) => c.url.startsWith(FOREIGN_HOST));
    expect(toForeign.length).toBe(1);
    expect(toForeign[0]!.headers.authorization).toBeUndefined();
    expect(toForeign[0]!.headers.dpop).toBeUndefined();
    const toPlatform = world.calls.filter((c) => c.url === `${HOST}/base/connect/public-card?principal=x`);
    expect(toPlatform[0]!.headers.authorization).toBe("DPoP fake-access-token");
    expect(world.signed.every((s) => !s.url.startsWith(FOREIGN_HOST))).toBe(true);
  });

  test("a vault of hers on a foreign host is asked at the platform, never at that host, and every request carries the session", async () => {
    const world = await createWorld({
      ownCard: false,
      sessionVaults: [
        { vaultId: P, modes: ["read", "write"] },
        { vaultId: FOREIGN, modes: ["read"] },
      ],
    });
    await draw(world);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    const before = world.calls.length;
    fireEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-add-error")).toBeTruthy());
    expect(world.calls.filter((c) => c.url.startsWith(FOREIGN_HOST))).toEqual([]);
    const sent = world.calls.slice(before).filter((c) => /find-by-attribute/.test(c.url));
    expect(sent.length).toBe(2); // her own vault at its host, the other at the platform's apex
    for (const c of sent) expect(c.headers.authorization).toBe("DPoP fake-access-token");
  });
});

describe("a missing provider", () => {
  test("the card without the provider throws an error that names the context it needs", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(() =>
        render(
          <QueryClientProvider client={newClient()}>
            <OnlineStakeholderCard principal={BEN} placementMode="content" />
          </QueryClientProvider>,
        ),
      ).toThrow(/OnlineStakeholderCardHostContext\.Provider/);
    } finally {
      quiet.mockRestore();
    }
  });
});

describe("the held-note and place members left to their defaults", () => {
  test("the header draws with no 'Where / How we met' line and no kind chips", async () => {
    const world = await createWorld();
    await draw(world);
    await waitFor(() => expect(screen.getByTestId("contact-card-name")).toBeTruthy());
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    expect(document.querySelector(".gsh-origin")).toBeNull();
    expect(screen.queryByTestId("contact-kind-chips")).toBeNull();
    expect(screen.queryByTestId("contact-kind-add")).toBeNull();
  });

  test("the developer's own hooks are the ones the header uses", async () => {
    const world = await createWorld();
    const labels = vi.fn((_args: unknown) => ({
      chips: [{ key: "k1", axis: "relationshipKind" as const, entryId: "e1", label: "Colleague", tone: "neutral" as const, readOnly: true }],
      offered: { circleLabel: [], relationshipKind: [] },
      offersLoading: false,
      catalogueNote: null,
      actError: null,
      add: async () => false,
      entryPredicates: new Map(),
    }));
    const origin = vi.fn(() => ({ origin: "Met at the harbour fair", loading: false }));
    await draw(world, { useContactLabels: labels as never, useHolderOriginLine: origin });
    await waitFor(() => expect(screen.getByTestId("contact-card-name")).toBeTruthy());
    await waitFor(() => expect(document.body.textContent).toContain("Met at the harbour fair"));
    expect(origin).toHaveBeenCalled();
    // The header asked the developer's hook, for her vault and for no entity (so, as in GilbApp, a disabled read).
    expect(labels).toHaveBeenCalled();
    expect((labels.mock.calls[0] as unknown[])[0]).toMatchObject({ vaultId: P, ownVaultId: P, principal: ANN, subject: "", enabled: false });
  });

  test("the four place members are never called while the card draws", async () => {
    const world = await createWorld();
    const spies = {
      listPlaceClaimsInVault: vi.fn(async () => []),
      claimsAbout: vi.fn(() => []),
      claimFieldText: vi.fn(() => ""),
      loadPlaceNames: vi.fn(async () => []),
    };
    await draw(world, spies);
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").length).toBe(3));
    await waitFor(() => expect(screen.getByTestId("contact-card-name")).toBeTruthy());
    await new Promise((r) => setTimeout(r, 50));
    expect(spies.listPlaceClaimsInVault).not.toHaveBeenCalled();
    expect(spies.claimsAbout).not.toHaveBeenCalled();
    expect(spies.claimFieldText).not.toHaveBeenCalled();
    expect(spies.loadPlaceNames).not.toHaveBeenCalled();
  });

  test("the photo members default to initials: nothing is asked for a picture", async () => {
    const world = await createWorld();
    await draw(world);
    await waitFor(() => expect(screen.getByTestId("contact-card-initials")).toBeTruthy());
    expect(document.querySelector('[data-testid="contact-card-link-photo"] img')).toBeNull();
    expect(world.calls.filter((c) => /profile-photo|photo/i.test(c.url) && !/profilePhoto$/.test(c.url))).toEqual([]);
  });

  test("the photo hooks of the developer are called", async () => {
    const world = await createWorld();
    const discover = vi.fn(async () => ({ photoRef: null }));
    await draw(world, { discoverVaultProfilePhoto: discover });
    await waitFor(() => expect(discover).toHaveBeenCalled());
  });
});

describe("another person is not drawn as Ben", () => {
  test("a stranger gets the refused line", async () => {
    const world = await createWorld();
    await draw(world, {}, STRANGER);
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-refused")).toBeTruthy());
  });

  test("the holder herself gets nothing drawn", async () => {
    const world = await createWorld();
    const view = await draw(world, {}, ANN);
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-refused")).toBeTruthy());
    expect(view.opened).toEqual([]);
  });
});
