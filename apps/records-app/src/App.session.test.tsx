import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { NotSignedInError } from "@kaigilb/gilbplatformcode-signin/session";

const h = vi.hoisted(() => ({
  credential: { getSession: vi.fn(), invalidate: vi.fn() },
  findMyVault: vi.fn(),
  listEntries: vi.fn(),
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
  loadProfile: vi.fn(async () => ({ kind: "none" })),
  photoObjectUrl: vi.fn(async () => null),
}));

const { App } = await import("./App");

// Node 25 ships a half-working localStorage; use a plain in-memory one.
const mem = new Map<string, string>();
const memory = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };

const vaultA = { vaultId: "https://a.example.test/vault" };
const vaultB = { vaultId: "https://b.example.test/vault" };
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
  h.findMyVault.mockResolvedValue(null);
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
