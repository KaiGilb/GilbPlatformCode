// The starter against the fake platform: the real sign-in, vault, share and sign-out calls of the units it joins.
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { StarterApp, type StarterContext, type StarterSection } from "./StarterApp";
import { startStarter } from "./start";
import { askForCode, axeIds, CREATE, makeWorld, ready, settingsFor, setWidth, signIn, TYPE, type World } from "../test/world";

let world: World;
let seen: StarterContext[];
let draftMounts: number;

/** A field a person types in, as a record screen has: it counts how often it is mounted, and loses its text when it is mounted again. */
function Draft() {
  const [text, setText] = useState("");
  useState(() => ++draftMounts);
  return (
    <label>
      Draft
      <input value={text} onChange={(e) => setText(e.target.value)} />
    </label>
  );
}

const sections: StarterSection[] = [
  {
    id: "home",
    label: "Home",
    render: (ctx) => {
      seen.push(ctx);
      return (
        <>
          <p data-testid="home">Home of {ctx.vault.label}</p>
          <Draft />
        </>
      );
    },
  },
  { id: "other", label: "Other", render: () => <p data-testid="other">Other screen</p>, detail: () => <p data-testid="other-detail">Detail</p> },
];

function mount(over: Parameters<typeof settingsFor>[1] = {}) {
  const runtime = startStarter(settingsFor(world.fake, over));
  return { runtime, ...render(<StarterApp runtime={runtime} sections={sections} />) };
}

const storageKeys = () => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).sort();
const vaultsOfType = () => [...world.fake.state.vaults.values()].filter((v) => v.represents === TYPE);
const modesOf = (vaultId: string, principal: string) => [...(world.fake.state.grants.get(vaultId)?.get(principal) ?? [])].sort();

beforeEach(() => {
  setWidth(1280);
  world = makeWorld();
  seen = [];
  draftMounts = 0;
});
afterEach(() => {
  world.undo();
});

// Spec: brief items 3 and 4 — sign in and out with the signin unit; a vault for each new person, made once, opened at every later sign-in.
describe("sign in and the person's own vault", () => {
  it("a person with an account signs in; the first sign-in makes their vault for the app, once, and the frame shows", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    expect(await screen.findByRole("heading", { name: "Things" })).toBeTruthy(); // the sign-in card carries the app's name
    expect(await axeIds()).toEqual([]);
    expect(vaultsOfType()).toHaveLength(0);
    await signIn(user, world.fake, ann.email);
    await ready();

    const made = vaultsOfType();
    expect(made).toHaveLength(1);
    expect(made[0]!.name).toBe("annthings");
    expect(world.fake.calls.count(CREATE)).toBe(1);
    expect(screen.getByTestId("home").textContent).toBe("Home of annthings");
    const ctx = seen.at(-1)!;
    expect(ctx.vault).toEqual({ vaultId: made[0]!.id, label: "annthings", yours: true, canWrite: true });
    expect(ctx.principal).toBe(ann.principal);
    expect(ctx.actor).toBe(ann.landingVaultId);
    expect(ctx.signal.aborted).toBe(false);
    expect(screen.getByRole("main").contains(screen.getByTestId("home"))).toBe(true); // the open section is the page's main part
    expect(await axeIds()).toEqual([]);
    world.fake.assertClean();
  });

  it("a person with no account names their account on the card, and their vault for the app is made after it", async () => {
    const user = userEvent.setup();
    mount();
    await askForCode(user, "new@example.test");
    await screen.findByTestId("vault-name-step"); // the card offers a name for the new account
    await waitFor(() => expect((screen.getByTestId("vault-name-input") as HTMLInputElement).value).not.toBe(""));
    const name = (screen.getByTestId("vault-name-input") as HTMLInputElement).value;
    await user.type(screen.getByTestId("sign-in-code"), world.fake.pendingCode("new@example.test")!);
    await ready();

    const names = [...world.fake.state.vaults.values()].map((v) => v.name).sort();
    expect(names).toEqual([name, `${name}things`].sort());
    expect(vaultsOfType().map((v) => v.name)).toEqual([`${name}things`]);
    world.fake.assertClean();
  });

  it("signing out tells the sign-in server and shows the card; signing in again opens the same vault and makes no second one", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    const first = seen.at(-1)!;

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByLabelText("Email");
    expect(world.fake.calls.count("POST /base/auth/sign-out")).toBe(1);
    expect(first.signal.aborted).toBe(true); // a read a section started is told to stop
    expect(screen.queryByTestId("home")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull(); // the server was told, so there is no notice

    await signIn(user, world.fake, ann.email);
    await ready();
    expect(seen.at(-1)!.vault.vaultId).toBe(first.vault.vaultId);
    expect(world.fake.calls.count(CREATE)).toBe(1);
    expect(vaultsOfType()).toHaveLength(1);
    world.fake.assertClean();
  });

  it("a sign-in kept by the browser opens the vault again on a reload, with no card", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    const first = mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    first.unmount();

    mount(); // a new page: a new credential reads the kept sign-in
    await ready();
    expect(screen.queryByLabelText("Email")).toBeNull();
    expect(world.fake.calls.count(CREATE)).toBe(1);
    world.fake.assertClean();
  });
});

