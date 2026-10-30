// The app end to end over the host unit's fake platform (test/world.ts): settings, sign-in, the card, one add, one add with no own card yet, the circles list.
import { describe, expect, test } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { SETTINGS_KEY, loadSettings } from "./settings";
import { TEST_SETTINGS, keepSettings, signedInApp } from "../test/helpers";
import { BEN, HOST, ONTOLOGY, P } from "../test/world";

const writes = (calls: { method: string; url: string }[]) => calls.filter((c) => c.method !== "GET" && !/\/base\/tag\/masters$/.test(c.url));
const principalField = () => screen.getByLabelText(/Person's principal/) as HTMLInputElement;

async function showCard(user: ReturnType<typeof userEvent.setup>, principal: string = BEN) {
  await user.clear(principalField());
  await user.type(principalField(), principal);
  await user.click(screen.getByRole("button", { name: "Show card" }));
}

describe("settings", () => {
  test("first run shows the Settings screen; saving keeps the values in localStorage and goes on to sign in", async () => {
    const user = userEvent.setup();
    render(<App makeSession={() => (null as never)} />);
    expect(screen.getByRole("form", { name: "Settings" })).toBeTruthy();
    for (const [label, value] of [
      ["Platform origin of the vault", TEST_SETTINGS.origin],
      ["Ontology origin", TEST_SETTINGS.ontologyOrigin],
      ["World catalogue origin", TEST_SETTINGS.geoOrigin],
      ["System vault hosts", TEST_SETTINGS.systemVaultHosts],
      ["System host labels", TEST_SETTINGS.systemHostLabels],
    ] as const) await user.type(screen.getByLabelText(label), value);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(loadSettings()).toEqual(TEST_SETTINGS);
    expect(await screen.findByTestId("sign-in-email")).toBeTruthy();
  });

  test("an unusable value is named in a sentence and nothing is kept", async () => {
    const user = userEvent.setup();
    render(<App makeSession={() => (null as never)} />);
    await user.type(screen.getByLabelText("Platform origin of the vault"), "not an origin");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByRole("alert").textContent).toContain("The platform origin must look like https://host");
    expect(screen.getByRole("alert").textContent).toContain("The world catalogue origin is needed.");
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  test("kept settings skip the Settings screen on the next run, and the Settings button edits them later", async () => {
    keepSettings();
    const user = userEvent.setup();
    render(<App makeSession={() => (null as never)} />);
    expect(screen.queryByRole("form", { name: "Settings" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const geo = screen.getByLabelText("World catalogue origin") as HTMLInputElement;
    expect(geo.value).toBe(TEST_SETTINGS.geoOrigin);
    await user.clear(geo);
    await user.type(geo, "https://geo2.example.test");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(loadSettings()!.geoOrigin).toBe("https://geo2.example.test");
  });

  test("the saved origins reach the platform: the reads go to the saved origin and the saved ontology origin", async () => {
    const { world } = await signedInApp();
    const user = userEvent.setup();
    await showCard(user);
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-card")).toBeTruthy());
    expect(world.calls.some((c) => c.url.startsWith(ONTOLOGY))).toBe(true);
    expect(world.calls.some((c) => c.url.startsWith(HOST))).toBe(true);
  });
});

describe("sign-in", () => {
  test("the code step leads to the card screen, and Sign out returns to the sign-in", async () => {
    const s = await signedInApp();
    expect(s.signInWithCode).toHaveBeenCalledTimes(1);
    expect(s.signInWithCode.mock.calls[0]!.slice(0, 3)).toEqual([TEST_SETTINGS.origin, "ann@example.test", "123456"]);
    expect(s.sent.length).toBeGreaterThan(0);
    await s.user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(s.invalidate).toHaveBeenCalledWith(true);
    expect(await screen.findByTestId("sign-in-email")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Card" })).toBeNull();
  });
});

describe("the card", () => {
  test("a seeded person's principal draws the header (name, initials) and the card body, signed, with no write", async () => {
    const { world } = await signedInApp();
    const user = userEvent.setup();
    expect((screen.getByLabelText("Placement") as HTMLSelectElement).value).toBe("content");
    await showCard(user);
    await waitFor(() => expect(screen.getByTestId("contact-shell-header")).toBeTruthy());
    const header = screen.getByTestId("contact-shell-header");
    expect(within(header).getByTestId("contact-card-name").textContent).toBe("Ben Larsen");
    expect(within(header).getByTestId("contact-card-initials").textContent).toBe("BL");
    await waitFor(() => expect(screen.getAllByTestId("one-card-row-value").map((e) => e.textContent)).toEqual(["ben@example.test", "Larsen", "Ben"]));
    const read = world.requests("GET", /\/base\/connect\/public-card\?/)[0]!;
    expect(read.headers.authorization).toBe("DPoP fake-access-token");
    expect(read.headers.dpop).toBe(`proof(GET ${read.url})`);
    expect(writes(world.calls)).toEqual([]);
  });

  test("an empty field asks for a principal and draws no card", async () => {
    await signedInApp();
    await userEvent.setup().click(screen.getByRole("button", { name: "Show card" }));
    expect(screen.getByRole("alert").textContent).toBe("Type a person's principal (their WebID).");
    expect(screen.queryByTestId("online-stakeholder-card")).toBeNull();
  });

  test("the placement select reaches the card: the actions pane says nothing of their card can be changed", async () => {
    await signedInApp();
    const user = userEvent.setup();
    await user.selectOptions(screen.getByLabelText("Placement"), "actions");
    await showCard(user);
    await waitFor(() => expect(screen.getByTestId("online-stakeholder-actions").textContent).toContain("nothing of it can be changed here"));
  });

  test("+ Add your own, with an own card, sends the create with DPoP headers and says which record opened", async () => {
    const { world } = await signedInApp();
    const user = userEvent.setup();
    await showCard(user);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    await user.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy(), { timeout: 8000 });
    const creates = world.requests("POST", /\/lws\/vault\/[^/]+\/c$/);
    expect(creates.length).toBe(1);
    const create = creates[0]!;
    expect(create.url).toBe(`${HOST}/lws/vault/${encodeURIComponent(P)}/c`);
    expect(create.headers.authorization).toBe("DPoP fake-access-token");
    expect(create.headers.dpop).toBe(`proof(POST ${create.url})`);
    const body = JSON.parse(create.body!) as { type: string; facts: Record<string, unknown> };
    expect(body.type).toBe("t:Person");
    expect(body.facts["a:name"]).toBe("Ben Larsen");
    const link = world.requests("PATCH", /\/lws\/r\//)[0]!;
    const id = link.url.slice(link.url.lastIndexOf("/") + 1);
    expect(screen.getByRole("status").textContent).toBe(`The card opened the record ${id}. This app has no record view.`);
  });

  test("with no own card the provider makes the basic one first (a selfcard POST with DPoP), then sends the create", async () => {
    const { world } = await signedInApp({ ownCard: false });
    const user = userEvent.setup();
    await showCard(user);
    await waitFor(() => expect(screen.getByTestId("add-own")).toBeTruthy());
    await user.click(screen.getByTestId("add-own"));
    await waitFor(() => expect(screen.getByRole("status")).toBeTruthy(), { timeout: 8000 });
    expect(screen.queryByTestId("online-stakeholder-add-error")).toBeNull();
    const selfcard = world.requests("POST", /\/selfcard$/);
    expect(selfcard.length).toBe(1);
    expect(selfcard[0]!.url).toBe(`${HOST}/lws/vault/${encodeURIComponent(P)}/selfcard`);
    expect(selfcard[0]!.headers.authorization).toBe("DPoP fake-access-token");
    expect(selfcard[0]!.headers.dpop).toBe(`proof(POST ${selfcard[0]!.url})`);
    const create = world.requests("POST", /\/lws\/vault\/[^/]+\/c$/)[0]!;
    expect(world.calls.indexOf(selfcard[0]!)).toBeLessThan(world.calls.indexOf(create));
    expect((JSON.parse(create.body!) as { facts: Record<string, unknown> }).facts["a:statedBy"]).toEqual({ "@id": world.ownCardUri });
  });
});

describe("People in your circles", () => {
  test("it lists the seeded people with their circle, and a click fills the field", async () => {
    await signedInApp();
    const user = userEvent.setup();
    const list = await screen.findByRole("region", { name: "People in your circles" });
    const person = await within(list).findByRole("button", { name: BEN });
    expect(within(list).getAllByRole("listitem").length).toBe(1);
    expect(list.textContent).toContain("Personal · Inner Circle");
    expect(principalField().value).toBe("");
    await user.click(person);
    expect(principalField().value).toBe(BEN);
    await user.click(screen.getByRole("button", { name: "Show card" }));
    await waitFor(() => expect(screen.getByTestId("contact-card-name").textContent).toBe("Ben Larsen"));
  });

  test("with no one placed it says so", async () => {
    await signedInApp({ benPlaced: false });
    const list = await screen.findByRole("region", { name: "People in your circles" });
    await waitFor(() => expect(within(list).getByText("No one is in your circles.")).toBeTruthy());
  });
});
