import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { VaultSwitcher } from "./index";
import type { VaultListItem } from "@kaigilb/gilbplatformcode-vault-list";

const A = "https://a.example.test/vault";
const B = "https://b.example.test/vault";
const C = "https://c.example.test/vault";
const mine: VaultListItem = { vaultId: A, name: "Mine", modes: ["read", "write"] };
const theirs: VaultListItem = { vaultId: B, name: "Theirs", modes: ["read"] };
const nameless: VaultListItem = { vaultId: C, modes: ["read", "write"] };

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(over: Partial<Parameters<typeof VaultSwitcher<VaultListItem>>[0]> = {}) {
  const load = vi.fn(async () => [theirs, nameless, mine] as readonly VaultListItem[]);
  const onPick = vi.fn();
  const props = { current: { vaultId: A, label: "Mine" }, load, isYours: (v: VaultListItem) => v.vaultId === A, onPick, ...over };
  const view = render(<VaultSwitcher {...props} />);
  const chip = screen.getAllByRole("button")[0]!;
  return { load, onPick, chip, user: userEvent.setup(), ...view };
}

describe("the chip", () => {
  it("is a button with the open vault's name, an accessible name, aria-haspopup and aria-expanded", async () => {
    const { chip, user } = setup({ icon: <svg data-testid="art" /> });
    expect(chip.textContent).toContain("Mine");
    expect(screen.getByTestId("art")).toBeTruthy();
    expect(chip.getAttribute("aria-label")).toBe("Vault Mine. Change vault");
    expect(chip.getAttribute("aria-haspopup")).toBe("dialog");
    expect(chip.getAttribute("aria-expanded")).toBe("false");
    await user.click(chip);
    expect(chip.getAttribute("aria-expanded")).toBe("true");
  });

  it("is drawn for a single vault too (the app decides whether to render it)", async () => {
    const { chip, user } = setup({ load: vi.fn(async () => [mine]) });
    await user.click(chip);
    const rows = within(await screen.findByRole("list")).getAllByRole("button");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.textContent).toContain("Mine");
  });
});

