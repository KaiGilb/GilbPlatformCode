import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { VaultShareSheet, defaultWords, type AccessRow, type AccessView, type ShareApi } from "./index";
import { browserStore, type KeyValueStore } from "./rememberNames";
import { accessRows } from "./model";

const VAULT = "https://ann.fake.test/vault";
const ANN = "https://id.fake.test/base/p/ann";
const BEN = "https://id.fake.test/base/p/ben";
const row = (principal: string, label: string, o: Partial<AccessRow> = {}): AccessRow => ({ principal, label, note: "from platform", level: "view", owner: false, named: false, ...o });
const OWNER = row(ANN, "Principal key", { owner: true, level: "edit", note: null });
const viewOf = (rows: AccessRow[]): AccessView => ({ controlled: true, owner: OWNER, rows });

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return { data, get: (k) => data.get(k) ?? null, set: (k, v) => void data.set(k, v), remove: (k) => void data.delete(k) };
}
/** A platform that adds the principal `BEN` on share and drops it on unshare. */
function platform() {
  const rows: AccessRow[] = [];
  const api: ShareApi = {
    load: vi.fn(async () => viewOf([...rows])),
    share: vi.fn(async () => void rows.push(row(BEN, "Principal key"))),
    unshare: vi.fn(async (_v, p) => void rows.splice(rows.findIndex((r) => r.principal === p), 1)),
  };
  return { api, rows };
}
const ready = async (ui: React.ReactElement) => {
  const r = render(ui);
  await waitFor(() => expect(screen.queryByText(defaultWords.loading)).toBeNull());
  return r;
};
const share = async (name: string) => {
  await userEvent.type(screen.getByLabelText(defaultWords.nameLabel), name);
  await userEvent.click(screen.getByRole("button", { name: defaultWords.share }));
};

beforeEach(() => setBaseOrigin("https://fake.test"));
afterEach(() => resetBaseOrigin());

