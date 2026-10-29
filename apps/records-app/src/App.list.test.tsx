import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ addEntry: vi.fn(), photoObjectUrl: vi.fn(), listEntries: vi.fn() }));
vi.mock("./platform", () => ({ VEDA_ORIGIN: "https://veda.example.test", PLATFORM_ORIGIN: "https://gilb.com", credential: {}, findMyVault: vi.fn(), signInApp: {}, signInAuth: {} }));
vi.mock("./data", async () => ({
  ...(await vi.importActual<typeof import("./data")>("./data")),
  listEntries: h.listEntries,
  addEntry: h.addEntry,
  photoObjectUrl: h.photoObjectUrl,
}));

const { RecordList, Avatar } = await import("./App");
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

const PIN = "https://a.gilb.com/vault";
beforeEach(() => {
  vi.clearAllMocks();
  h.listEntries.mockResolvedValue([{ id: "1", entityUri: "u1", name: "Red kettle", description: "boils water" }]);
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  vi.stubEnv("VITE_VAULT_URL", PIN);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test("D1: two presses of Add while the create is in flight make one record", async () => {
  let finish!: (v: { id: string; confirmed: boolean }) => void;
  h.addEntry.mockReturnValue(new Promise((r) => { finish = r; }));
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  const add = screen.getByRole("button", { name: "Add record" });
  fireEvent.click(add);
  fireEvent.click(add);
  fireEvent.submit(screen.getByRole("form", { name: "Add a record" })); // Enter
  expect(h.addEntry).toHaveBeenCalledTimes(1);
  expect((add as HTMLButtonElement).disabled).toBe(true);
  finish({ id: "9", confirmed: true });
  await waitFor(() => expect((screen.getByRole("button", { name: "Add record" }) as HTMLButtonElement).disabled).toBe(false));
});

test("M12: the form clears after a successful Add, and keeps its words after a refusal", async () => {
  h.addEntry.mockResolvedValueOnce({ id: "9", confirmed: true });
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  const name = screen.getByLabelText("Name") as HTMLInputElement;
  const desc = screen.getByLabelText("Description") as HTMLTextAreaElement;
  fireEvent.change(name, { target: { value: "Spoon" } });
  fireEvent.change(desc, { target: { value: "steel" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  await waitFor(() => expect(name.value).toBe(""));
  expect(desc.value).toBe("");
  h.addEntry.mockRejectedValueOnce(new Error("Refused."));
  fireEvent.change(name, { target: { value: "Fork" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Refused.");
  expect(name.value).toBe("Fork");
});

test("D6: the list is a real list of buttons, and no div or p carries an aria-label", async () => {
  const { container } = wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  const list = screen.getByRole("list");
  expect(list.tagName).toBe("UL");
  expect(list.querySelectorAll("li > button")).toHaveLength(1);
  expect(container.querySelector("div[aria-label], p[aria-label]")).toBeNull();
});

test("D6: the avatar's picture address is revoked when it changes and when it goes", async () => {
  const revoke = vi.fn();
  vi.stubGlobal("URL", Object.assign(URL, { revokeObjectURL: revoke }));
  h.photoObjectUrl.mockResolvedValueOnce("blob:one").mockResolvedValueOnce("blob:two");
  const { rerender, unmount, container } = wrap(<Avatar vaultId={PIN} location="/files/1" />);
  await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:one"));
  rerender(<QueryClientProvider client={new QueryClient()}><Avatar vaultId={PIN} location="/files/2" /></QueryClientProvider>);
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:one"));
  await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:two"));
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:two");
});

test("W3: a create the vault read back with the name shows Record added.", async () => {
  h.addEntry.mockResolvedValueOnce({ id: "9", confirmed: true });
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  expect((await screen.findByRole("status")).textContent).toBe("Record added.");
});

test("W3: a create whose read-back lacks the name shows the refusal and not Record added.", async () => {
  h.addEntry.mockResolvedValueOnce({ id: "9", confirmed: false });
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  expect((await screen.findByRole("alert")).textContent).toBe("The vault did not confirm the record.");
  expect(screen.queryByText("Record added.")).toBeNull();
});

test("W3: the list is fetched again after a create", async () => {
  h.addEntry.mockResolvedValueOnce({ id: "9", confirmed: true });
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  expect(h.listEntries).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  await waitFor(() => expect(h.listEntries).toHaveBeenCalledTimes(2));
});

test("W5: the empty list says only No records yet. when creating is off, and adds the invitation when it is on", async () => {
  h.listEntries.mockResolvedValue([]);
  vi.stubEnv("VITE_ALLOW_CREATE", "");
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  expect((await screen.findByText(/^No records yet/)).textContent).toBe("No records yet.");
  cleanup();
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  expect((await screen.findByText(/^No records yet/)).textContent).toBe("No records yet. Add the first one above.");
});
