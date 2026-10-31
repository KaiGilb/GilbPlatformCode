// Sign-in goes to the identity origin; the card reads at the vault origin. Two settings, two doors.
import { describe, expect, test, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { App } from "./App";
import { SETTINGS_KEY, loadSettings } from "./settings";
import { TEST_SETTINGS, fakeCredential, keepSettings, okTransport, signedInApp } from "../test/helpers";

const VAULT = "https://vault.example.test";
const ID = "https://id.example.test";
const SPLIT = { ...TEST_SETTINGS, origin: VAULT, signInOrigin: ID };

describe("sign-in origin", () => {
  test("the code request (and the name check) go to the identity origin and the verify is handed it, not the vault origin", async () => {
    const s = await signedInApp({}, SPLIT);
    expect(s.sent.length).toBeGreaterThan(0);
    for (const url of s.sent) expect(url.startsWith(`${ID}/`)).toBe(true);
    expect(s.sent).toContain(`${ID}/base/auth/email/request-code`);
    expect(s.sent.some((u) => u.startsWith(VAULT))).toBe(false);
    expect(s.signInWithCode.mock.calls[0]![0]).toBe(ID);
  });

  test("the name checks of a first sign-in also go to the identity origin", async () => {
    const creds = await fakeCredential();
    const t = okTransport();
    keepSettings(SPLIT);
    creds.signInWithCode.mockResolvedValueOnce({ token: "", principal: "", needsVaultName: true, suggestedName: "ann" } as never);
    vi.stubGlobal("fetch", creds.world.fetch);
    render(<App makeSession={() => creds.credential} transport={t.transport} />);
    const user = userEvent.setup();
    await user.type(await screen.findByTestId("sign-in-email"), "ann@example.test");
    await user.click(screen.getByTestId("sign-in-send-code"));
    await user.type(await screen.findByTestId("sign-in-code"), "123456");
    await waitFor(() => expect(t.sent.length).toBeGreaterThan(1));
    for (const url of t.sent) expect(url.startsWith(`${ID}/`)).toBe(true);
    expect(t.sent.some((u) => u.startsWith(VAULT))).toBe(false);
  });

  test("after sign-in the card's reads go to the vault origin, never to the identity origin", async () => {
    const s = await signedInApp({}, SPLIT);
    await s.user.type(screen.getByLabelText(/Person's principal/), "https://holder.example.test/base/pben");
    await s.user.click(screen.getByRole("button", { name: "Show card" }));
    await waitFor(() => expect(s.world.calls.length).toBeGreaterThan(0));
    expect(s.world.calls.some((c) => c.url.startsWith(VAULT))).toBe(true);
    expect(s.world.calls.some((c) => c.url.startsWith(ID))).toBe(false);
  });

  test("old saved settings without a sign-in origin open the Settings screen and name the missing value, with no crash", async () => {
    const { signInOrigin: _gone, ...old } = TEST_SETTINGS;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(old));
    expect(loadSettings()!.signInOrigin).toBe("");
    // Opened through the Settings screen, since the old settings are not usable: the field is empty and saving names it.
    const user = userEvent.setup();
    render(<App makeSession={() => (null as never)} />);
    expect(screen.getByRole("form", { name: "Settings" })).toBeTruthy();
    expect((screen.getByLabelText("Sign-in origin (the platform's identity service)") as HTMLInputElement).value).toBe("");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(screen.getByRole("alert").textContent).toContain("The sign-in origin is needed.");
  });

  test("changing the sign-in origin while signed in signs out", async () => {
    const s = await signedInApp({}, SPLIT);
    await s.user.click(screen.getByRole("button", { name: "Settings" }));
    const field = screen.getByLabelText("Sign-in origin (the platform's identity service)") as HTMLInputElement;
    await s.user.clear(field);
    await s.user.type(field, "https://id2.example.test");
    await s.user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(s.invalidate).toHaveBeenCalledWith(true);
    expect(await screen.findByTestId("sign-in-email")).toBeTruthy();
    expect(loadSettings()!.signInOrigin).toBe("https://id2.example.test");
  });
});
