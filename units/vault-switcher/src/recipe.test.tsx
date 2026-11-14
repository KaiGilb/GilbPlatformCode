// The README's "Several vaults: let the person switch" recipe, run: the hook behind the chip and sheet.
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import type { KeyValueStore } from "@kaigilb/gilbplatformcode-vault-list";
import { useVaultChoice, VaultSwitcher, type ListedVaultRow } from "./index";

const OWN = "https://ann.example.test/vault";
const BOB = "https://bob.example.test/vault";
const listed: ListedVaultRow[] = [
  { vaultId: OWN, modes: ["read", "write"], name: "My teapots" },
  { vaultId: BOB, modes: ["read"], name: "Bob's teapots" },
];

function Header({ store }: { store: KeyValueStore }) {
  const vaults = useVaultChoice({ listed, ownVaultId: OWN, principal: "ann", appKey: "teapots", store });
  const rows = vaults.options.map((o) => ({ vaultId: o.vaultId, name: o.label, modes: o.viewOnly ? ["read"] : ["read", "write"] }));
  return (
    <>
      <VaultSwitcher current={vaults.current} load={async () => rows} isYours={(v) => v.vaultId === OWN} onPick={(v) => vaults.switchTo(v.vaultId)} />
      <p data-testid="open">{vaults.current.vaultId}</p>
      {vaults.canWrite ? <button type="button">Add</button> : <span>View only</span>}
    </>
  );
}

describe("the recipe", () => {
  it("picking a shared vault in the sheet opens it, shows it view only, and keeps the choice", async () => {
    const kept = new Map<string, string>();
    const store: KeyValueStore = { get: (k) => kept.get(k) ?? null, set: (k, v) => void kept.set(k, v), remove: (k) => void kept.delete(k) };
    const user = userEvent.setup();
    render(<Header store={store} />);
    expect(screen.getByTestId("open").textContent).toBe(OWN);
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Change vault/ }));
    await user.click(await screen.findByRole("button", { name: /Bob's teapots/ }));
    expect(screen.getByTestId("open").textContent).toBe(BOB);
    expect(screen.getByText("View only")).toBeTruthy();
    expect(kept.get("teapots:ann:current")).toBe(BOB);
  });
});
