// The placeholder screen. A new app replaces src/records/RecordsHome.tsx with its own record screens and deletes this file.
import { render, screen } from "@testing-library/react";
import type { StarterContext } from "@kaigilb/gilbplatformcode-starter-app";
import { describe, expect, it } from "vitest";
import { RecordsHome } from "../src/records/RecordsHome";

const ctx = (vault: StarterContext["vault"]): StarterContext => ({
  vault,
  principal: "https://id.example.test/base/p/1",
  actor: "https://ann.example.test/vault",
  signal: new AbortController().signal,
  credential: {} as StarterContext["credential"],
  vaultRefused: () => undefined,
});

describe("RecordsHome", () => {
  it("in the person's own vault it says the vault is ready, that there are no records, and which vault it is", () => {
    render(<RecordsHome ctx={ctx({ vaultId: "https://annthings.example.test/vault", label: "annthings", yours: true, canWrite: true })} />);
    expect(screen.getByRole("heading", { name: "Your vault is ready" })).toBeTruthy();
    expect(screen.getByText("This app has no records yet.")).toBeTruthy();
    expect(screen.getByTestId("vault-address").textContent).toBe("Vault: https://annthings.example.test/vault");
  });

  it("in a vault shared for editing it says so", () => {
    render(<RecordsHome ctx={ctx({ vaultId: "https://benthings.example.test/vault", label: "benthings", yours: false, canWrite: true })} />);
    expect(screen.getByRole("heading", { name: "You are in benthings" })).toBeTruthy();
    expect(screen.getByText("This vault was shared with you. You can add and change records in it.")).toBeTruthy();
  });

  it("in a vault shared for viewing it says the records cannot be changed", () => {
    render(<RecordsHome ctx={ctx({ vaultId: "https://benthings.example.test/vault", label: "benthings", yours: false, canWrite: false })} />);
    expect(screen.getByText("This vault was shared with you. You can see its records but not change them.")).toBeTruthy();
  });
});