describe("loading", () => {
  it("calls load each time the sheet opens", async () => {
    const { load, chip, user } = setup();
    expect(load).toHaveBeenCalledTimes(0);
    await user.click(chip);
    await screen.findByText("Theirs");
    expect(load).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    await user.click(chip);
    await screen.findByText("Theirs");
    expect(load).toHaveBeenCalledTimes(2);
  });

  it("shows the loading text while the list is pending", async () => {
    const d = deferred<readonly VaultListItem[]>();
    const { chip, user } = setup({ load: () => d.promise });
    await user.click(chip);
    expect(screen.getByRole("status").textContent).toBe("Looking for your vaults…");
    await act(async () => d.resolve([mine]));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("shows the error text and Try again, which loads again and then shows the list", async () => {
    const load = vi.fn<() => Promise<readonly VaultListItem[]>>().mockRejectedValueOnce(new Error("secret detail")).mockResolvedValue([mine, theirs]);
    const { chip, user } = setup({ load });
    await user.click(chip);
    expect((await screen.findByRole("alert")).textContent).toBe("Could not list your vaults.");
    expect(screen.queryByText(/secret detail/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(load).toHaveBeenCalledTimes(2);
    expect(await screen.findByText("Theirs")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("shows the none text for an empty list", async () => {
    const { chip, user } = setup({ load: async () => [] });
    await user.click(chip);
    expect(await screen.findByText("Vaults shared with you will appear here.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
});

describe("the rows", () => {
  it("lists own first, then shared, each with its second line; a nameless /vault vault shows its host label", async () => {
    const { chip, user } = setup();
    await user.click(chip);
    const list = await screen.findByRole("list");
    const rows = within(list).getAllByRole("button");
    expect(rows.map((r) => r.querySelector(".vsw-row-name")?.textContent)).toEqual(["Mine", "Theirs", "c"]);
    expect(rows.map((r) => r.querySelector(".vsw-row-line")?.textContent)).toEqual(["Yours", "Shared with you · View only", "Shared with you"]);
    expect(within(list).queryByText("vault")).toBeNull();
  });

  it("marks the current vault's row with aria-current, and only that row", async () => {
    const { chip, user } = setup({ current: { vaultId: B, label: "Theirs" } });
    await user.click(chip);
    const rows = within(await screen.findByRole("list")).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([null, "true", null]);
  });

  it("compares the vaultId exactly (a trailing slash is another vault)", async () => {
    const { chip, user } = setup({ current: { vaultId: `${B}/`, label: "Theirs" } });
    await user.click(chip);
    const rows = within(await screen.findByRole("list")).getAllByRole("button");
    expect(rows.map((r) => r.getAttribute("aria-current"))).toEqual([null, null, null]);
  });
});

describe("picking", () => {
  it("a row that is not the open vault calls onPick once with the original object, and closes the sheet", async () => {
    const { chip, user, onPick } = setup();
    await user.click(chip);
    await user.click(await screen.findByRole("button", { name: /Theirs/ }));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick.mock.calls[0]![0]).toBe(theirs);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(chip.getAttribute("aria-expanded")).toBe("false");
  });

  it("the open vault's row only closes the sheet", async () => {
    const { chip, user, onPick } = setup();
    await user.click(chip);
    const rows = within(await screen.findByRole("list")).getAllByRole("button");
    await user.click(rows.find((r) => r.getAttribute("aria-current") === "true")!);
    expect(onPick).not.toHaveBeenCalled();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});

describe("closing", () => {
  it("Escape closes, and focus returns to the chip", async () => {
    const { chip, user } = setup();
    await user.click(chip);
    await screen.findByText("Theirs");
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(document.activeElement).not.toBe(chip);
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(chip);
  });
});

describe("a slow answer", () => {
  it("an older load that answers after a newer one does not overwrite it", async () => {
    const d1 = deferred<readonly VaultListItem[]>();
    const d2 = deferred<readonly VaultListItem[]>();
    const load = vi.fn<() => Promise<readonly VaultListItem[]>>().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const { chip, user } = setup({ load });
    await user.click(chip); // load #1 pending
    await user.keyboard("{Escape}");
    await user.click(chip); // load #2 pending
    expect(load).toHaveBeenCalledTimes(2);
    await act(async () => d2.resolve([{ vaultId: B, name: "Bee", modes: ["write"] }]));
    expect(screen.getByText("Bee")).toBeTruthy();
    await act(async () => d1.resolve([{ vaultId: C, name: "Ay", modes: ["write"] }]));
    expect(screen.getByText("Bee")).toBeTruthy();
    expect(screen.queryByText("Ay")).toBeNull();
  });

  it("an answer after the sheet was closed draws nothing, and the next open starts from loading", async () => {
    const d1 = deferred<readonly VaultListItem[]>();
    const d2 = deferred<readonly VaultListItem[]>();
    const load = vi.fn<() => Promise<readonly VaultListItem[]>>().mockReturnValueOnce(d1.promise).mockReturnValueOnce(d2.promise);
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { chip, user } = setup({ load });
    await user.click(chip);
    await user.keyboard("{Escape}");
    await act(async () => d1.resolve([mine, theirs]));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Theirs")).toBeNull();
    await user.click(chip);
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("Theirs")).toBeNull();
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});

describe("words", () => {
  it("replace the title, the chip's name, the close button and the second line", async () => {
    const { chip, user } = setup({
      words: { title: "Velg hvelv", changeVault: (l) => `Hvelv ${l}. Bytt`, yours: "Din", shared: "Delt", viewOnly: "Kun lesing", close: "Lukk" },
    });
    expect(chip.getAttribute("aria-label")).toBe("Hvelv Mine. Bytt");
    await user.click(chip);
    expect(await screen.findByRole("dialog", { name: "Velg hvelv" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lukk" })).toBeTruthy();
    expect(screen.getByText("Din")).toBeTruthy();
    expect(screen.getByText("Delt · Kun lesing")).toBeTruthy();
  });
});
