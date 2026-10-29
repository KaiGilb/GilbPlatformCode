import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const h = vi.hoisted(() => ({ addEntry: vi.fn(), photoObjectUrl: vi.fn() }));
vi.mock("./platform", () => ({ VEDA_ORIGIN: "https://veda.example.test", PLATFORM_ORIGIN: "https://gilb.com", credential: {}, findMyVault: vi.fn(), signInApp: {}, signInAuth: {} }));
vi.mock("./data", async () => ({
  ...(await vi.importActual<typeof import("./data")>("./data")),
  listEntries: vi.fn(async () => [{ id: "1", entityUri: "u1", name: "Red kettle", description: "boils water" }]),
  addEntry: h.addEntry,
  photoObjectUrl: h.photoObjectUrl,
}));

const { RecordList, Avatar } = await import("./App");
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

test("D1: two presses of Add while the create is in flight make one record", async () => {
  let finish!: (v: { id: string }) => void;
  h.addEntry.mockReturnValue(new Promise((r) => { finish = r; }));
  wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  const add = screen.getByRole("button", { name: "Add record" });
  fireEvent.click(add);
  fireEvent.click(add);
  fireEvent.submit(screen.getByRole("form", { name: "Add a record" })); // Enter
  expect(h.addEntry).toHaveBeenCalledTimes(1);
  expect((add as HTMLButtonElement).disabled).toBe(true);
  finish({ id: "9" });
  await waitFor(() => expect((screen.getByRole("button", { name: "Add record" }) as HTMLButtonElement).disabled).toBe(false));
});

test("M12: the form clears after a successful Add, and keeps its words after a refusal", async () => {
  h.addEntry.mockResolvedValueOnce({ id: "9" });
  wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
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
  const { container } = wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
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
  const { rerender, unmount, container } = wrap(<Avatar vaultId="v" location="/files/1" />);
  await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:one"));
  rerender(<QueryClientProvider client={new QueryClient()}><Avatar vaultId="v" location="/files/2" /></QueryClientProvider>);
  await waitFor(() => expect(revoke).toHaveBeenCalledWith("blob:one"));
  await waitFor(() => expect(container.querySelector("img")?.getAttribute("src")).toBe("blob:two"));
  unmount();
  expect(revoke).toHaveBeenCalledWith("blob:two");
});
