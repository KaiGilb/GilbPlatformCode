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

  test("a vault list problem is shown", () => {
    const sentence = "Could not reach your vault list. The browser blocked the request or the network failed.";
    render(
      <VaultGate vaults={vaults} search="" onSignOut={() => undefined} problem={sentence}>
        {() => null}
      </VaultGate>,
    );
    const line = screen.getByTestId("vaults-problem");
    expect(line.textContent).toBe(sentence);
    expect(line.getAttribute("role")).toBe("alert");
    expect(screen.queryByText("This person has no vault they can write to.")).toBeNull();
  });

  test("a read-only list says how many can be read and none can be written", () => {
    render(
      <VaultGate
        vaults={[
          { vaultId: R, modes: ["read"] },
          { vaultId: "https://also.gilb.com/base", modes: ["read"] },
          { vaultId: "https://closed.gilb.com/base", modes: ["append"] },
        ]}
        search=""
        onSignOut={() => undefined}
      >
        {() => null}
      </VaultGate>,
    );
    expect(screen.getByText("You can read 2 vault(s) but write to none.")).toBeTruthy();
    expect(screen.queryByText("This person has no vault they can write to.")).toBeNull();
  });

  test("an empty list keeps the no-vault line", () => {
    render(
      <VaultGate vaults={[]} search="" onSignOut={() => undefined}>
        {() => null}
      </VaultGate>,
    );
    expect(screen.getByText("This person has no vault they can write to.")).toBeTruthy();
    expect(screen.queryByText(/You can read/)).toBeNull();
    expect(screen.queryByTestId("vaults-problem")).toBeNull();
  });
});
