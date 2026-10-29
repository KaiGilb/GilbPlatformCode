// Shared by the tests: settings pointing at the fake platform, a credential the sign-in fills, and the walk from first run to the card screen.
import { expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { App } from "../src/App";
import { SETTINGS_KEY, type AppSettings } from "../src/settings";
import { BASE, GEO, ONTOLOGY, createWorld, type WorldOptions } from "./world";

export const TEST_SETTINGS: AppSettings = {
  origin: BASE,
  ontologyOrigin: ONTOLOGY,
  geoOrigin: GEO,
  systemVaultHosts: "ontology.platform.example.test",
  systemHostLabels: "id, ontology",
  ontologyApiOrigin: "",
  ontologyApiOriginRaw: "",
  publicCorpusOrigin: "",
  localRigHosts: "",
  minOntologyQuery: "",
  vocabTypeBatchRevisions: "",
};

export function keepSettings(s: AppSettings = TEST_SETTINGS) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

/** The world's fake credential, with the sign-in's code step and the sign-out counted. Signing in with a code adopts the world's session. */
export async function fakeCredential(options: WorldOptions = {}) {
  const world = await createWorld(options);
  const signInWithCode = vi.fn(async (_origin: string, _email: string, _code: string) => ({ token: "t", principal: "p", needsVaultName: false }));
  const invalidate = vi.fn();
  const credential = Object.assign(world.session, { signInWithCode, invalidate }) as unknown as SessionCredential;
  return { world, credential, signInWithCode, invalidate };
}

/** A transport that answers every sign-in request with 200 and records the URLs. */
export function okTransport() {
  const sent: string[] = [];
  const transport = async (url: string) => {
    sent.push(url);
    return { status: 200, json: async () => ({}) } as never;
  };
  return { transport: transport as never, sent };
}

export async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByTestId("sign-in-email"), "ann@example.test");
  await user.click(screen.getByTestId("sign-in-send-code"));
  // Six digits submit the code by themselves.
  await user.type(await screen.findByTestId("sign-in-code"), "123456");
  await waitFor(() => expect(screen.getByRole("region", { name: "Card" })).toBeTruthy());
}

/** Render the app with saved settings over the world's fake `fetch`, sign in with an email and a code, and return the user. */
export async function signedInApp(options: WorldOptions = {}, settings: AppSettings = TEST_SETTINGS) {
  const creds = await fakeCredential(options);
  vi.stubGlobal("fetch", creds.world.fetch);
  keepSettings(settings);
  const t = okTransport();
  const view = render(<App makeSession={() => creds.credential} transport={t.transport} />);
  const user = userEvent.setup();
  await signIn(user);
  return { ...view, user, ...creds, ...t };
}