// Spec: Rule_Code_gilbplatformcode-unit RuleGpcunitNoSilentWait — no state waits without saying what it waits for.
describe("every wait and every stop says what it is", () => {
  it("says it is checking the sign-in, then that it is making the vault, while each is under way", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    expect(screen.getByRole("status").textContent).toBe("Checking your sign-in…");
    const release = world.fake.hold(CREATE);
    await signIn(user, world.fake, ann.email);
    expect((await screen.findByText("Opening your vault: making your vault for this app…")).getAttribute("role")).toBe("status");
    release();
    await ready();
  });

  it("says the platform is finishing a vault it only partly made, and then opens it", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    world.fake.partialNextCreateNamed();
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await screen.findByText("Opening your vault: the platform is finishing your new vault…");
    await ready();
    expect(vaultsOfType()).toHaveLength(1);
  }, 15000);

  it("a start that fails shows the platform's sentence; Try again opens the vault and makes one vault only", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    world.fake.failNext(CREATE, { status: 503, message: "The vault service is busy. Try again soon." });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Your vault could not be opened.");
    expect(alert.textContent).toContain("The vault service is busy. Try again soon.");
    const buttons = within(alert).getAllByRole("button").map((b) => b.textContent);
    expect(buttons).toEqual(["Sign out", "Try again"]); // the main act is rightmost
    expect(await axeIds()).toEqual([]);

    await user.click(within(alert).getByRole("button", { name: "Try again" }));
    await ready();
    expect(vaultsOfType()).toHaveLength(1);
  });

  it("from a failed start the person can sign out, and the card shows", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    world.fake.failNext(CREATE, { status: 503, message: "Busy." });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await user.click(within(await screen.findByRole("alert")).getByRole("button", { name: "Sign out" }));
    await screen.findByLabelText("Email");
  });

  it("a sign-out the server could not be told about still signs out here, and says so above the card", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    world.fake.failNext("POST /base/auth/sign-out", { status: 503, message: "Busy." });
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByLabelText("Email");
    expect(screen.getByRole("status").textContent).toContain("You are signed out on this device");
  });
});

