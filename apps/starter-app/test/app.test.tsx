// The app as it is shipped: its settings, its style file, its set-up page, and the whole app run against the fake platform.
// Every name comes from src/settings.ts, so these tests still hold after the app is renamed.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent, { type UserEvent } from "@testing-library/user-event";
import type { Root } from "react-dom/client";
import { settingsProblems } from "@kaigilb/gilbplatformcode-starter-app";
import { validateStyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { boot } from "../src/App";
import { FAKE_CODE, FAKE_ORIGIN, startFake } from "../src/fake";
import { SECTIONS } from "../src/sections";
import { SETTINGS } from "../src/settings";

/** A file of the app, read from the app folder the tests run in. */
const file = (rel: string) => readFileSync(resolve(process.cwd(), rel), "utf8");
const TYPE = "https://types.example.test/base/t/Thing";
const NO_TYPE = "vaultType must be the full address of the type each person's vault represents.";
const ANN = `ann${SETTINGS.vaultNameSuffix}`;
const BEN = `ben${SETTINGS.vaultNameSuffix}`;

let roots: Root[];
let asked: string[];
let host: HTMLElement;

/** The app's own server: it answers the files in public/ and nothing else. */
const ownServer = (async (input: RequestInfo | URL) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  asked.push(url);
  if (url === "/style.tokens.json") return new Response(file("public/style.tokens.json"), { status: 200, headers: { "content-type": "application/json" } });
  return new Response("not found", { status: 404 });
}) as typeof fetch;

function start(run: () => Root): void {
  act(() => {
    roots.push(run());
  });
}

beforeEach(() => {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
  roots = [];
  asked = [];
  host = document.body.appendChild(document.createElement("div"));
  vi.stubGlobal("fetch", ownServer);
});
afterEach(() => {
  act(() => roots.forEach((r) => r.unmount()));
});

/** Signs in on the card and waits for the frame with that person's own vault open. */
async function signIn(user: UserEvent, email: string, ownVault: string): Promise<void> {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send Code to Email" }));
  await user.type(await screen.findByTestId("sign-in-code"), FAKE_CODE);
  await screen.findByRole("button", { name: `Vault ${ownVault}. Change vault` }, { timeout: 5000 });
}

describe("what the app ships", () => {
  it("names GilbPlatform production, and its settings lack nothing but, at most, the vault type a new app must set", () => {
    expect(SETTINGS.platformOrigin).toBe("https://gilb.com");
    expect(SETTINGS.idOrigin).toBe("https://id.gilb.com");
    expect(settingsProblems({ ...SETTINGS, vaultType: "" })).toEqual([NO_TYPE]);
    expect(settingsProblems({ ...SETTINGS, vaultType: SETTINGS.vaultType || TYPE })).toEqual([]);
  });

  it("ships a style file at /style.tokens.json that the style runtime accepts, with a light and a dark palette", () => {
    const sheet = validateStyleSheet(JSON.parse(file("public/style.tokens.json")));
    if (!sheet.ok) throw new Error(sheet.errors.join("; "));
    expect(sheet.value.palette.accent).toMatch(/^#[0-9a-f]{6}$/i);
    expect(sheet.value.dark?.paper).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("the page links the app's style sheet, fits a phone's width, and Tailwind scans the installed units", () => {
    const html = file("index.html");
    expect(html).toContain('<link rel="stylesheet" href="/styles/app.css" />');
    expect(html).toContain('name="viewport" content="width=device-width, initial-scale=1');
    expect(file("styles/app.css")).toContain('@source "../node_modules/@kaigilb/*/src/**/*.{ts,tsx}";');
  });

  it("has at least one section, each with its own id", () => {
    expect(SECTIONS.length).toBeGreaterThan(0);
    expect(new Set(SECTIONS.map((s) => s.id)).size).toBe(SECTIONS.length);
  });
});

describe("before the vault type is set", () => {
  it("says which setting is missing, shows no sign-in, and asks no server anything", () => {
    start(() => boot({ ...SETTINGS, vaultType: "" }, host));
    const page = screen.getByRole("alert");
    expect(page.textContent).toContain("This app is not set up yet");
    expect(page.textContent).toContain(NO_TYPE);
    expect(asked).toEqual([]);
    expect(screen.queryByLabelText("Email")).toBeNull();
  });
});

describe("the whole app on the fake platform", () => {
  it("Ann signs in and gets her vault, shares it with Ben, signs out; Ben signs in, gets his own, and opens hers", async () => {
    const fake = startFake(SETTINGS);
    expect(fake.settings.platformOrigin).toBe(FAKE_ORIGIN);
    expect(fake.settings.appName).toBe(SETTINGS.appName);
    const user = userEvent.setup();
    start(() => boot(fake.settings, host, fake.note));

    expect((await screen.findByTestId("fake-note")).textContent).toContain(`Sign in as ann@example.test, ben@example.test or cara@example.test with the code ${FAKE_CODE}.`);
    expect(screen.getByRole("heading", { name: SETTINGS.appName })).toBeTruthy(); // the sign-in card carries the app's name
    await signIn(user, "ann@example.test", ANN);
    await waitFor(() => expect(document.getElementById("gilb-style")?.textContent).toContain("--accent:")); // the shipped style is applied
    expect(asked).toEqual(["/style.tokens.json"]);

    await user.click(screen.getByRole("button", { name: "Share" }));
    const sheet = await screen.findByRole("dialog", { name: `Share ${ANN}` });
    await user.type(within(sheet).getByLabelText("Their vault name"), "ben");
    await user.click(within(sheet).getByRole("radio", { name: "Can edit" }));
    await user.click(within(sheet).getByRole("button", { name: "Share" }));
    await within(sheet).findByRole("button", { name: /^Remove / }); // Ben is in the list of who has access
    await user.click(within(sheet).getByRole("button", { name: "Close" }));

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await signIn(user, "ben@example.test", BEN);

    await user.click(screen.getByRole("button", { name: `Vault ${BEN}. Change vault` }));
    const chooser = await screen.findByRole("dialog", { name: "Choose a vault" });
    const hers = await within(chooser).findByRole("button", { name: new RegExp(ANN) });
    expect(hers.textContent).toBe(`${ANN}Shared with you`); // edit access: not "View only"
    await user.click(hers);
    await screen.findByRole("button", { name: `Vault ${ANN}. Change vault` });

    const appVaults = [...fake.fake.state.vaults.values()].filter((v) => v.represents === fake.settings.vaultType).map((v) => v.name);
    expect(appVaults.sort()).toEqual([ANN, BEN]); // one vault each, no more
    expect(fake.fake.calls.count("POST /base/vault/create-named")).toBe(2);
    expect(fake.fake.calls.count("POST /base/auth/sign-out")).toBe(1);
    fake.fake.assertClean();
  }, 20000);
});
