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
  it("in the person's own vault it reads, word for word, the text Kai approved on 2026-11-21, and then which vault it is", () => {
    render(<RecordsHome ctx={ctx({ vaultId: "https://annthings.example.test/vault", label: "annthings", yours: true, canWrite: true })} />);
    const lines = [...screen.getByTestId("records-home").children].map((e) => `${e.tagName} ${e.textContent}`);
    expect(lines).toEqual([
      "H1 Your app, your users' data",
      "P GilbPlatform keeps the app you build apart from your users' data.",
      "P When a user signs in to your app, a vault is made for them. There they keep, own and control their own data.",
      "P Your app reads and writes its records in that user's vault.",
      "P A user can share their vault with other users. Those users sign in to your app and see the records shared with them.",
      "H2 This is only the beginning",
      "P What you see now is our default starting point for an app: sign-in, a vault for each user, and sharing. We shape the rest to your needs.",
      "P How your finished app looks, what it does and how good it is are built after we have carefully understood what each of your stakeholders needs.",
      "P This app has no records yet.",
      "P Your vault: https://annthings.example.test/vault",
    ]);
    expect(screen.getByRole("heading", { level: 1, name: "Your app, your users' data" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 2, name: "This is only the beginning" })).toBeTruthy();
    expect(screen.getByTestId("vault-address").textContent).toBe("Your vault: https://annthings.example.test/vault");
  });

  it("in a vault shared for editing it says so", () => {
    render(<RecordsHome ctx={ctx({ vaultId: "https://benthings.example.test/vault", label: "benthings", yours: false, canWrite: true })} />);
    expect(screen.getByRole("heading", { name: "You are in benthings" })).toBeTruthy();
    expect(screen.getByText("This vault was shared with you. You can add and change records in it.")).toBeTruthy();
    // Not the person's own vault: the screen is as it was, and does not call the vault theirs.
    expect(screen.getByTestId("vault-address").textContent).toBe("Vault: https://benthings.example.test/vault");
    expect(screen.getByTestId("records-home").textContent).not.toContain("Your vault");
    expect(screen.queryByRole("heading", { level: 2 })).toBeNull();
  });

  it("in a vault shared for viewing it says the records cannot be changed", () => {
    render(<RecordsHome ctx={ctx({ vaultId: "https://benthings.example.test/vault", label: "benthings", yours: false, canWrite: false })} />);
    expect(screen.getByText("This vault was shared with you. You can see its records but not change them.")).toBeTruthy();
  });
});
