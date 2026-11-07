import { describe, expect, test, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { VaultGate, chooseVault } from "../src/vaultChoice";

const A = "https://alpha.gilb.com/base";
const B = "https://beta.gilb.com/base";
const R = "https://readonly.gilb.com/base";
const vaults = [
  { vaultId: B, modes: ["read", "write"] },
  { vaultId: A, modes: ["read", "write"] },
  { vaultId: R, modes: ["read"] },
];

function gate(search: string) {
  const built = vi.fn();
  render(
    <VaultGate vaults={vaults} search={search} onSignOut={() => undefined}>
      {(v, name) => {
        built(v.vaultId);
        return (
          <div>
            <p data-testid="vault-line">{`Vault: ${name} (${v.vaultId})`}</p>
            <button>Add</button>
          </div>
        );
      }}
    </VaultGate>,
  );
  return built;
}

describe("vault choice (live mode)", () => {
  test("no ?vault: the chooser, sorted by name, writable only, no add buttons, nothing built", () => {
    const built = gate("");
    expect(screen.getByText("Choose the vault to use:")).toBeTruthy();
    const links = screen.getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual(["alpha", "beta"]);
    expect(links.map((l) => l.getAttribute("href"))).toEqual(["?vault=alpha", "?vault=beta"]);
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.queryByTestId("vault-line")).toBeNull();
    expect(built).not.toHaveBeenCalled();
  });

  test("?vault=beta picks beta even though alpha sorts first and beta is first in the list", () => {
    const built = gate("?vault=beta");
    expect(built).toHaveBeenCalledWith(B);
    expect(screen.getByTestId("vault-line").textContent).toBe(`Vault: beta (${B})`);
    expect(screen.queryByText("Choose the vault to use:")).toBeNull();
  });

  test("?vault=<full id> works", () => {
    const built = gate(`?vault=${encodeURIComponent(A)}`);
    expect(built).toHaveBeenCalledWith(A);
    expect(screen.getByTestId("vault-line").textContent).toBe(`Vault: alpha (${A})`);
  });

  test("an unknown name: the chooser plus the no-vault line, nothing built", () => {
    const built = gate("?vault=nope");
    expect(screen.getByText("No writable vault named nope.")).toBeTruthy();
    expect(screen.getByText("Choose the vault to use:")).toBeTruthy();
    expect(built).not.toHaveBeenCalled();
  });

  test("a read-only vault cannot be chosen by name", () => {
    const built = gate("?vault=readonly");
    expect(screen.getByText("No writable vault named readonly.")).toBeTruthy();
    expect(built).not.toHaveBeenCalled();
  });

  test("chooseVault does not reorder the caller's list", () => {
    chooseVault(vaults, "");
    expect(vaults[0]!.vaultId).toBe(B);
  });
});
