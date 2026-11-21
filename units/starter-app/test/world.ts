// The test world: a fake platform in place of the live one, the app's own style file, and the steps a person takes.
import { createFakePlatform, installFakePlatform, type FakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import { screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import type { UserEvent } from "@testing-library/user-event";
import type { StarterSettings } from "../src/settings";

export const TYPE = "https://types.example.test/base/t/Thing";
export const CREATE = "POST /base/vault/create-named";

/** The settings of a test app whose platform is the fake. */
export function settingsFor(fake: FakePlatform, over: Partial<StarterSettings> = {}): StarterSettings {
  return { appId: "things", appName: "Things", platformOrigin: fake.origin, idOrigin: fake.origin, vaultType: TYPE, vaultNameSuffix: "things", ...over };
}

/** A valid style file, as an app ships it at /style.tokens.json. */
export const STYLE_FILE = {
  version: 1,
  name: "Test style",
  mode: "light",
  palette: { accent: "#3b6fd4", paper: "#f1f5fe", ink: "#1c222b" },
  fonts: { sans: { family: "System Sans", source: "system" }, baseSizePx: 16, scaleRatio: 1.25 },
  shape: { radius: 10, shadow: "soft", density: "comfortable" },
  button: "filled",
  window: "card",
};

export interface World {
  fake: FakePlatform;
  /** Addresses asked of the app's own server (not the platform). */
  ownFiles: string[];
  undo(): void;
}

/**
 * A fake platform that answers every platform address, and a stand-in for the app's own server that answers its style file.
 *
 * @param styleFile what `/style.tokens.json` answers; `null` answers 404
 */
export function makeWorld(styleFile: unknown = STYLE_FILE): World {
  const fake = createFakePlatform();
  const ownFiles: string[] = [];
  const own = (async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    ownFiles.push(url);
    if (url.endsWith("/style.tokens.json") && styleFile !== null) return new Response(JSON.stringify(styleFile), { status: 200, headers: { "content-type": "application/json" } });
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  const undo = installFakePlatform(fake, { fallback: own });
  return { fake, ownFiles, undo };
}

/** Types the email and asks for the code. */
export async function askForCode(user: UserEvent, email: string): Promise<void> {
  await user.type(await screen.findByLabelText("Email"), email);
  await user.click(screen.getByRole("button", { name: "Send Code to Email" }));
  await screen.findByTestId("sign-in-code");
}

/** Signs in a person who already has an account: email, then the code the fake issued. */
export async function signIn(user: UserEvent, fake: FakePlatform, email: string): Promise<void> {
  await askForCode(user, email);
  await user.type(screen.getByTestId("sign-in-code"), fake.pendingCode(email) ?? "000000");
}

/** Waits until the frame is drawn. */
export async function ready(): Promise<void> {
  await waitFor(() => expect(document.querySelector('[data-stage="ready"]')).not.toBeNull(), { timeout: 5000 });
}

/**
 * axe-core on the page as it is now: one line per finding. Colour contrast is off because jsdom draws nothing
 * (src/contrast.test.ts works the ratios out, and the app's browser proof measures them in Chrome); `region` is off
 * because a dialog of a joined unit is drawn beside the page's landmarks.
 */
export const axeIds = async (): Promise<string[]> =>
  (await axe.run(document.body, { rules: { "color-contrast": { enabled: false }, region: { enabled: false } } })).violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`);

export function setWidth(width: number): void {
  Object.defineProperty(window, "innerWidth", { configurable: true, value: width });
  window.dispatchEvent(new Event("resize"));
}

import { expect } from "vitest";
