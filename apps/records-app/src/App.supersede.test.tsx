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

beforeEach(() => vi.stubEnv("VITE_SUPERSEDE_ONLY", "1"));
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test("4.3: with the flag the Add form is not rendered, the notice is, and listing and search still work", async () => {
  wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
  expect(await screen.findByText("Red kettle")).toBeTruthy();
  expect(screen.queryByRole("form", { name: "Add a record" })).toBeNull();
  expect(screen.queryByLabelText("Description")).toBeNull();
  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect(screen.getByLabelText("Search records")).toBeTruthy();
});

test("4.3: with the flag the picture picker is not rendered, but the profile can still be saved", async () => {
  wrap(<ProfileView vault={{ vaultId: "v", reachCount: 1, modes: ["read", "write"] } as never} />);
  expect(await screen.findByLabelText("Name")).toBeTruthy();
  expect(screen.queryByLabelText("Profile picture")).toBeNull();
  expect(screen.getByText(NOTICE)).toBeTruthy();
  expect((screen.getByRole("button", { name: "Save profile" }) as HTMLButtonElement).disabled).toBe(false);
});

test("4.3: without the flag the form and the picker are there", async () => {
  vi.stubEnv("VITE_SUPERSEDE_ONLY", "");
  wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
  expect(await screen.findByRole("form", { name: "Add a record" })).toBeTruthy();
  cleanup();
  wrap(<ProfileView vault={{ vaultId: "v", reachCount: 1, modes: ["read", "write"] } as never} />);
  expect(await screen.findByLabelText("Profile picture")).toBeTruthy();
});
