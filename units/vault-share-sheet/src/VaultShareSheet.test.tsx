import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { NO_CONTROL } from "@kaigilb/gilbplatformcode-vault-access";
import { act, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultShareSheet, defaultWords, useVaultShare, type AccessRow, type AccessView, type ShareApi } from "./index";

const VAULT = "https://ann.fake.test/vault";
const row = (principal: string, label: string, level: "edit" | "view" = "view", owner = false): AccessRow => ({ principal, label, note: owner ? null : `from ${label}`, level, owner });
const OWNER = row("p-ann", "Ann", "edit", true);
const BEN = row("p-ben", "Ben", "edit");
const CAT = row("p-cat", "Cat", "view");
const view = (rows: AccessRow[], owner: AccessRow | null = OWNER): AccessView => ({ controlled: true, owner, rows });

/** An injected api that records its calls. `current` is what the next load answers. */
function makeApi(initial: AccessView, over: Partial<ShareApi> = {}) {
  const state = { current: initial };
  const api = {
    load: vi.fn<ShareApi["load"]>(async () => state.current),
    share: vi.fn<ShareApi["share"]>(async () => {}),
    unshare: vi.fn<ShareApi["unshare"]>(async () => {}),
  };
  Object.assign(api, over);
  return { api, state };
}
function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const shown = async (ui: React.ReactElement) => {
  const r = render(ui);
  await waitFor(() => expect(screen.queryByText(defaultWords.loading)).toBeNull());
  return r;
};

beforeEach(() => setBaseOrigin("https://fake.test"));
afterEach(() => resetBaseOrigin());

