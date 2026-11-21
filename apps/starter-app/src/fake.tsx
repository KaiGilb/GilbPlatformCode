// `npm run dev:fake`: the platform is a fake that lives in this page. Nothing leaves the page, and nothing is kept:
// every load starts with the same three people and no vault for the app. Never part of a build (see main.tsx).
import type { ReactNode } from "react";
import { createFakePlatform, installFakePlatform, type FakePlatform } from "@kaigilb/gilbplatformcode-fake-platform";
import type { StarterSettings } from "@kaigilb/gilbplatformcode-starter-app";

export const FAKE_ORIGIN = "https://fake.test";
/** The people the fake starts with. Each has an account; none has a vault for the app yet. Three, so one can share with two. */
export const FAKE_PEOPLE = ["ann@example.test", "ben@example.test", "cara@example.test"] as const;
export const FAKE_CODE = "000000";

export interface FakeStart {
  fake: FakePlatform;
  /** The app's settings, pointed at the fake. */
  settings: StarterSettings;
  /** What the sign-in page says in this mode. */
  note: ReactNode;
}

/**
 * Makes the fake platform, sends every platform request of this page to it, and seeds two people.
 *
 * @param settings the app's own settings; the names are kept, the origins and the vault type become the fake's
 * @returns the fake, the settings to start with, and the note for the sign-in page
 */
export function startFake(settings: StarterSettings): FakeStart {
  const fake = createFakePlatform({ origin: FAKE_ORIGIN, code: FAKE_CODE });
  installFakePlatform(fake);
  for (const email of FAKE_PEOPLE) fake.seedPerson({ email, vaultName: email.split("@")[0]! });
  (window as unknown as { __fake?: FakePlatform }).__fake = fake; // for the browser proof and the console
  return {
    fake,
    settings: {
      ...settings,
      platformOrigin: FAKE_ORIGIN,
      idOrigin: FAKE_ORIGIN,
      systemVaultHosts: [],
      // A stand-in on the fake's own host, used only while settings.ts names no type. It is not a GilbVeda type and
      // never reaches a real platform: the fake accepts any address of this form.
      vaultType: settings.vaultType || `${FAKE_ORIGIN}/base/t/Thing`,
      styleSheetUrl: "",
    },
    note: (
      <p className="app-fake-note" data-testid="fake-note">
        Fake platform: nothing leaves this page and nothing is kept. Sign in as {FAKE_PEOPLE[0]}, {FAKE_PEOPLE[1]} or {FAKE_PEOPLE[2]} with the code {FAKE_CODE}.
      </p>
    ),
  };
}
