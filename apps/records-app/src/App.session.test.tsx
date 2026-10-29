import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-signin/session";

const h = vi.hoisted(() => ({
  credential: { getSession: vi.fn(), invalidate: vi.fn() },
  findMyVault: vi.fn(),
  listEntries: vi.fn(),
  loadProfile: vi.fn(),
  photoObjectUrl: vi.fn(),
}));

vi.mock("@kaigilb/gilbplatformcode-signin", () => ({
  SignInCard: ({ onSignedIn }: { onSignedIn: () => void }) => (
    <div data-testid="signin-card"><button onClick={onSignedIn}>Complete sign-in</button></div>
  ),
}));
vi.mock("./platform", () => ({
  VEDA_ORIGIN: "https://veda.example.test",
  PLATFORM_ORIGIN: "https://gilb.com",
  credential: h.credential,
  findMyVault: h.findMyVault,
  signInApp: {},
  signInAuth: {},
}));
vi.mock("./data", async () => ({
  ...(await vi.importActual<typeof import("./data")>("./data")),
  listEntries: h.listEntries,
  loadProfile: h.loadProfile,
  photoObjectUrl: h.photoObjectUrl,
}));

const { App } = await import("./App");

// Node 25 ships a half-working localStorage; use a plain in-memory one.
const mem = new Map<string, string>();
const memory = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

