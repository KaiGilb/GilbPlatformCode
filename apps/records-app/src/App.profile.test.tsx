import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const PIN = "https://a.gilb.com/vault";
const h = vi.hoisted(() => ({ loadProfile: vi.fn(), createProfileCard: vi.fn(), setProfilePhoto: vi.fn(), saveProfile: vi.fn() }));
vi.mock("./platform", () => ({ VEDA_ORIGIN: "https://veda.example.test", PLATFORM_ORIGIN: "https://gilb.com", credential: {}, findMyVault: vi.fn(), signInApp: {}, signInAuth: {} }));
vi.mock("./data", async () => ({
  ...(await vi.importActual<typeof import("./data")>("./data")),
  loadProfile: h.loadProfile,
  createProfileCard: h.createProfileCard,
  setProfilePhoto: h.setProfilePhoto,
  saveProfile: h.saveProfile,
  photoObjectUrl: vi.fn(async () => null),
}));
const data = await import("./data");
const { ProfileView } = await import("./App");
const wrap = (ui: React.ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
const vault = { vaultId: PIN, reachCount: 1, modes: ["read", "write"] } as never;
const card = (over = {}) => ({ id: "p1", entityUri: `${PIN}/e/p1`, etag: null, road: "derived", source: [], name: "Ada", email: "ada@x.test", phone: "", photo: "", moreEmails: 0, morePhones: 0, rawEmail: "ada@x.test", rawPhone: undefined, ...over });
const none = { kind: "none" };
const cardState = (over = {}) => ({ kind: "card", card: card(over), otherOwnerCards: [] });
const button = (name: string) => screen.getByRole("button", { name }) as HTMLButtonElement;
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("VITE_ALLOW_CREATE", "1");
  vi.stubEnv("VITE_PROFILE_WRITE", "1");
  vi.stubEnv("VITE_VAULT_URL", PIN);
  h.loadProfile.mockResolvedValue(none);
});
afterEach(() => { cleanup(); vi.unstubAllEnvs(); });

test("W1: with no card the form is editable, the button says Create my profile card, and Save profile is never there", async () => {
  wrap(<ProfileView vault={vault} />);
  expect(await screen.findByRole("button", { name: "Create my profile card" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Save profile" })).toBeNull();
  for (const l of ["Name", "Email", "Phone"]) expect((screen.getByLabelText(l) as HTMLInputElement).disabled).toBe(false);
});

test("W1: Create runs once for two presses, the button is off while it runs, and Profile created. shows only after the refetch holds the typed values", async () => {
  let finish!: () => void;
  h.createProfileCard.mockReturnValue(new Promise<void>((r) => { finish = r; }).then(() => ({ id: "p1", etag: null, adopted: false })));
  wrap(<ProfileView vault={vault} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  type("Name", "Ada"); type("Email", "ada@x.test");
  const b = button("Create my profile card");
  fireEvent.click(b); fireEvent.click(b);
  fireEvent.submit(screen.getByRole("form", { name: "Profile" }));
  expect(h.createProfileCard).toHaveBeenCalledTimes(1);
  expect(h.createProfileCard.mock.calls[0][1]).toEqual({ name: "Ada", email: "ada@x.test", phone: "" });
  expect(button("Create my profile card").disabled).toBe(true);
  expect(screen.queryByText("Profile created.")).toBeNull();
  h.loadProfile.mockResolvedValue(cardState()); // the refetch now finds the card
  finish();
  expect((await screen.findByText("Profile created.")).tagName).toBe("P");
  expect(h.loadProfile.mock.calls.length).toBeGreaterThanOrEqual(2);
  expect(await screen.findByText("Own card id: p1")).toBeTruthy();
  expect(screen.getByText("Own card road: derived")).toBeTruthy();
});

test("W1: when the refetch does not find the card, the message is the refusal, not Profile created.", async () => {
  h.createProfileCard.mockResolvedValue({ id: "p1", etag: null, adopted: false }); // refetch still says none
  wrap(<ProfileView vault={vault} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  type("Name", "Ada");
  fireEvent.click(button("Create my profile card"));
  await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent === "The vault did not confirm the profile card.")).toBe(true));
  expect(screen.queryByText("Profile created.")).toBeNull();
});

test("W1: when the refetched card lacks the typed values, the message is the refusal", async () => {
  h.createProfileCard.mockResolvedValue({ id: "p1", etag: null, adopted: true });
  h.loadProfile.mockResolvedValueOnce(none).mockResolvedValue(cardState({ name: "Someone else", email: "" }));
  wrap(<ProfileView vault={vault} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  type("Name", "Ada"); type("Email", "ada@x.test");
  fireEvent.click(button("Create my profile card"));
  await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent === "The vault did not confirm the profile card.")).toBe(true));
  expect(screen.queryByText("Profile created.")).toBeNull();
});