// Spec: brief item 5 — share access to the vault with other users, see who has access, and remove it.
describe("share access to the vault", () => {
  it("the owner gives another person edit access, sees them in the list, and takes the access away", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const ben = world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    const vaultId = vaultsOfType()[0]!.id;

    await user.click(screen.getByRole("button", { name: "Share" }));
    const sheet = await screen.findByRole("dialog", { name: "Share annthings" });
    expect(sheet.textContent).toContain("People you add can see the records in this vault");
    await within(sheet).findByText("Nobody else has access yet.");
    await user.type(within(sheet).getByLabelText("Their vault name"), "ben");
    await user.click(within(sheet).getByRole("radio", { name: "Can edit" }));
    await user.click(within(sheet).getByRole("button", { name: "Share" }));
    const row = (await within(sheet).findByRole("button", { name: /^Remove / })).closest("li")!;
    expect(modesOf(vaultId, ben.principal)).toEqual(["read", "write"]);
    expect(row.textContent).toContain("Can edit");
    // The name typed is not kept on this device: the list shows only what the platform itself says about the person,
    // and the end of the key the platform gave, which is what tells this row from another.
    expect(row.textContent).toContain(`Registered principal, key ending ${ben.principal.slice(-6)}`);
    expect(row.textContent).toContain("No name was given for this person.");
    expect(storageKeys().filter((k) => k.includes("vss-names"))).toEqual([]);
    expect(await axeIds()).toEqual([]);

    await user.click(within(sheet).getByRole("button", { name: /^Remove / }));
    const question = within(sheet).getByRole("group", { name: /^Remove Registered principal, key ending / });
    expect(within(question).getAllByRole("button").map((b) => b.textContent)).toEqual(["Cancel", "Remove"]); // a verb, and the way out left of it
    await user.click(within(question).getByRole("button", { name: "Remove" }));
    await within(sheet).findByText("Nobody else has access yet.");
    expect(modesOf(vaultId, ben.principal)).toEqual([]);

    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    world.fake.assertClean();
  });

  it("two people given the same access are told apart in the list, and Remove on a row takes away that person's access and no other's", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const ben = world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const cara = world.fake.seedPerson({ email: "cara@example.test", vaultName: "cara" });
    const user = userEvent.setup();
    const first = mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    const vaultId = vaultsOfType()[0]!.id;
    await user.click(screen.getByRole("button", { name: "Share" }));
    let sheet = await screen.findByRole("dialog", { name: "Share annthings" });
    for (const [i, who] of ["ben", "cara"].entries()) {
      await user.type(within(sheet).getByLabelText("Their vault name"), who);
      await user.click(within(sheet).getByRole("button", { name: "Share" }));
      await waitFor(() => expect(within(sheet).getAllByRole("button", { name: /^Remove / })).toHaveLength(i + 1));
    }
    const removeButtons = () => within(sheet).getAllByRole("button", { name: /^Remove / });
    const readList = () => ({ rows: removeButtons().map((b) => b.closest("li")!.textContent), names: removeButtons().map((b) => b.getAttribute("aria-label")) });
    const shown = readList();
    expect(new Set(shown.rows).size, JSON.stringify(shown.rows)).toBe(2);
    expect(new Set(shown.names).size, JSON.stringify(shown.names)).toBe(2);
    // What tells them apart is the end of the key the platform gave for each, nothing typed and nothing kept.
    const nameFor = (principal: string) => `Remove Registered principal, key ending ${principal.slice(-6)}`;
    expect([...shown.names].sort()).toEqual([nameFor(ben.principal), nameFor(cara.principal)].sort());

    // The same list after a reload: the same two labels.
    first.unmount();
    mount();
    await ready();
    await user.click(screen.getByRole("button", { name: "Share" }));
    sheet = await screen.findByRole("dialog", { name: "Share annthings" });
    await waitFor(() => expect(removeButtons()).toHaveLength(2));
    expect(readList()).toEqual(shown);

    // Remove on Cara's row asks about Cara's key, and takes Cara's access away, not Ben's.
    await user.click(within(sheet).getByRole("button", { name: nameFor(cara.principal) }));
    const question = within(sheet).getByRole("group", { name: `${nameFor(cara.principal)}?` });
    await user.click(within(question).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeButtons()).toHaveLength(1));
    expect(modesOf(vaultId, cara.principal)).toEqual([]);
    expect(modesOf(vaultId, ben.principal)).toEqual(["read"]);
    expect(removeButtons()[0]!.getAttribute("aria-label")).toBe(nameFor(ben.principal));
  });

  it("a vault another person shared shows in the vault chip; opening it draws the section for that vault, view only when it is", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const ben = world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const bens = world.fake.seedVault({ name: "benthings", owner: ben, represents: TYPE });
    world.fake.grant(bens, ann, "read");
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    expect(screen.queryByText("View only")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Vault annthings. Change vault" }));
    const chooser = await screen.findByRole("dialog", { name: "Choose a vault" });
    await within(chooser).findByRole("button", { name: /benthings/ });
    // Every row of the chooser: the vaults of this app's type only. Ann's account vault (ann) is not one of them.
    const rows = [...chooser.querySelectorAll<HTMLButtonElement>(".vsw-row")];
    expect(rows.map((r) => r.textContent)).toEqual(["annthingsYours", "benthingsShared with you · View only"]);
    await user.click(rows[1]!);

    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("Home of benthings"));
    expect(seen.at(-1)!.vault).toEqual({ vaultId: bens.id, label: "benthings", yours: false, canWrite: false });
    expect(screen.getByText("View only")).toBeTruthy();

    // The person does not hold Control on the shared vault: the sheet says so and offers no form.
    await user.click(screen.getByRole("button", { name: "Share" }));
    const sheet = await screen.findByRole("dialog", { name: "Share benthings" });
    await within(sheet).findByText(/You don't hold Control on this vault/);
    expect(within(sheet).queryByLabelText("Their vault name")).toBeNull();
    await user.click(within(sheet).getByRole("button", { name: "Close" }));

    // A section that is refused the vault drops it; the person's own vault opens.
    act(() => seen.at(-1)!.vaultRefused());
    await waitFor(() => expect(screen.getByTestId("home").textContent).toBe("Home of annthings"));
  });

  it("the person's own vault for the app is not taken for one that was shared with them", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const ben = world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const bens = world.fake.seedVault({ name: "benthings", owner: ben, represents: TYPE });
    world.fake.grant(bens, ann, "write");
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    expect(vaultsOfType().map((v) => v.name).sort()).toEqual(["annthings", "benthings"]);
    expect(screen.getByTestId("home").textContent).toBe("Home of annthings");
  });
});

