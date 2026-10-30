// The circles list says what it waits for and why it stops.
import { describe, expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { signedInApp } from "../test/helpers";

const text = () => screen.getByLabelText("People in your circles").textContent ?? "";
const row = (over: Record<string, unknown>) => ({ "@id": "https://vault.example.test/base/e/v1", vaultId: "v1", name: "Ann", partOf: null, parentAmbiguous: false, modes: ["read", "write"], isLandingVault: false, ...over });

describe("circles list states", () => {
  test("1: while the vault list is being read it says so", async () => {
    await signedInApp({ bareSession: true, vaultsHold: true });
    await waitFor(() => expect(text()).toContain("Reading your vaults."));
    expect(text()).not.toContain("Reading your circles.");
  });

  test("2: a failed vault list names the error", async () => {
    await signedInApp({ bareSession: true, vaultsStatus: 401 });
    await waitFor(() => expect(text()).toContain("Your vault list could not be read: NotSignedInError: "));
    expect(text()).not.toContain("Reading your circles.");
  });

  test("3a: an empty vault list says there are no vaults", async () => {
    await signedInApp({ bareSession: true, vaultRows: [] });
    await waitFor(() => expect(text()).toContain("The platform answered with no vaults for you."));
  });

  test("3b: vaults with none marked as own list each one", async () => {
    await signedInApp({ bareSession: true, vaultRows: [row({}), row({ vaultId: "v2", name: null, modes: ["read"] })] });
    await waitFor(() => expect(text()).toContain("None of your 2 vaults is marked as your own (landing) vault: Ann (read, write), v2 (read)"));
  });

  test("4: a landing vault is named above the list", async () => {
    await signedInApp({ bareSession: true, vaultRows: [row({ isLandingVault: true })] });
    await waitFor(() => expect(text()).toContain("Your own vault: Ann."));
  });
});
