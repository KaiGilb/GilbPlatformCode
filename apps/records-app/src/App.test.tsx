import { afterEach, expect, test, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";

const things = [
  { id: "1", entityUri: "u1", name: "Red kettle", description: "boils water" },
  { id: "2", entityUri: "u2", name: "Blue pot", description: "for soup" },
];
const addThing = vi.fn(async () => ({ id: "3" }));
const saveProfile = vi.fn(async () => undefined);
const setProfilePhoto = vi.fn(async () => undefined);

vi.mock("./data", async () => {
  const real = await vi.importActual<typeof import("./data")>("./data");
  return {
    ...real,
    listThings: vi.fn(async () => things),
    addThing,
    loadProfile: vi.fn(async () => ({ id: "p", entityUri: "e", etag: null, name: "Ada", email: "ada@x.test", phone: "+1 555 0100", photo: "" })),
    saveProfile,
    setProfilePhoto,
    photoObjectUrl: vi.fn(async () => null),
  };
});
vi.mock("./platform", () => ({ credential: {}, findMyVault: vi.fn(), signInApp: {}, signInAuth: {} }));

const { RecordCard, RecordList, ProfileView } = await import("./App");

const wrap = (ui: ReactNode) => render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{ui}</QueryClientProvider>);
afterEach(cleanup);

test("records are listed and a click opens the record on a card", async () => {
  let opened: unknown = null;
  wrap(<RecordList vaultId="v" onOpen={(t) => (opened = t)} />);
  fireEvent.click(await screen.findByText("Blue pot"));
  expect(opened).toMatchObject({ id: "2" });
  cleanup();
  render(<RecordCard thing={things[1]} onBack={() => undefined} />);
  expect(screen.getByRole("heading", { name: "Blue pot" })).toBeTruthy();
  expect(screen.getByText("for soup")).toBeTruthy();
});

test("typing in the search box narrows the list", async () => {
  wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "soup" } });
  expect(screen.queryByText("Red kettle")).toBeNull();
  expect(screen.getByText("Blue pot")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Search records"), { target: { value: "zzz" } });
  expect(screen.getByText("No record matches.")).toBeTruthy();
});

test("the add form sends name and description", async () => {
  wrap(<RecordList vaultId="v" onOpen={() => undefined} />);
  await screen.findByText("Red kettle");
  fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Spoon" } });
  fireEvent.change(screen.getByLabelText("Description"), { target: { value: "steel" } });
  fireEvent.click(screen.getByRole("button", { name: "Add record" }));
  await waitFor(() => expect(addThing).toHaveBeenCalledWith("v", "Spoon", "steel"));
});

test("the profile shows contact information, saves changes, and takes a picture", async () => {
  wrap(<ProfileView vaultId="v" />);
  const email = (await screen.findByLabelText("Email")) as HTMLInputElement;
  expect(email.value).toBe("ada@x.test");
  expect(screen.getByText("Call")).toBeTruthy();
  fireEvent.change(email, { target: { value: "new@x.test" } });
  fireEvent.click(screen.getByRole("button", { name: "Save profile" }));
  await waitFor(() => expect(saveProfile).toHaveBeenCalledWith("v", expect.objectContaining({ id: "p" }), { name: "Ada", email: "new@x.test", phone: "+1 555 0100" }));
  const file = new File(["x"], "me.png", { type: "image/png" });
  fireEvent.change(screen.getByLabelText("Profile picture"), { target: { files: [file] } });
  await waitFor(() => expect(setProfilePhoto).toHaveBeenCalledWith("v", expect.objectContaining({ id: "p" }), file));
});