// Spec: brief item 1 — one code base, the app-shell frame on a wide window and on a phone.
describe("computer and phone", () => {
  it("on a wide window the sections are a menu beside the centre, and a section's detail has its own region", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    const menu = screen.getByRole("navigation", { name: "Sections" });
    expect(within(menu).getByRole("button", { name: "Home" }).getAttribute("aria-current")).toBe("page");
    expect(screen.queryByRole("navigation", { name: "Panels" })).toBeNull(); // no bottom bar
    expect(screen.queryByTestId("other-detail")).toBeNull();

    await user.click(within(menu).getByRole("button", { name: "Other" }));
    expect(screen.getByTestId("other")).toBeTruthy();
    expect(screen.getByTestId("other-detail")).toBeTruthy();
    expect(screen.queryByTestId("home")).toBeNull();
    expect(screen.getAllByRole("button", { name: "Sign out" })).toHaveLength(1);
  });

  it("on a phone the centre stands alone; the menu is a drawer with the sections, Share and Sign out, and it closes after a pick", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    setWidth(390);
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    expect(screen.getByTestId("home")).toBeTruthy();
    expect(screen.queryByRole("navigation", { name: "Sections" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull(); // not in the narrow header

    const bar = screen.getByRole("navigation", { name: "Panels" });
    await user.click(within(bar).getByRole("button", { name: "Menu" }));
    const drawer = await screen.findByRole("dialog", { name: "Things" });
    expect(within(drawer).getByRole("button", { name: "Share" })).toBeTruthy();
    expect(within(drawer).getByRole("button", { name: "Sign out" })).toBeTruthy();
    await user.click(within(drawer).getByRole("button", { name: "Other" }));
    expect(screen.queryByRole("dialog", { name: "Things" })).toBeNull();
    expect(screen.getByTestId("other")).toBeTruthy();

    await user.click(within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", { name: "Menu" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Things" })).getByRole("button", { name: "Share" }));
    expect(await screen.findByRole("dialog", { name: "Share annthings" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Things" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Close" }));

    await user.click(within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", { name: "Menu" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Things" })).getByRole("button", { name: "Sign out" }));
    await screen.findByLabelText("Email");
  });
});

// Spec: brief item 6 — a place for the project's records: what a person types in a record screen stays while they use the frame.
describe("what a person typed is not thrown away", () => {
  it("on a phone, Share from the menu drawer closes the drawer and keeps what the person typed in the open section", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    setWidth(390);
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    await user.type(screen.getByLabelText("Draft"), "half a record");
    const before = draftMounts;
    await user.click(within(screen.getByRole("navigation", { name: "Panels" })).getByRole("button", { name: "Menu" }));
    expect(await axeIds()).toEqual([]); // the drawer open
    await user.click(within(await screen.findByRole("dialog", { name: "Things" })).getByRole("button", { name: "Share" }));
    const sheet = await screen.findByRole("dialog", { name: "Share annthings" });
    expect(screen.queryByRole("dialog", { name: "Things" })).toBeNull(); // the drawer closed
    await within(sheet).findByText("Nobody else has access yet."); // and the Escape that closed it did not close the sheet
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    expect(draftMounts - before, "the section was mounted again").toBe(0);
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("half a record");
  });

  it("on a wide window, Share keeps it too (the known answer: nothing is redrawn there)", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    await user.type(screen.getByLabelText("Draft"), "half a record");
    await user.click(screen.getByRole("button", { name: "Share" }));
    await user.click(within(await screen.findByRole("dialog", { name: "Share annthings" })).getByRole("button", { name: "Close" }));
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("half a record");
  });

  it("opening another section does start that section afresh, and coming back starts the first afresh", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    await user.type(screen.getByLabelText("Draft"), "half a record");
    const menu = screen.getByRole("navigation", { name: "Sections" });
    await user.click(within(menu).getByRole("button", { name: "Other" }));
    await user.click(within(menu).getByRole("button", { name: "Home" }));
    expect((screen.getByLabelText("Draft") as HTMLInputElement).value).toBe("");
  });
});