const vaultA = { recordsVault: { vaultId: "https://a.example.test/vault" }, profileVault: { vaultId: "https://a.example.test/vault" } };
const vaultB = { recordsVault: { vaultId: "https://b.example.test/vault" }, profileVault: { vaultId: "https://b.example.test/vault" } };
const fetchMock = vi.fn(async (..._a: unknown[]) => new Response(null, { status: 204 }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const ui = render(<QueryClientProvider client={client}><App /></QueryClientProvider>);
  return { client, ...ui };
}

beforeEach(() => {
  vi.clearAllMocks();
  mem.clear();
  vi.stubGlobal("localStorage", memory);
  vi.stubGlobal("fetch", fetchMock);
  delete document.documentElement.dataset.theme;
  h.credential.getSession.mockResolvedValue({});
  h.findMyVault.mockResolvedValue(vaultA);
  h.loadProfile.mockResolvedValue({ kind: "none" });
  h.photoObjectUrl.mockResolvedValue(null);
  h.listEntries.mockResolvedValue([{ id: "1", entityUri: "u1", name: "A kettle", description: "A's own" }]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

test("M4: no session shows the sign-in card; a session shows the records shell", async () => {
  h.credential.getSession.mockRejectedValue(new NotSignedInError());
  mount();
  expect(await screen.findByTestId("signin-card")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  cleanup();
  h.credential.getSession.mockResolvedValue({});
  mount();
  expect(await screen.findByRole("button", { name: "Sign out" })).toBeTruthy();
  expect(screen.queryByTestId("signin-card")).toBeNull();
});

test("M4: a vault the person cannot write to shows the message", async () => {
  h.findMyVault.mockResolvedValue({ recordsVault: null, profileVault: null });
  mount();
  expect((await screen.findByRole("alert")).textContent).toBe("You have no vault you can write to.");
});

test("M3: pressing the theme toggle sets the theme on the page", async () => {
  mount();
  const toggle = await screen.findByRole("button", { name: "Colour mode" });
  fireEvent.click(toggle); // system -> light
  expect(document.documentElement.dataset.theme).toBe("light");
  fireEvent.click(toggle); // light -> dark
  expect(document.documentElement.dataset.theme).toBe("dark");
});

test("D2: after sign-out, person B's first paint holds none of person A's records", async () => {
  mount();
  expect(await screen.findByText("A kettle")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Sign out" }));
  fireEvent.click(await screen.findByRole("button", { name: "Complete sign-in" }));
  // B's vault answers; B's list is still pending.
  h.findMyVault.mockResolvedValue(vaultB);
  h.listEntries.mockReturnValue(new Promise(() => undefined));
  expect(screen.queryByText("A kettle")).toBeNull();
  await waitFor(() => expect(screen.queryByText("A kettle")).toBeNull());
});

test("D3: sign-out sends POST /onboard/logout to the platform origin, then drops the key", async () => {
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  expect(url).toBe("https://gilb.com/onboard/logout");
  expect(init).toMatchObject({ method: "POST", credentials: "include", redirect: "manual" });
  await waitFor(() => expect(h.credential.invalidate).toHaveBeenCalledWith(true));
  expect(await screen.findByTestId("signin-card")).toBeTruthy();
});

test("D3: a failed logout call still signs this tab out", async () => {
  fetchMock.mockRejectedValueOnce(new TypeError("offline"));
  mount();
  fireEvent.click(await screen.findByRole("button", { name: "Sign out" }));
  expect(await screen.findByTestId("signin-card")).toBeTruthy();
});

test("D6: only 'no session' is quiet; any other session error shows a message above the card", async () => {
  h.credential.getSession.mockRejectedValue(new Error("This app's origin is not admitted."));
  mount();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("This app's origin is not admitted.");
  expect(screen.getByTestId("signin-card")).toBeTruthy();
  expect(alert.compareDocumentPosition(screen.getByTestId("signin-card")) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

test("D6: the system theme follows an OS change while the page is open, and the listener goes on unmount", async () => {
  let listener: (() => void) | null = null;
  const mql = {
    matches: false,
    addEventListener: vi.fn((_t: string, l: () => void) => { listener = l; }),
    removeEventListener: vi.fn(),
  };
  vi.stubGlobal("matchMedia", vi.fn(() => mql));
  const { unmount } = mount();
  await screen.findByRole("button", { name: "Colour mode" }); // preference is "system"
  mql.matches = true;
  listener!();
  expect(document.documentElement.dataset.theme).toBe("dark");
  unmount();
  expect(mql.removeEventListener).toHaveBeenCalled();
});

test("D6: the nav buttons sit in a nav", async () => {
  mount();
  const nav = await screen.findByRole("navigation");
  expect(nav.textContent).toContain("Records");
  expect(nav.textContent).toContain("Profile");
});

test("B10 W1: the Profile view with no profile vault says the own vault was not found, and does not read the records vault", async () => {
  h.findMyVault.mockResolvedValue({ recordsVault: vaultA.recordsVault, profileVault: null });
  mount();
  await screen.findByText("A kettle");
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  expect((await screen.findByText("Your own vault was not found among the vaults you reach.")).tagName).toBe("P");
  expect(h.loadProfile.mock.calls.some((c) => (c[0] as { vaultId: string }).vaultId === "https://land.example.test/vault")).toBe(false);
  expect(screen.queryByLabelText("Name")).toBeNull();
  expect(screen.queryByRole("region", { name: "Connection" })).toBeNull();
});

test("B10 W2: the Profile view reads the profile vault while the list stays on the records vault", async () => {
  h.findMyVault.mockResolvedValue({ recordsVault: { vaultId: "https://a.example.test/vault" }, profileVault: { vaultId: "https://land.example.test/vault", modes: ["read"] } });
  h.loadProfile.mockResolvedValue({ kind: "none" });
  mount();
  await screen.findByText("A kettle");
  expect(h.listEntries).toHaveBeenCalledWith("https://a.example.test/vault");
  fireEvent.click(screen.getByRole("button", { name: "Profile" }));
  await screen.findByRole("region", { name: "Connection" });
  expect(h.loadProfile.mock.calls[0]![0]).toMatchObject({ vaultId: "https://land.example.test/vault" });
});

// ---- W5: two faces in the header -------------------------------------------------------------
const REC = "https://rec.example.test/vault";
const LAND = "https://land.example.test/vault";
const cardWith = (photo: string) => ({ kind: "card", card: { id: "c", entityUri: "e", etag: null, road: "derived", source: [], name: "Ada", email: "", phone: "", photo, moreEmails: 0, morePhones: 0, rawEmail: "", rawPhone: "" }, otherOwnerCards: [] });
const twoVaults = (over: Record<string, unknown> = {}) => ({
  recordsVault: { vaultId: REC, name: "Kettle Shop", modes: ["read", "write"] },
  profileVault: { vaultId: LAND, name: "Ada's vault", modes: ["read"] },
  ...over,
});
const photoByVault = () => h.photoObjectUrl.mockImplementation(async (v: string) => `blob:${v}`);

test("B10 W5: the left face is the landing vault's card photo, has no name beside it, and is labelled Your own card", async () => {
  h.findMyVault.mockResolvedValue(twoVaults());
  h.loadProfile.mockImplementation(async (v: { vaultId: string }) => cardWith(v.vaultId === LAND ? "/files/ada" : "/files/shop"));
  photoByVault();
  mount();
  const left = await screen.findByLabelText("Your own card");
  await waitFor(() => expect(left.querySelector("img")!.getAttribute("src")).toBe(`blob:${LAND}`));
  expect(left.textContent).toBe("");
});

test("B10 W5: the right face is the records vault's own card photo, with the vault's name, and differs from the left when the vaults differ", async () => {
  h.findMyVault.mockResolvedValue(twoVaults());
  h.loadProfile.mockImplementation(async (v: { vaultId: string }) => cardWith(v.vaultId === LAND ? "/files/ada" : "/files/shop"));
  photoByVault();
  mount();
  const right = await screen.findByLabelText("Vault Kettle Shop");
  await waitFor(() => expect(right.querySelector("img")!.getAttribute("src")).toBe(`blob:${REC}`));
  expect(right.textContent).toContain("Kettle Shop");
  expect(screen.getByLabelText("Your own card").querySelector("img")!.getAttribute("src")).not.toBe(right.querySelector("img")!.getAttribute("src"));
});

test("B10 W5: a records vault with no card photo shows the vault's initial, never the personal photo", async () => {
  h.findMyVault.mockResolvedValue(twoVaults());
  h.loadProfile.mockImplementation(async (v: { vaultId: string }) => (v.vaultId === LAND ? cardWith("/files/ada") : { kind: "none" }));
  photoByVault();
  mount();
  const right = await screen.findByLabelText("Vault Kettle Shop");
  await waitFor(() => expect(screen.getByLabelText("Your own card").querySelector("img")).toBeTruthy());
  expect(right.querySelector("img")).toBeNull();
  expect(right.textContent).toContain("K");
});

test("B10 W5: with no name the vault label is the host", async () => {
  h.findMyVault.mockResolvedValue(twoVaults({ recordsVault: { vaultId: REC, modes: ["read", "write"] } }));
  mount();
  expect(await screen.findByLabelText("Vault rec.example.test")).toBeTruthy();
});

test("B10 W5: with no landing vault resolved there is no left face; the right face stays", async () => {
  h.findMyVault.mockResolvedValue(twoVaults({ profileVault: null }));
  mount();
  await screen.findByLabelText("Vault Kettle Shop");
  expect(screen.queryByLabelText("Your own card")).toBeNull();
});

test("B10 W5: when both are the same vault both faces still show", async () => {
  const same = { vaultId: REC, name: "Kettle Shop", modes: ["read", "write"] };
  h.findMyVault.mockResolvedValue({ recordsVault: same, profileVault: same });
  mount();
  expect(await screen.findByLabelText("Your own card")).toBeTruthy();
  expect(screen.getByLabelText("Vault Kettle Shop")).toBeTruthy();
});

test("B10 W5: clicking the left face opens the Profile view, titled Your card, with the profile vault's label under it", async () => {
  h.findMyVault.mockResolvedValue(twoVaults());
  mount();
  fireEvent.click(await screen.findByLabelText("Your own card"));
  expect(await screen.findByRole("heading", { name: "Your card" })).toBeTruthy();
  expect(screen.getByText("in Ada's vault")).toBeTruthy();
  expect(h.loadProfile.mock.calls.some((c) => (c[0] as { vaultId: string }).vaultId === LAND)).toBe(true);
});
