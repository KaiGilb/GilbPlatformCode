import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

vi.mock("./platform", () => ({ VEDA_ORIGIN: "https://veda.example.test", PLATFORM_ORIGIN: "https://gilb.com", credential: {}, findMyVault: vi.fn(), signInApp: {}, signInAuth: {} }));
const card = { id: "p", entityUri: "e", etag: null, road: "derived", source: [], name: "Ada", email: "", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: "", rawPhone: "" };
vi.mock("./data", async () => ({
  ...(await vi.importActual<typeof import("./data")>("./data")),
  listEntries: vi.fn(async () => [{ id: "1", entityUri: "u1", name: "Red kettle", description: "boils water" }]),
  loadProfile: vi.fn(async () => ({ kind: "card", card, otherOwnerCards: [] })),
  photoObjectUrl: vi.fn(async () => null),
}));
const data = await import("./data");
const { RecordList, ProfileView } = await import("./App");
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const NOTICE = "This run changes existing records only. Adding records and pictures is off.";
const PIN = "https://a.gilb.com/vault";
const OTHER = "https://b.gilb.com/vault";
const PROFILE_OFF = "Changing your profile is off in this run.";

beforeEach(() => { vi.stubEnv("VITE_ALLOW_CREATE", "1"); vi.stubEnv("VITE_VAULT_URL", PIN); });
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test("gate: for a vault that is not the pinned one the Add form is not rendered, the notice is, and listing and search still work", async () => {
  wrap(<RecordList vaultId={OTHER} onOpen={() => undefined} />);
  expect(await screen.findByText("Red kettle")).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Add a record" })).toBeNull();
  expect(screen.queryByLabelText("Description")).toBeNull();
  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect(screen.getByLabelText("Search records")).toBeTruthy();
});

const rw = { vaultId: OTHER, reachCount: 1, modes: ["read", "write"] } as never;

test("gate: the create gate no longer decides the picture: with VITE_ALLOW_CREATE off and VITE_PROFILE_WRITE=1 the picker and Save are there", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "");
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  wrap(<ProfileView vault={rw} />);
  expect(await screen.findByLabelText("Profile picture")).toBeTruthy();
  expect(screen.queryByText(NOTICE)).toBeNull();
  expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(false);
});

test("B10 W3: without VITE_PROFILE_WRITE=1 the profile is read-only: no picker, no Save, no Create, the notice shows, the card is still read", async () => {
  vi.stubEnv("VITE_PROFILE_WRITE", "");
  wrap(<ProfileView vault={rw} />);
  expect(((await screen.findByLabelText("Name")) as HTMLInputElement).value).toBe("Ada");
  expect(screen.getByText(PROFILE_OFF)).toBeTruthy();
  expect(screen.queryByLabelText("Profile picture")).toBeNull();
  expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Create my profile card" })).toBeNull();
  expect((screen.getByLabelText("Name") as HTMLInputElement).readOnly).toBe(true);
});

test("B10 W3: with the flag on but the profile vault read-only, the same read-only form shows", async () => {
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  wrap(<ProfileView vault={{ vaultId: OTHER, reachCount: 1, modes: ["read"] } as never} />);
  expect(await screen.findByText(PROFILE_OFF)).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
});

test("B10 W3: with no card, flag off: no Create button, still the no-card message", async () => {
  vi.stubEnv("VITE_PROFILE_WRITE", "");
  (data.loadProfile as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ kind: "none" });
  wrap(<ProfileView vault={rw} />);
  expect(await screen.findByText("No profile card was found in your vault.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create my profile card" })).toBeNull();
  expect(screen.getByText(PROFILE_OFF)).toBeTruthy();
});