// Spec: Rule_Code_gilb-app-stack-and-data RuleBaseappNoData and RuleBaseappTailwind — nothing of a person's is kept on the device only; navigable state is in the address.
describe("where the open section and vault are kept", () => {
  it("in the page's address: a reload opens the same vault and section, and sign-out takes them out again", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const ben = world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const bens = world.fake.seedVault({ name: "benthings", owner: ben, represents: TYPE });
    world.fake.grant(bens, ann, "write");
    const user = userEvent.setup();
    const first = mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    expect(window.location.search).toBe("");

    await user.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: "Other" }));
    await user.click(screen.getByRole("button", { name: "Vault annthings. Change vault" }));
    await user.click(await within(await screen.findByRole("dialog", { name: "Choose a vault" })).findByRole("button", { name: /benthings/ }));
    await screen.findByRole("button", { name: "Vault benthings. Change vault" });
    const address = new URLSearchParams(window.location.search);
    expect(address.get("section")).toBe("other");
    expect(address.get("vault")).toBe(bens.id);

    first.unmount();
    mount(); // a reload: the same address, the kept sign-in
    await ready();
    expect(screen.getByTestId("other")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vault benthings. Change vault" })).toBeTruthy();

    await user.click(screen.getByRole("button", { name: "Sign out" }));
    await screen.findByLabelText("Email");
    expect(window.location.search).toBe("");
  });

  it("an address that names a section that is not there and a vault the person cannot open opens their own vault and the first section, and is put right", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const ben = world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const bens = world.fake.seedVault({ name: "benthings", owner: ben, represents: TYPE }); // a real vault, with no grant for Ann
    history.replaceState(null, "", `/?section=nowhere&vault=${encodeURIComponent(bens.id)}&ref=mail`);
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    expect(screen.getByTestId("home").textContent).toBe("Home of annthings");
    expect(window.location.search).toBe("?ref=mail"); // the two wrong parts are gone; what is not the starter's stays
    world.fake.assertClean();
  });

  it("the address names the open section and vault only when they are not the first section and the person's own vault", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    const menu = screen.getByRole("navigation", { name: "Sections" });
    await user.click(within(menu).getByRole("button", { name: "Other" }));
    expect(window.location.search).toBe("?section=other");
    await user.click(within(menu).getByRole("button", { name: "Home" }));
    expect(window.location.search).toBe("");
  });

  it("on the device it keeps only the frame's layout and the sign-in unit's own keys, under the app's id", async () => {
    const ann = world.fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
    world.fake.seedPerson({ email: "ben@example.test", vaultName: "ben" });
    const user = userEvent.setup();
    mount();
    await signIn(user, world.fake, ann.email);
    await ready();
    await user.click(within(screen.getByRole("navigation", { name: "Sections" })).getByRole("button", { name: "Other" }));
    await user.click(screen.getByRole("button", { name: "Hide selection panel" })); // the frame keeps its layout
    await user.click(screen.getByRole("button", { name: "Share" }));
    const sheet = await screen.findByRole("dialog", { name: "Share annthings" });
    await user.type(within(sheet).getByLabelText("Their vault name"), "ben");
    await user.click(within(sheet).getByRole("button", { name: "Share" }));
    await within(sheet).findByRole("button", { name: /^Remove / });

    const allowed = [/^things\.shell\.layout\.v1$/, /^things:(own|last|pending):/, /^things\.pendingSignInEmail$/];
    const keys = storageKeys();
    expect(keys.filter((k) => !allowed.some((re) => re.test(k)))).toEqual([]);
    expect(keys).toContain("things.shell.layout.v1");
    expect(Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i)!).filter((k) => !allowed.some((re) => re.test(k)))).toEqual([]);
  });
});

// Spec: brief item 7 — what a new app may set (its own words, a note on the sign-in page).
describe("what a host may change", () => {
  it("its own words replace the starter's, and a note can stand above the sign-in card", async () => {
    const runtime = startStarter(settingsFor(world.fake));
    render(<StarterApp runtime={runtime} sections={sections} words={{ checkingSignIn: "One moment." }} signInNote={<p>Test platform</p>} />);
    expect(screen.getByRole("status").textContent).toBe("One moment.");
    await screen.findByLabelText("Email");
    expect(screen.getByText("Test platform")).toBeTruthy();
  });

  it("no section at all is refused with a sentence", () => {
    const runtime = startStarter(settingsFor(world.fake));
    expect(() => render(<StarterApp runtime={runtime} sections={[]} />)).toThrow("starter-app: pass at least one section");
  });
});
