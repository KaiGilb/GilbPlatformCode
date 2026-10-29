// Shared by the tests: settings pointing at the fake vault, a fake credential, and the walk from first run to a drawn card.
import { expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { App } from "../src/App";
import { SETTINGS_KEY, type AppSettings } from "../src/settings";
import { fakeSession } from "./fakeSession";
import { ONTOLOGY, ORIGIN, VAULT } from "./fakeVault";

export const TEST_SETTINGS: AppSettings = {
  origin: ORIGIN,
  ontologyOrigin: ONTOLOGY,
  systemVaultHosts: "ontology.platform.example.test, vedas.example.test",
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

/** A credential the sign-in "fills": signing in with a code adopts the fake session (one vault, read and write); signing out is counted. */
export function fakeCredential() {
  const fake = fakeSession({ vaults: [{ vaultId: VAULT, modes: ["read", "write"] }] });
  const signInWithCode = vi.fn(async (_origin: string, _email: string, _code: string) => ({ token: "t", principal: "p", needsVaultName: false }));
  const invalidate = vi.fn();
  const credential = Object.assign(fake.session, { signInWithCode, invalidate }) as unknown as SessionCredential;
  return { credential, fake, signInWithCode, invalidate };
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

/** Render the app with saved settings, sign in with an email and a code, and return the user. */
export async function signedInApp(creds = fakeCredential()) {
  keepSettings();
  const t = okTransport();
  const view = render(<App makeSession={() => creds.credential} transport={t.transport} />);
  const user = userEvent.setup();
  await signIn(user);
  return { ...view, user, ...creds, ...t };
}

export async function signIn(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByTestId("sign-in-email"), "ann@example.test");
  await user.click(screen.getByTestId("sign-in-send-code"));
  // Six digits submit the code by themselves.
  await user.type(await screen.findByTestId("sign-in-code"), "123456");
  await waitFor(() => expect(screen.getByRole("region", { name: "Card" })).toBeTruthy());
}
