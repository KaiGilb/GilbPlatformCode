// The held card (`HeldStakeholderCard`: `StakeholderRecordCard` of `stakeholder-record-card`, with the host this unit builds) drawn inside the provider and this unit ALONE: no host object written. Each test names the server
// each request went to: a record is read, patched and annotated at the node of the vault that holds it, a relation is written at that node with the vault in
// its body, and the platform's apex is asked only for the session's vaults and the photo term.
import { useContext, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { AddedByHostContext } from "@kaigilb/gilbplatformcode-added-by";
import { rememberAddedByCard } from "@kaigilb/gilbplatformcode-record-detail-reads";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { OnlineStakeholderCard } from "@kaigilb/gilbplatformcode-online-stakeholder-card";
import { BASE, BEN, HOST, P, createWorld, type World } from "../test/world";
import { heldWorld, type HeldWorld } from "../test/heldWorld";
import { StakeholderCardGilbPlatformProvider } from "@kaigilb/gilbplatformcode-stakeholder-card-hosts-gilbplatform";
import { HeldStakeholderCard, NO_PROFILE_ADDRESS_SAYS } from "./index";
import { mountInProvider, providerProps } from "../test/harness";

let world: World;
let hw: HeldWorld;
let id: string;
beforeEach(async () => {
  world = await createWorld();
  hw = heldWorld(world);
  const uri = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen" });
  id = uri.slice(uri.lastIndexOf("/") + 1);
  vi.stubGlobal("fetch", hw.fetch);
});

const card = () => <HeldStakeholderCard recordId={id} vaultId={P} />;
// The card is drawn when its record is read AND its top slots have their boxes: the header and the Name group come first.
const ready = () =>
  waitFor(
    () => {
      expect(screen.getByTestId("contact-note-editor")).toBeTruthy();
      expect(screen.getByTestId("connection-origin-editor")).toBeTruthy();
    },
    { timeout: 6000 },
  );
const text = (testid: string) => screen.getByTestId(testid).textContent;
const writes = () => world.calls.filter((c) => c.method !== "GET");
const etagNow = async () => (await world.fetch(`${HOST}/lws/r/${id}`)).headers.get("etag");

describe("the card is drawn", () => {
  test("the header names the holder and the person, and the groups are the card's: the notes at the top, the Name group with the person's fields", async () => {
    mountInProvider(world, card(), { viewedVaultId: P });
    await ready();
    await waitFor(() => expect(text("contact-header-holder-name")).toContain("Ann Ward"));
    expect(text("contact-card-name")).toBe("Ben Larsen");
    expect(screen.getByTestId("contact-note-group")).toBeTruthy();
    expect(screen.getByTestId("connection-origin-group")).toBeTruthy();
    const fields = screen.getAllByTestId("field-present").map((e) => e.textContent);
    expect(fields).toEqual(["Given nameBen", "Family nameLarsen"]);
    expect(screen.getByTestId("card-edit")).toBeTruthy();
    expect(screen.getByTestId("card-add-info-button")).toBeTruthy();
  });

  test("the record is read at the node of the vault that holds it, signed, and the platform's apex is asked for no record", async () => {
    mountInProvider(world, card(), { viewedVaultId: P });
    await ready();
    const reads = world.requests("GET", new RegExp(`/lws/r/${id}$`));
    expect(reads.map((r) => r.url)).toEqual([`${HOST}/lws/r/${id}`]);
    expect(world.signed.some((s) => s.method === "GET" && s.url === `${HOST}/lws/r/${id}`)).toBe(true);
    expect(world.calls.filter((c) => c.url.startsWith(BASE) && /\/lws\/r\//.test(c.url))).toEqual([]);
  });

  test("a vault held read-only draws the card with no Edit and no + Relation, and the shell says why", async () => {
    const readOnly = await createWorld({ sessionVaults: [{ vaultId: P, modes: ["read"] }] });
    const uri = readOnly.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen" });
    const rid = uri.slice(uri.lastIndexOf("/") + 1);
    vi.stubGlobal("fetch", heldWorld(readOnly).fetch);
    mountInProvider(readOnly, <HeldStakeholderCard recordId={rid} vaultId={P} />, { viewedVaultId: P });
    await waitFor(() => expect(text("contact-card-name")).toBe("Ben Larsen"), { timeout: 6000 });
    await waitFor(() => expect(screen.getAllByTestId("field-present").length).toBe(2));
    expect(screen.queryByTestId("card-edit")).toBeNull();
    expect(screen.queryByTestId("contact-header-add-relation")).toBeNull();
  });
});

describe("the card writes", () => {
  test("an edit is saved by itself: one PATCH at the record's own node, against the version the card read, signed", async () => {
    mountInProvider(world, card(), { viewedVaultId: P });
    await ready();
    const etag = await etagNow();
    expect(etag).toBeTruthy();
    await userEvent.click(screen.getByTestId("card-edit"));
    await userEvent.type(screen.getByDisplayValue("Ben"), "x");
    await waitFor(() => expect(world.calls.filter((c) => c.method === "PATCH").length).toBe(1), { timeout: 4000 });
    const patch = world.calls.find((c) => c.method === "PATCH")!;
    expect(patch.url).toBe(`${HOST}/lws/r/${id}`);
    expect(patch.headers["if-match"]).toBe(etag);
    expect(patch.headers["authorization"]).toMatch(/^DPoP /);
    expect(JSON.parse(patch.body!)).toMatchObject({ "a:givenName": "Benx" });
    expect(world.signed.some((s) => s.method === "PATCH" && s.url === patch.url)).toBe(true);
    // The platform kept it.
    expect(world.platform.entities.get(`${HOST}/base/e/${id}`)!.facts["a:givenName"]).toBe("Benx");
  });

  test("+ Relation writes the kind as a relation in the holder's vault: one PUT at the vault's node, the vault in its body, private to the holder", async () => {
    mountInProvider(world, card(), { viewedVaultId: P });
    await ready();
    await waitFor(() => expect(text("contact-header-holder-name")).toContain("Ann Ward"));
    await userEvent.click(screen.getByTestId("contact-header-add-relation"));
    const friend = await waitFor(() => {
      const o = screen.getAllByTestId("contact-kind-option").find((e) => e.textContent === "Friend");
      expect(o).toBeTruthy();
      return o!;
    });
    await userEvent.click(friend);
    await waitFor(() => expect(writes().filter((c) => c.method === "PUT" && /\/base\/r\//.test(c.url)).length).toBe(1));
    const put = writes().find((c) => /\/base\/r\//.test(c.url))!;
    expect(put.method).toBe("PUT");
    expect(new URL(put.url).origin).toBe(HOST);
    const body = JSON.parse(put.body!) as Record<string, any>;
    expect(body.vault).toBe(P);
    expect(body.type).toBe("t:FriendOf");
    expect(body.facts["role:source"]["@id"]).toBe(`${HOST}/base/e/${id}`);
    expect(body.facts["a:visibilityTier"]).toBe("private");
    expect(world.signed.some((s) => s.method === "PUT" && s.url === put.url)).toBe(true);
    // Nothing was written at the platform's apex or at any other host.
    expect(writes().filter((c) => new URL(c.url).origin !== HOST)).toEqual([]);
  });

  test("My Note is written at the holder's vault node: one PUT of the annotations route, naming the vault and the person", async () => {
    mountInProvider(world, card(), { viewedVaultId: P });
    await ready();
    await userEvent.type(screen.getByTestId("contact-note-editor"), "Met at the summit");
    await userEvent.tab();
    await waitFor(() => expect(hw.puts.length).toBe(1));
    expect(hw.puts[0]!.url).toBe(`${HOST}/base/connect/annotations`);
    expect(hw.puts[0]!.body).toMatchObject({ heldParty: `${HOST}/base/e/${id}`, vaultId: P, note: "Met at the summit" });
    expect(world.signed.some((s) => s.method === "PUT" && s.url === hw.puts[0]!.url)).toBe(true);
  });
});

describe("a record linked to a person's online card", () => {
  test("the platform's resolver names the person: the online rows are marked, the circle chip is drawn, and My Note is written under the person, not under the record", async () => {
    const uri = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:sameAs": { "@id": BEN } });
    const linkedId = uri.slice(uri.lastIndexOf("/") + 1);
    const linked = heldWorld(world, { anchor: BEN });
    vi.stubGlobal("fetch", linked.fetch);
    mountInProvider(world, <HeldStakeholderCard recordId={linkedId} vaultId={P} />, { viewedVaultId: P });
    await waitFor(() => expect(screen.getAllByTestId("one-card-mark").map((e) => e.textContent)).toContain("From their online card"), { timeout: 8000 });
    expect(text("person-placement-chip")).toBe("Personal Inner Circle");
    await userEvent.type(await screen.findByTestId("contact-note-editor"), "Linked note");
    await userEvent.tab();
    await waitFor(() => expect(linked.puts.length).toBe(1));
    expect(linked.puts[0]!.url).toBe(`${HOST}/base/connect/annotations`);
    expect(linked.puts[0]!.body).toMatchObject({ heldParty: BEN, vaultId: P, note: "Linked note" });
    expect(world.requests("GET", /\/base\/connect\/online-card-anchor/).every((r) => r.url.startsWith(BASE))).toBe(true);
  });
});

describe("the header and the slots share one hook", () => {
  test("a line met-at that the body's group reads is drawn in the header from the SAME read: one request of the annotations route", async () => {
    hw.origins.set(`${HOST}/base/e/${id}`, "Oslo summit");
    mountInProvider(world, card(), { viewedVaultId: P });
    await waitFor(() => expect(screen.getByTestId("contact-card-origin-inline").textContent).toContain("Oslo summit"), { timeout: 6000 });
    await waitFor(() => expect(screen.getByTestId("connection-origin").textContent).toContain("Oslo summit"));
    expect(world.requests("GET", /\/base\/connect\/annotations/).length).toBe(1);
  });

  test("a hook of the developer's replaces the header's, and then the header does not draw the body's line", async () => {
    hw.origins.set(`${HOST}/base/e/${id}`, "Oslo summit");
    mountInProvider(world, card(), { viewedVaultId: P, useHolderOriginLine: () => ({ origin: null, loading: false }) });
    await waitFor(() => expect(screen.getByTestId("connection-origin").textContent).toContain("Oslo summit"), { timeout: 6000 });
    expect(screen.queryByTestId("contact-card-origin-inline")).toBeNull();
  });
});

describe("the whole path", () => {
  test("after + Add your own, the page is told the new record and the vault it was created in, and the held card of that record draws there", async () => {
    const opened: unknown[][] = [];
    function Page() {
      const [at, setAt] = useState<{ id: string; door?: string } | null>(null);
      return (
        <StakeholderCardGilbPlatformProvider
          {...providerProps(world)}
          viewedVaultId={P}
          onOpenRecord={(openedId, door) => {
            opened.push(door === undefined ? [openedId] : [openedId, door]);
            setAt(door === undefined ? { id: openedId } : { id: openedId, door });
          }}
        >
          {at ? <HeldStakeholderCard recordId={at.id} {...(at.door ? { vaultId: at.door } : {})} /> : <OnlineStakeholderCard principal={BEN} placementMode="content" />}
        </StakeholderCardGilbPlatformProvider>
      );
    }
    render(<Page />);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy(), { timeout: 6000 });
    await userEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(opened.length).toBe(1), { timeout: 8000 });
    const [newId, door] = opened[0] as [string, string];
    expect(door).toBe(P);
    // The held card of the new record, read at the vault the create wrote it into, draws with the person's name.
    await waitFor(() => expect(text("contact-card-name")).toBe("Ben Larsen"), { timeout: 8000 });
    expect(world.requests("GET", new RegExp(`/lws/r/${newId}$`)).every((r) => r.url.startsWith(HOST))).toBe(true);
  });
});

describe("the whole path, a record the holder already holds (H13)", () => {
  // Live case, 2026-10-31: John held a record for Kai in his own vault; "+ Add your own" found it, wrote nothing, and opened the held card,
  // which said "Which vault holds this card is not known, so it was not read". The find knew the vault and the id was passed alone.
  function Page({ opened }: { opened: unknown[][] }) {
    const [at, setAt] = useState<{ id: string; door?: string } | null>(null);
    return (
      <StakeholderCardGilbPlatformProvider
        {...providerProps(world)}
        viewedVaultId={P}
        onOpenRecord={(openedId, door) => {
          opened.push(door === undefined ? [openedId] : [openedId, door]);
          setAt(door === undefined ? { id: openedId } : { id: openedId, door });
        }}
      >
        {at ? <HeldStakeholderCard recordId={at.id} {...(at.door ? { vaultId: at.door } : {})} /> : <OnlineStakeholderCard principal={BEN} placementMode="content" />}
      </StakeholderCardGilbPlatformProvider>
    );
  }

  test("an existing linked record in the holder's vault: + Add your own writes nothing, opens it with that vault as the door, and the held card reads it", async () => {
    const existing = world.platform.seed(P, "t:Person", { "a:name": "Ben Larsen", "a:givenName": "Ben", "a:familyName": "Larsen", "a:sameAs": { "@id": BEN } });
    const existingId = existing.slice(existing.lastIndexOf("/") + 1);
    const opened: unknown[][] = [];
    render(<Page opened={opened} />);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy(), { timeout: 6000 });
    const before = world.calls.filter((c) => c.method !== "GET").length;
    await userEvent.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(opened.length).toBe(1), { timeout: 8000 });
    expect(opened[0]).toEqual([existingId, P]);
    await waitFor(() => expect(text("contact-card-name")).toBe("Ben Larsen"), { timeout: 8000 });
    expect(screen.queryByText(/not known, so it was not read/)).toBeNull();
    expect(world.requests("GET", new RegExp(`/lws/r/${existingId}$`)).every((r) => r.url.startsWith(HOST))).toBe(true);
    // Nothing was made: the same writes as before the press (none for a create).
    expect(world.calls.filter((c) => c.method !== "GET").length).toBe(before);
  });
});

describe("the Added by line opens the adder's card (H13, path 5)", () => {
  // AddedByLine remembers the card it opens (`rememberAddedByCard`, its own address) and then asks the shell to open it. The provider's shell has no
  // openRecordInVault, so the id goes through onOpenRecord alone. Does the held card then know where to read it?
  test("the page is told the id alone, and the held card of it, with no door, reads the record at the address the line remembered", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const adder = world.platform.seed(P, "t:Person", { "a:name": "Cora Adder", "a:givenName": "Cora", "a:familyName": "Adder" });
    const adderId = adder.slice(adder.lastIndexOf("/") + 1);
    const opened: unknown[][] = [];
    function Page() {
      const shell = useContext(AddedByHostContext)!.useShell()!;
      return (
        <button
          data-testid="open-adder"
          onClick={() => {
            rememberAddedByCard(qc, adderId, { door: adder, name: "Cora Adder" });
            shell.openRecordFromList(adderId);
          }}
        />
      );
    }
    // The page keeps `at` in a parent so the provider's onOpenRecord can set it.
    function Root() {
      const [at, setAt] = useState<{ id: string; door?: string } | null>(null);
      return (
        <StakeholderCardGilbPlatformProvider
          {...providerProps(world)}
          queryClient={qc}
          viewedVaultId={P}
          onOpenRecord={(id, door) => {
            opened.push(door === undefined ? [id] : [id, door]);
            setAt(door === undefined ? { id } : { id, door });
          }}
        >
          {at ? <HeldStakeholderCard recordId={at.id} {...(at.door ? { vaultId: at.door } : {})} /> : <Page />}
        </StakeholderCardGilbPlatformProvider>
      );
    }
    render(<Root />);
    await userEvent.click(screen.getByTestId("open-adder"));
    await waitFor(() => expect(opened.length).toBe(1));
    expect(opened[0]![0]).toBe(adderId);
    await waitFor(() => expect(text("record-header")).toContain("Cora Adder"), { timeout: 8000 });
    expect(screen.queryByText(/not known, so it was not read/)).toBeNull();
    expect(world.requests("GET", new RegExp(`/lws/r/${adderId}$`)).every((r) => r.url.startsWith(HOST))).toBe(true);
    // NOT A BUG: the held card finds the door itself, in the same query client (findKnownRecordInCache reads addedByCardOf). Control below.
  }, 20000);

  test("control: with nothing remembered for the id and no door, the same open is refused (the test above does discriminate)", async () => {
    const adder = world.platform.seed(P, "t:Person", { "a:name": "Cora Adder", "a:givenName": "Cora", "a:familyName": "Adder" });
    const adderId = adder.slice(adder.lastIndexOf("/") + 1);
    mountInProvider(world, <HeldStakeholderCard recordId={adderId} />, { viewedVaultId: P });
    expect(await screen.findByText(/not known, so it was not read/)).toBeTruthy();
    expect(world.requests("GET", new RegExp(`/lws/r/${adderId}$`))).toEqual([]);
  });
});

describe("without the profile address", () => {
  test("the provider was given no mynetProfileUrl: one plain sentence, no card, no throw, no read of the record", async () => {
    mountInProvider(world, card(), { viewedVaultId: P, settings: {} });
    expect(screen.getByTestId("held-card-no-profile-address").textContent).toBe(NO_PROFILE_ADDRESS_SAYS);
    expect(NO_PROFILE_ADDRESS_SAYS).toBe("The MyNet profile address is not set, so this card is not drawn.");
    await new Promise((r) => setTimeout(r, 100));
    expect(screen.queryByTestId("record-detail")).toBeNull();
    expect(world.requests("GET", new RegExp(`/lws/r/${id}$`))).toEqual([]);
  });

  test("with the address set, the card draws and no sentence is shown", async () => {
    mountInProvider(world, card(), { viewedVaultId: P });
    await ready();
    expect(screen.queryByTestId("held-card-no-profile-address")).toBeNull();
  });
});

describe("without the provider", () => {
  test("it throws an error that names the provider", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(card())).toThrow(/StakeholderCardGilbPlatformProvider/);
    quiet.mockRestore();
  });
});