describe("help, you, remembered names", () => {
  it("draws help directly under the title, and nothing without it", async () => {
    const { api } = platform();
    const { unmount } = await ready(<VaultShareSheet vaultId={VAULT} title="Share my cameras" help="View or Edit." onClose={() => {}} api={api} />);
    const help = screen.getByText("View or Edit.");
    expect(help.tagName).toBe("P");
    expect(help.className).toBe("vss-help");
    const title = screen.getByText("Share my cameras");
    expect(title.compareDocumentPosition(help) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    // the dialog's body follows the title, and the help is the first thing in it, before the form
    expect(help.parentElement!.previousElementSibling).toBe(title);
    expect(help.previousElementSibling).toBeNull();
    expect(help.nextElementSibling?.tagName).toBe("FORM");
    unmount();
    await ready(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect(document.querySelector(".vss-help")).toBeNull();
  });

  it("names the owner row You when you is given, and as the platform did when it is not", async () => {
    const { api } = platform();
    const { unmount } = await ready(<VaultShareSheet vaultId={VAULT} you={ANN} onClose={() => {}} api={api} />);
    expect(screen.getByText("You")).toBeTruthy();
    expect(screen.queryByText("Principal key")).toBeNull();
    unmount();
    await ready(<VaultShareSheet vaultId={VAULT} onClose={() => {}} api={api} />);
    expect(screen.getByText("Principal key")).toBeTruthy();
  });

  it("names a delegate's own row You, and the real owner row keeps its label", async () => {
    const api: ShareApi = { load: async () => viewOf([row(BEN, "Principal key", { owner: true })]), share: async () => {}, unshare: async () => {} };
    await ready(<VaultShareSheet vaultId={VAULT} you={BEN} onClose={() => {}} api={api} />);
    expect(screen.getAllByText("You")).toHaveLength(1);
    expect(screen.getByText("Principal key")).toBeTruthy(); // the owner (ANN), not "You"
  });

  it("two people on one browser never see each other's typed names", async () => {
    const store = memoryStore();
    const { api } = platform();
    const mine = await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={store} onClose={() => {}} api={api} />);
    await share("ben");
    await waitFor(() => expect(screen.getByText("ben")).toBeTruthy());
    mine.unmount();
    await ready(<VaultShareSheet vaultId={VAULT} you={BEN} rememberNames={store} onClose={() => {}} api={api} />);
    expect(screen.queryByText("ben")).toBeNull();
    expect(screen.getByText("You")).toBeTruthy(); // his own row; ANN's typed name is not his
  });

  it("shows the typed name after a reload (a new sheet, the same store), and not for a person the platform named", async () => {
    const store = memoryStore();
    const { api } = platform();
    const first = await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={store} onClose={() => {}} api={api} />);
    await share("ben");
    await waitFor(() => expect(screen.getByText("ben")).toBeTruthy());
    expect(screen.getByText(defaultWords.remembered("ben"))).toBeTruthy();
    first.unmount();
    await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={store} onClose={() => {}} api={api} />);
    expect(screen.getByText("ben")).toBeTruthy();
    expect(screen.queryByText(defaultWords.unnamed)).toBeNull();
  });

  it("keeps a platform name over a remembered one", async () => {
    const store = memoryStore();
    store.set("vss-names:" + ANN + ":" + VAULT, JSON.stringify({ [BEN]: "ben" }));
    const api: ShareApi = { load: async () => viewOf([row(BEN, "Benjamin", { named: true })]), share: async () => {}, unshare: async () => {} };
    await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={store} onClose={() => {}} api={api} />);
    expect(screen.getByText("Benjamin")).toBeTruthy();
    expect(screen.queryByText("ben")).toBeNull();
  });

  it("removes the remembered name on unshare", async () => {
    const store = memoryStore();
    const { api } = platform();
    await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={store} onClose={() => {}} api={api} />);
    await share("ben");
    await waitFor(() => expect(store.data.size).toBe(1));
    await userEvent.click(await screen.findByRole("button", { name: "Remove ben" }));
    await userEvent.click(screen.getByRole("button", { name: defaultWords.yes }));
    await waitFor(() => expect(store.data.size).toBe(0));
    expect(screen.queryByText("ben")).toBeNull();
  });

  it("says no name was given for an unnamed person with nothing remembered", async () => {
    const api: ShareApi = { load: async () => viewOf([row(BEN, "Principal key")]), share: async () => {}, unshare: async () => {} };
    await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={memoryStore()} onClose={() => {}} api={api} />);
    expect(screen.getByText("No name was given for this person.")).toBeTruthy();
    expect(defaultWords.unnamed).toBe("No name was given for this person.");
  });

  it("a store that throws keeps nothing and breaks nothing", async () => {
    const bad: KeyValueStore = { get: () => { throw new Error("blocked"); }, set: () => { throw new Error("full"); }, remove: () => { throw new Error("blocked"); } };
    const { api } = platform();
    await ready(<VaultShareSheet vaultId={VAULT} you={ANN} rememberNames={bad} onClose={() => {}} api={api} />);
    await share("ben");
    await waitFor(() => expect(screen.getByText(defaultWords.shared("ben"))).toBeTruthy());
  });
});

describe("AccessRow.named", () => {
  const e = (principal: string, label: string | null, extra: object = {}) => ({ principal, levels: ["read" as const], label, webId: null, kind: "grant" as const, ...extra });
  it("is true for a platform label with its labelSource, false for none or for a registered key without a name", () => {
    const { rows } = accessRows([
      e("https://id.x.test/base/p/a", "Ann", { labelSource: "vault-name" }),
      e("https://id.x.test/base/p/b", null),
      e("https://id.x.test/base/p/c", null, { registered: true }),
      e("https://id.x.test/base/p/d", "  "),
      e("https://bob.x.test/i", null),
    ]);
    expect(rows.map((r) => [r.label, r.named])).toEqual([["Ann", true], ["Principal key", false], ["Registered principal", false], ["Principal key", false], ["bob", true]]);
  });
});

describe("browserStore", () => {
  it("reads and writes localStorage under its prefix", () => {
    const data = new Map<string, string>();
    vi.stubGlobal("localStorage", { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v), removeItem: (k: string) => void data.delete(k) });
    const s = browserStore("app:");
    s.set("k", "v");
    expect(data.get("app:k")).toBe("v");
    expect(s.get("k")).toBe("v");
    s.remove("k");
    expect(s.get("k")).toBeNull();
    vi.unstubAllGlobals();
  });
});
