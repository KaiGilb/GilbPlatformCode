import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const entries = [
  { id: "1", entityUri: "u1", name: "Red kettle", description: "boils water" },
  { id: "2", entityUri: "u2", name: "Blue pot", description: "for soup" },
];
const addEntry = vi.fn(async () => ({ id: "3", confirmed: true }));
const card = { id: "p", entityUri: "e", etag: null, road: "derived", source: [], name: "Ada", email: "ada@x.test", phone: "+1 555 0100", photo: "", moreEmails: 0, morePhones: 0, rawEmail: "ada@x.test", rawPhone: "+1 555 0100" };
const loadProfile = vi.fn(async () => ({ kind: "card", card, otherOwnerCards: [] }));
const saveProfile = vi.fn(async (..._a: unknown[]) => ({ confirmed: true, failed: [] as string[] }));
const setProfilePhoto = vi.fn(async () => undefined);

vi.mock("./data", async () => {
  const real = await vi.importActual<typeof import("./data")>("./data");
  return {
    ...real,
    listEntries: vi.fn(async () => entries),
    addEntry,
    loadProfile,
    saveProfile,
    setProfilePhoto,
    photoObjectUrl: vi.fn(async () => null),
  };
});
vi.mock("./platform", () => ({ VEDA_ORIGIN: "https://veda.example.test", credential: {}, findMyVault: vi.fn(), signInApp: {}, signInAuth: {} }));

const { RecordCard, RecordList, ProfileView } = await import("./App");

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const PIN = "https://a.gilb.com/vault";
beforeEach(() => { vi.stubEnv("VITE_ALLOW_CREATE", "1"); vi.stubEnv("VITE_VAULT_URL", PIN); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test("records are listed and a click opens the record on a card", async () => {
  let opened: unknown = null;
  wrap(<RecordList vaultId={PIN} onOpen={(t) => (opened = t)} />);
  fireEvent.click(await screen.findByText("Blue pot"));
  expect(opened).toMatchObject({ id: "2" });
  cleanup();
  render(<RecordCard entry={entries[1]} onBack={() => undefined} />);
  expect(screen.getByRole("heading", { name: "Blue pot" })).toBeTruthy();
  expect(screen.getByText("for soup")).toBeTruthy();
});

test("typing in the search box narrows the list", async () => {
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "soup" } });
  expect(screen.queryByText("Red kettle")).toBeNull();
  expect(screen.getByText("Blue pot")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "zzz" } });
  expect(screen.getByText("No record matches.")).toBeTruthy();
});

test("the add form sends name and description", async () => {
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "steel" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  await waitFor(() => expect(addEntry).toHaveBeenCalledWith(PIN, "Spoon", "steel"));
});

test("the profile shows contact information, saves changes, and takes a picture", async () => {
  wrap(<ProfileView vault={{ vaultId: PIN } as never} />);
  const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
  expect(email.value).toBe("ada@x.test");
  expect(screen.getByText("Call")).toBeTruthy();
  fireEvent.change(email, { target: { value: "new@x.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(expect.objectContaining({ id: "p" }), { name: "Ada", email: "new@x.test", phone: "+1 555 0100" }));
  const file = new File(["x"], "me.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Profile picture"), { target: { files: [file] } });
  await waitFor(() => expect(setProfilePhoto).toHaveBeenCalledWith(PIN, expect.objectContaining({ id: "p" }), file));
});

test("with no own card the message shows, the form is editable, and the only button creates the card", async () => {
  loadProfile.mockResolvedValueOnce({ kind: "none" } as never);
  wrap(<ProfileView vault={{ vaultId: PIN } as never} />);
  expect(await screen.findByText("No profile card was found in your vault.")).toBeTruthy();
  expect((screen.getByLabelText("Email") as HTMLInputElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
  expect((screen.getByRole("button", { name: "Create my profile card" }) as HTMLButtonElement).disabled).toBe(false);
});

test("a second own card shows as a warning line", async () => {
  loadProfile.mockResolvedValueOnce({ kind: "card", card, otherOwnerCards: ["vsc-other"] } as never);
  wrap(<ProfileView vault={{ vaultId: PIN } as never} />);
  expect((await screen.findByRole("status")).textContent).toContain("vsc-other");
});

test("D6: the file input is reset after each pick, so the same picture can be picked again", async () => {
  wrap(<ProfileView vault={{ vaultId: PIN } as never} />);
  const input = (await screen.findByLabelText("Profile picture")) as HTMLInputElement;
  const setValue = vi.fn();
  Object.defineProperty(input, "value", { configurable: true, get: () => "", set: setValue });
  fireEvent.change(input, { target: { files: [new File(["x"], "me.png", { type: "image/png" })] } });
  await waitFor(() => expect(setValue).toHaveBeenCalledWith(""));
});

test("4.4: 'Saved' is shown only when the vault confirmed; otherwise the not-confirmed line names the field", async () => {
  wrap(<ProfileView vault={{ vaultId: PIN } as never} />);
  fireEvent.change(await screen.findByLabelText("Email"), { target: { value: "new@x.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  expect((await screen.findByRole("status")).textContent).toBe("Profile saved.");
  saveProfile.mockResolvedValueOnce({ confirmed: false, failed: ["email"] });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(screen.getByRole("alert").textContent).toBe("The vault did not confirm the change: email"));
  expect(screen.queryByText("Profile saved.")).toBeNull();
});

test("4.5: the Connection section shows the reach count, the pinned vault and modes, and the card road and id", async () => {
  wrap(<ProfileView vault={{ vaultId: "https://t.gilb.com/vault", reachCount: 3, modes: ["read", "write"] } as never} />);
  const section = await screen.findByRole("region", { name: "Connection" });
  expect(section.textContent).toContain("Vaults reached: 3");
  expect(section.textContent).toContain("https://t.gilb.com/vault");
  expect(section.textContent).toContain("read, write");
  expect(section.textContent).toContain("Own card road: derived");
  expect(section.textContent).toContain("Own card id: p");
});

test("4.5: with no own card the Connection section says road none", async () => {
  loadProfile.mockResolvedValueOnce({ kind: "none" } as never);
  wrap(<ProfileView vault={{ vaultId: "https://t.gilb.com/vault", reachCount: 1, modes: ["write"] } as never} />);
  expect((await screen.findByRole("region", { name: "Connection" })).textContent).toContain("Own card road: none");
});
