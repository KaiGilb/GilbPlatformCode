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
const { RecordList, ProfileView } = await import("./App");
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const NOTICE = "This run changes existing records only. Adding records and pictures is off.";
const PIN = "https://a.gilb.com/vault";
const OTHER = "https://b.gilb.com/vault";

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

test("gate: without VITE_ALLOW_CREATE the picture picker is not rendered, but the profile can still be saved", async () => {
  vi.stubEnv("VITE_ALLOW_CREATE", "");
  wrap(<ProfileView vault={{ vaultId: PIN, reachCount: 1, modes: ["read", "write"] } as never} />);
  expect(await screen.findByLabelText("Name")).toBeTruthy();
  expect(screen.queryByLabelText("Profile picture")).toBeNull();
  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(false);
});

test("gate: for the pinned vault with the flag on, the form and the picker are there", async () => {
  wrap(<RecordList vaultId={PIN} onOpen={() => undefined} />);
  expect(await screen.findByRole("form", { name: "Add a record" })).toBeTruthy();
  cleanup();
  wrap(<ProfileView vault={{ vaultId: PIN, reachCount: 1, modes: ["read", "write"] } as never} />);
  expect(await screen.findByLabelText("Profile picture")).toBeTruthy();
});