describe("busy", () => {
  it("8. disables the field, the radios, Share and every row button while a request is in flight, and a second submit sends no second request", async () => {
    const d = deferred();
    const { api } = makeApi(view([BEN, CAT]), { share: vi.fn(() => d.promise) });
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    await userEvent.type(screen.getByLabelText(defaultWords.nameLabel), "dan");
    await userEvent.click(screen.getByRole("button", { name: defaultWords.share }));
    await waitFor(() => expect(api.share).toHaveBeenCalledTimes(1));
    expect(api.share).toHaveBeenCalledWith(VAULT, "https://dan.fake.test/vault", "view");
    expect((screen.getByRole("button", { name: defaultWords.share }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText(defaultWords.nameLabel) as HTMLInputElement).disabled).toBe(true);
    for (const radio of screen.getAllByRole("radio")) expect((radio as HTMLInputElement).disabled).toBe(true);
    for (const name of ["Remove Ben", "Remove Cat"]) expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.submit(screen.getByLabelText(defaultWords.nameLabel).closest("form")!);
    fireEvent.submit(screen.getByLabelText(defaultWords.nameLabel).closest("form")!);
    expect(api.share).toHaveBeenCalledTimes(1);
    await act(async () => d.resolve());
    await waitFor(() => expect((screen.getByRole("button", { name: defaultWords.share }) as HTMLButtonElement).disabled).toBe(false));
    expect(api.share).toHaveBeenCalledTimes(1);
  });

  it("8. the hook ignores a second submit and a remove while one request is in flight, even in the same tick", async () => {
    const d = deferred();
    const { api } = makeApi(view([BEN]), { share: vi.fn(() => d.promise) });
    const { result } = renderHook(() => useVaultShare(VAULT, api));
    await waitFor(() => expect(result.current.state.status).toBe("ready"));
    await act(async () => {
      void result.current.submit("dan", "edit");
      void result.current.submit("dan", "edit");
      void result.current.remove("p-ben");
    });
    expect(api.share).toHaveBeenCalledTimes(1);
    expect(api.unshare).not.toHaveBeenCalled();
    expect(result.current.state.busy).toBe(true);
    await act(async () => d.resolve());
    await waitFor(() => expect(result.current.state.busy).toBe(false));
  });
});

describe("closing", () => {
  it("9. Escape closes, once; the Close button closes; a click on the backdrop closes; a click inside does not", async () => {
    const onClose = vi.fn();
    const { api } = makeApi(view([]));
    const { container } = await shown(<VaultShareSheet vaultId={VAULT} onClose={onClose} api={api} />);
    await userEvent.click(screen.getByText(defaultWords.whoHasAccess));
    await userEvent.click(screen.getByRole("dialog"));
    expect(onClose).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(container.querySelector(".ms-backdrop") as HTMLElement);
    expect(onClose).toHaveBeenCalledTimes(2);
    await userEvent.click(screen.getByRole("button", { name: defaultWords.close }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it("is a dialog named by the title (the words' title unless the host passes one)", async () => {
    const { api } = makeApi(view([]));
    const { unmount } = await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect(screen.getByRole("dialog", { name: defaultWords.title })).toBeTruthy();
    unmount();
    await shown(<VaultShareSheet vaultId={VAULT} title="Share your plants" onClose={() => {}} api={api} />);
    expect(screen.getByRole("dialog", { name: "Share your plants" })).toBeTruthy();
  });
});

describe("removing", () => {
  it("10. asks Yes or No on the row: No sends nothing, Yes calls unshare once and reads again; no window.confirm", async () => {
    const confirm = vi.spyOn(window, "confirm");
    const { api, state } = makeApi(view([BEN, CAT]));
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect(api.load).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Remove Ben" }));
    const group = screen.getByRole("group", { name: "Remove Ben?" });
    await userEvent.click(within(group).getByRole("button", { name: "No" }));
    expect(api.unshare).not.toHaveBeenCalled();
    expect(screen.queryByRole("group", { name: "Remove Ben?" })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Remove Ben" }));
    state.current = view([CAT]);
    await userEvent.click(within(screen.getByRole("group", { name: "Remove Ben?" })).getByRole("button", { name: "Yes" }));
    await waitFor(() => expect(api.unshare).toHaveBeenCalledTimes(1));
    expect(api.unshare).toHaveBeenCalledWith(VAULT, "p-ben");
    await waitFor(() => expect(screen.queryByText("Ben")).toBeNull());
    expect(api.load).toHaveBeenCalledTimes(2);
    expect(screen.getByText("Cat")).toBeTruthy();
    expect(confirm).not.toHaveBeenCalled();
  });

  it("10. a failed remove shows its sentence on that row only, and the list is not re-read", async () => {
    const { api } = makeApi(view([BEN, CAT]), { unshare: vi.fn(async () => { throw new Error("The platform said no."); }) });
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    await userEvent.click(screen.getByRole("button", { name: "Remove Ben" }));
    await userEvent.click(screen.getByRole("button", { name: "Yes" }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toBe("The platform said no.");
    const rows = screen.getAllByRole("listitem");
    const benRow = rows.find((r) => r.textContent!.includes("Ben"))!;
    const catRow = rows.find((r) => r.textContent!.includes("Cat"))!;
    expect(within(benRow).getByRole("alert")).toBe(alert);
    expect(within(catRow).queryByRole("alert")).toBeNull();
    expect(api.load).toHaveBeenCalledTimes(1);
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });

  it("the owner row has no Remove, and showOwner false hides it", async () => {
    const { api } = makeApi(view([BEN]));
    const { unmount } = await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    const ownerRow = screen.getByText("Ann").closest("li")!;
    expect(within(ownerRow).queryByRole("button")).toBeNull();
    expect(within(ownerRow).getByText(defaultWords.ownerLine)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: /^Remove / })).toHaveLength(1);
    unmount();
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} showOwner={false} />);
    expect(screen.queryByText("Ann")).toBeNull();
  });
});

describe("the states", () => {
  it("11. an empty list says nobody else has access; a loading sheet says it is reading", async () => {
    const d = deferred();
    const { api } = makeApi(view([], null), { load: vi.fn(async () => { await d.promise; return view([], null); }) });
    render(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect(screen.getByText(defaultWords.loading)).toBeTruthy();
    await act(async () => d.resolve());
    expect(await screen.findByText(defaultWords.nobody)).toBeTruthy();
  });

  it("11. a person without Control sees NO_CONTROL and no form", async () => {
    const { api } = makeApi({ controlled: false });
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect(screen.getByText(NO_CONTROL)).toBeTruthy();
    expect(defaultWords.notControlled).toBe(NO_CONTROL);
    expect(document.querySelector("form")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
  });

  it("a failed read shows its sentence (a 403 as NO_CONTROL) and keeps the form", async () => {
    const { api } = makeApi(view([]), { load: vi.fn(async () => { throw new Error("The list would not load."); }) });
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect((await screen.findByRole("alert")).textContent).toBe("The list would not load.");
    expect(screen.getByRole("textbox")).toBeTruthy();
  });

  it("the radios start on defaultLevel (view unless told) and the share sends the chosen level", async () => {
    const { api } = makeApi(view([]));
    const { unmount } = await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect((screen.getByRole("radio", { name: defaultWords.canView }) as HTMLInputElement).checked).toBe(true);
    unmount();
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} defaultLevel="edit" />);
    expect((screen.getByRole("radio", { name: defaultWords.canEdit }) as HTMLInputElement).checked).toBe(true);
    await userEvent.type(screen.getByRole("textbox"), "ben");
    await userEvent.click(screen.getByRole("radio", { name: defaultWords.canView }));
    await userEvent.click(screen.getByRole("radio", { name: defaultWords.canEdit }));
    await userEvent.click(screen.getByRole("button", { name: defaultWords.share }));
    await waitFor(() => expect(api.share).toHaveBeenCalledWith(VAULT, "https://ben.fake.test/vault", "edit"));
  });

  it("a share that works says who, empties the field and reads again; a share that fails shows its sentence under the form", async () => {
    const { api } = makeApi(view([]));
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    await userEvent.type(screen.getByRole("textbox"), "Ben");
    await userEvent.click(screen.getByRole("button", { name: defaultWords.share }));
    expect(await screen.findByText("Shared with ben")).toBeTruthy();
    expect((screen.getByRole("textbox") as HTMLInputElement).value).toBe("");
    expect(api.load).toHaveBeenCalledTimes(2);
    api.share.mockRejectedValueOnce(new Error("They are not on the platform."));
    await userEvent.type(screen.getByRole("textbox"), "zed");
    await userEvent.click(screen.getByRole("button", { name: defaultWords.share }));
    expect((await screen.findByRole("alert")).textContent).toBe("They are not on the platform.");
    expect(api.load).toHaveBeenCalledTimes(2);
    await userEvent.type(screen.getByRole("textbox"), "x");
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("words are overridable, one at a time", async () => {
    const { api } = makeApi(view([], null));
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} words={{ nobody: "Pas encore.", share: "Partager", close: "Fermer" }} />);
    expect(screen.getByText("Pas encore.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Partager" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Fermer" })).toBeTruthy();
    expect(screen.getByText(defaultWords.whoHasAccess)).toBeTruthy();
  });
});

describe("input problems", () => {
  it("12. an email, a bare host and an empty entry show their sentence and send nothing", async () => {
    const { api } = makeApi(view([]));
    await shown(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    const input = screen.getByRole("textbox");
    for (const [text, sentence] of [["ben@example.test", /not an email/], ["ann.example.test", /vault name/i], ["https://ann.example.test", /vault address/i], ["", /Enter a vault name/]] as const) {
      await userEvent.clear(input);
      if (text) await userEvent.type(input, text);
      await userEvent.click(screen.getByRole("button", { name: defaultWords.share }));
      expect((await screen.findByRole("alert")).textContent, text).toMatch(sentence);
    }
    expect(api.share).not.toHaveBeenCalled();
    expect(api.load).toHaveBeenCalledTimes(1);
  });
});