test("W1: a 409 refusal from the door shows the server's message", async () => {
  h.createProfileCard.mockRejectedValue(new data.SelfCardRefusedError("Several cards could be yours; none is marked."));
  wrap(<ProfileView vault={vault} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  type("Name", "Ada");
  fireEvent.click(button("Create my profile card"));
  await waitFor(() => expect(screen.getAllByRole("alert").some((a) => a.textContent === "Several cards could be yours; none is marked.")).toBe(true));
  await waitFor(() => expect(button("Create my profile card").disabled).toBe(false));
});

test("W4: with no card the picture input is disabled and says Create your profile card first.", async () => {
  wrap(<ProfileView vault={vault} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  expect((screen.getByLabelText("Profile picture") as HTMLInputElement).disabled).toBe(true);
  expect(screen.getByText("Create your profile card first.")).toBeTruthy();
});

test("W4: with a card the picture input is on and the hint is gone; Picture saved. shows only when the read-back confirmed it", async () => {
  h.loadProfile.mockResolvedValue(cardState());
  h.setProfilePhoto.mockResolvedValueOnce({ confirmed: true, failed: [] });
  wrap(<ProfileView vault={vault} />);
  const pic = (await screen.findByLabelText("Profile picture")) as HTMLInputElement;
  expect(pic.disabled).toBe(false);
  expect(screen.queryByText("Create your profile card first.")).toBeNull();
  fireEvent.change(pic, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
  expect((await screen.findByText("Picture saved.")).tagName).toBe("P");
});

test("W4: a picture the read-back does not hold is not reported as saved, and the card is fetched again", async () => {
  h.loadProfile.mockResolvedValue(cardState());
  h.setProfilePhoto.mockResolvedValueOnce({ confirmed: false, failed: ["profilePhoto"] });
  wrap(<ProfileView vault={vault} />);
  const pic = (await screen.findByLabelText("Profile picture")) as HTMLInputElement;
  fireEvent.change(pic, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
  await waitFor(() => expect(screen.getAllByRole("alert").some((a) => /did not confirm/.test(a.textContent ?? ""))).toBe(true));
  expect(screen.queryByText("Picture saved.")).toBeNull();
  expect(h.loadProfile.mock.calls.length).toBeGreaterThanOrEqual(2);
});

test("W1: with a card the button is Save profile and Create my profile card is not shown", async () => {
  h.loadProfile.mockResolvedValue(cardState());
  wrap(<ProfileView vault={vault} />);
  expect(await screen.findByRole("button", { name: "Save profile" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Create my profile card" })).toBeNull();
});

const LAND = "https://landing.gilb.com/vault";
const landing = { vaultId: LAND, reachCount: 2, modes: ["read", "write"] } as never;
const records = { vaultId: PIN, reachCount: 2, modes: ["read", "write"] } as never;

test("B10 W2: the profile is read from the profile vault, not the records vault", async () => {
  wrap(<ProfileView vault={landing} recordsVault={records} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  expect(h.loadProfile.mock.calls[0]![0]).toMatchObject({ vaultId: LAND });
  expect(h.loadProfile.mock.calls.every((c) => (c[0] as { vaultId: string }).vaultId === LAND)).toBe(true);
});

test("B10 W3: Create my profile card goes to the profile vault, never to the records vault, when the two differ", async () => {
  h.createProfileCard.mockResolvedValue({ id: "p1", etag: null, adopted: false });
  wrap(<ProfileView vault={landing} recordsVault={records} />);
  await screen.findByRole("button", { name: "Create my profile card" });
  type("Name", "Ada");
  fireEvent.click(button("Create my profile card"));
  await waitFor(() => expect(h.createProfileCard).toHaveBeenCalledTimes(1));
  expect(h.createProfileCard.mock.calls[0]![0]).toMatchObject({ vaultId: LAND });
  expect(h.createProfileCard.mock.calls.some((c) => (c[0] as { vaultId: string }).vaultId === PIN)).toBe(false);
});

test("B10 W3: the picture and Save go to the profile vault", async () => {
  h.loadProfile.mockResolvedValue(cardState());
  h.setProfilePhoto.mockResolvedValue({ confirmed: true, failed: [] });
  h.saveProfile.mockResolvedValue({ confirmed: true, failed: [] });
  wrap(<ProfileView vault={landing} recordsVault={records} />);
  const pic = (await screen.findByLabelText("Profile picture")) as HTMLInputElement;
  fireEvent.change(pic, { target: { files: [new File(["x"], "a.png", { type: "image/png" })] } });
  await screen.findByText("Picture saved.");
  expect(h.setProfilePhoto.mock.calls[0]![0]).toMatchObject({ vaultId: LAND });
  type("Name", "Ada B");
  fireEvent.click(button("Save profile"));
  await screen.findByText("Profile saved.");
  expect(h.saveProfile.mock.calls[0]![0]).toMatchObject({ vaultId: LAND });
});

test("B10 W2: the Connection panel names both vaults on separate lines", async () => {
  h.loadProfile.mockResolvedValue(cardState());
  wrap(<ProfileView vault={{ vaultId: LAND, reachCount: 2, modes: ["read"] } as never} recordsVault={records} />);
  const section = await screen.findByRole("region", { name: "Connection" });
  const lines = Array.from(section.querySelectorAll("p")).map((p) => p.textContent);
  expect(lines).toContain(`Records vault: ${PIN} (read, write)`);
  expect(lines).toContain(`Profile vault: ${LAND} (read)`);
  expect(lines).toContain("Own card road: derived");
  expect(lines).toContain("Own card id: p1");
});
