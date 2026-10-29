// The three screens: settings (kept, editable, reaching the provider), sign-in (a code leads to the card, sign-out returns), and the
// card (each of the four types drawn, read-only by default, one edit one signed PATCH, a nameless link shown by its main tag).
import { afterEach, describe, expect, test, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { __startCardsInEditMode } from "@kaigilb/gilbplatformcode-card-mode";
import { App } from "./App";
import { SETTINGS_KEY, loadSettings, providerSettings } from "./settings";
import { parseAddress } from "./address";
import { createFakeVault, entityUriOf, ORIGIN, type ServedRecord } from "../test/fakeVault";
import { TEST_SETTINGS, fakeCredential, keepSettings, okTransport, signIn, signedInApp } from "../test/helpers";

afterEach(() => vi.unstubAllGlobals());

const VALUE_GROUPS = ["plan-type-level", "plan-picture", "plan-scale", "plan-endpoint", "plan-scale-variables", "plan-value-levels", "plan-value-meters", "plan-stakeholder", "plan-function-of-value", "plan-description", "plan-authority", "plan-type"];
const FUNCTION_GROUPS = ["plan-type-level", "plan-description", "plan-stakeholder", "plan-authority", "plan-part-of", "plan-sub-functions", "plan-meter", "plan-status", "plan-function-of-value", "plan-solutions", "plan-type"];
const SOLUTION_GROUPS = ["plan-type-level", "plan-description", "plan-stakeholder", "plan-authority", "plan-type", "plan-meter", "plan-status", "plan-impacts", "plan-solution-of", "plan-part-of-system"];
const RESOURCE_GROUPS = ["plan-type-level", "plan-picture", "plan-scale", "plan-endpoint", "plan-scale-variables", "plan-value-levels", "plan-value-meters", "plan-resource-owner", "plan-stakeholder", "plan-description", "plan-authority", "plan-type"];

const records = (extra: ServedRecord[] = []): ServedRecord[] => [
  { id: "val1", type: "t:Value", facts: { unitTag: "Speed" }, version: 1 },
  { id: "fn1", type: "t:Function", facts: { unitTag: "Content.Measure" }, version: 1 },
  { id: "sol1", type: "t:Solution", facts: { unitTag: "Hinge.Tighten" }, version: 1 },
  { id: "res1", type: "t:Resource", facts: { unitTag: "Cost.RiverProject" }, version: 1 },
  ...extra,
];

const groups = () =>
  [...document.querySelectorAll<HTMLElement>('[data-testid="card-group"]')].map((el) => el.getAttribute("data-group") ?? "").filter((g) => g.startsWith("plan-"));

/** Type an address into the card screen, choose "Can edit" as asked, and press Show card. */
async function show(user: ReturnType<typeof userEvent.setup>, text: string, canEdit = false) {
  await user.type(screen.getByLabelText(/Record address or id/), text);
  if (canEdit) await user.click(screen.getByLabelText("Can edit"));
  await user.click(screen.getByRole("button", { name: "Show card" }));
}

describe("settings", () => {
  test("first run shows the settings screen; saved values are kept in localStorage and come back after a reload", async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    expect(screen.getByRole("form", { name: "Settings" })).toBeTruthy();
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
    await user.type(screen.getByLabelText(/Platform origin of the vault/), TEST_SETTINGS.origin);
    await user.type(screen.getByLabelText(/^Ontology origin/), TEST_SETTINGS.ontologyOrigin);
    await user.type(screen.getByLabelText(/System vault hosts/), TEST_SETTINGS.systemVaultHosts);
    await user.type(screen.getByLabelText(/System host labels/), TEST_SETTINGS.systemHostLabels);
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(loadSettings()).toEqual(TEST_SETTINGS);
    expect(screen.getByTestId("sign-in-email")).toBeTruthy();
    first.unmount();
    render(<App />);
    expect(screen.queryByRole("form", { name: "Settings" })).toBeNull();
    expect(screen.getByTestId("sign-in-email")).toBeTruthy();
  });

  test("a missing or malformed value is named and nothing is kept", async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.type(screen.getByLabelText(/Platform origin of the vault/), "not an origin");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("The platform origin must look like https://host");
    expect(alert.textContent).toContain("The ontology origin is needed.");
    expect(alert.textContent).toContain("At least one system vault host is needed.");
    expect(localStorage.getItem(SETTINGS_KEY)).toBeNull();
  });

  test("the settings can be edited later, and the edited values are kept", async () => {
    keepSettings();
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const box = screen.getByLabelText(/System host labels/);
    await user.clear(box);
    await user.type(box, "id, ontology, extra");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(loadSettings()!.systemHostLabels).toBe("id, ontology, extra");
    expect(screen.getByTestId("sign-in-email")).toBeTruthy();
  });

  test("the values become the provider's props, lists split and optional ones left out when empty", () => {
    expect(providerSettings(TEST_SETTINGS)).toEqual({
      origin: ORIGIN,
      ontologyOrigin: TEST_SETTINGS.ontologyOrigin,
      systemVaultHosts: ["ontology.platform.example.test", "vedas.example.test"],
      systemHostLabels: ["id", "ontology"],
    });
    expect(providerSettings({ ...TEST_SETTINGS, minOntologyQuery: "4", localRigHosts: "a, b", publicCorpusOrigin: " https://corpus.example.test " }).settings).toEqual({
      minOntologyQuery: 4,
      localRigHosts: ["a", "b"],
      publicCorpusOrigin: "https://corpus.example.test",
    });
  });

  test("the settings reach the provider: the card reads at the origin that was typed", async () => {
    const vault = createFakeVault(records());
    vi.stubGlobal("fetch", vault.fetch);
    const { user } = await signedInApp();
    await show(user, "val1");
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    expect(vault.requests("GET", /\/lws\/r\/val1$/)[0]!.url).toBe(`${ORIGIN}/lws/r/val1`);
  });
});

describe("sign-in", () => {
  test("an email and a code lead to the card screen, through the credential; nothing is stored of the session", async () => {
    keepSettings();
    const creds = fakeCredential();
    const t = okTransport();
    render(<App makeSession={() => creds.credential} transport={t.transport} />);
    expect(screen.queryByRole("region", { name: "Card" })).toBeNull();
    await signIn(userEvent.setup());
    expect(t.sent).toContain(`${ORIGIN}/base/auth/email/request-code`);
    expect(creds.signInWithCode).toHaveBeenCalledTimes(1);
    expect(creds.signInWithCode.mock.calls[0]!.slice(0, 3)).toEqual([ORIGIN, "ann@example.test", "123456"]);
    expect(Object.keys(localStorage as unknown as object)).not.toContain("token");
    expect(localStorage.getItem(SETTINGS_KEY)).not.toContain("fake-access-token");
  });

  test("Sign out drops the credential and returns to the sign-in screen", async () => {
    const creds = fakeCredential();
    const { user } = await signedInApp(creds);
    expect(screen.getByRole("button", { name: "Sign out" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Sign out" }));
    expect(creds.invalidate).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("sign-in-email")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Card" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Sign out" })).toBeNull();
  });

  test("changing the platform origin while signed in signs out", async () => {
    const creds = fakeCredential();
    const { user } = await signedInApp(creds);
    await user.click(screen.getByRole("button", { name: "Settings" }));
    const box = screen.getByLabelText(/Platform origin of the vault/);
    await user.clear(box);
    await user.type(box, "https://other.example.test");
    await user.click(screen.getByRole("button", { name: "Save settings" }));
    expect(creds.invalidate).toHaveBeenCalledWith(true);
    expect(screen.getByTestId("sign-in-email")).toBeTruthy();
  });
});

describe("address", () => {
  test("an id, an address and a bad text", () => {
    expect(parseAddress(" val1 ")).toEqual({ ok: true, id: "val1", at: null });
    expect(parseAddress(`${ORIGIN}/base/e/val1`)).toEqual({ ok: true, id: "val1", at: `${ORIGIN}/base/e/val1` });
    expect(parseAddress("").ok).toBe(false);
    expect(parseAddress("https://host/base/x/val1").ok).toBe(false);
  });
});

describe("the card screen", () => {
  test.each([
    ["Value", "val1", VALUE_GROUPS],
    ["Function", "fn1", FUNCTION_GROUPS],
    ["Solution", "sol1", SOLUTION_GROUPS],
    ["Development Resource", "res1", RESOURCE_GROUPS],
  ] as const)("a %s: its address draws that card, read-only by default, and with Can edit on it lists every group of its README", async (_name, id, expected) => {
    const vault = createFakeVault(records());
    vi.stubGlobal("fetch", vault.fetch);
    const creds = fakeCredential();
    const { user } = await signedInApp(creds);

    // Read-only by default: the card is drawn, there is no edit control, and nothing is written.
    expect((screen.getByLabelText("Can edit") as HTMLInputElement).checked).toBe(false);
    await show(user, entityUriOf(id));
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    await waitFor(() => expect(vault.requests("GET", /\/base\/find-by-attribute\?/).length).toBeGreaterThan(0));
    expect(screen.queryByRole("button", { name: "Edit this card" })).toBeNull();
    expect(vault.requests("PATCH", /./)).toHaveLength(0);
    // The reads were signed through the credential.
    for (const r of vault.requests("GET", /\/lws\/r\//)) {
      expect(r.headers.authorization).toBe("DPoP fake-access-token");
      expect(r.headers.dpop).toBe(`proof(GET ${r.url})`);
    }

    // Can edit on: the Edit control appears, and in edit with every group shown the card lists the groups its README lists.
    await user.click(screen.getByLabelText("Can edit"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Edit this card" })).toBeTruthy());
    __startCardsInEditMode(true);
    await user.click(screen.getByRole("button", { name: "Edit this card" }));
    await waitFor(() => expect(groups()).toEqual(expected));
  });

  test("a bare id is read at the origin that was typed", async () => {
    const vault = createFakeVault(records());
    vi.stubGlobal("fetch", vault.fetch);
    const { user } = await signedInApp();
    await show(user, "fn1");
    await waitFor(() => expect(screen.getByTestId("plan-function-form")).toBeTruthy());
    expect(vault.requests("GET", /\/lws\/r\/fn1$/)[0]!.url).toBe(`${ORIGIN}/lws/r/fn1`);
  });

  test("one edit is one signed PATCH, with the version the record was read at (a Value)", async () => {
    const vault = createFakeVault(records());
    vi.stubGlobal("fetch", vault.fetch);
    const creds = fakeCredential();
    const { user } = await signedInApp(creds);
    await show(user, entityUriOf("val1"), true);
    await user.click(await screen.findByRole("button", { name: "Edit this card" }));
    const box = await screen.findByLabelText("Subject words");
    await user.click(box);
    await user.type(box, "the app");
    await user.tab();
    await waitFor(() => expect(vault.requests("PATCH", /./)).toHaveLength(1));
    const url = `${ORIGIN}/lws/r/val1`;
    const sent = vault.requests("PATCH", /./)[0]!;
    expect(sent.url).toBe(url);
    expect(sent.headers.authorization).toBe("DPoP fake-access-token");
    expect(sent.headers.dpop).toBe(`proof(PATCH ${url})`);
    expect(sent.headers["content-type"]).toBe("application/merge-patch+json");
    expect(sent.headers["if-match"]).toBe('"v1"');
    expect(creds.fake.signed).toContainEqual({ method: "PATCH", url });
    expect(vault.records.get("val1")!.version).toBe(2);
  });

  test.each([
    ["Function", "fn1"],
    ["Solution", "sol1"],
  ] as const)("one edit of a %s (the text of one Description part) is one signed PATCH to the part's record", async (_name, id) => {
    const part: ServedRecord = {
      id: "part1",
      type: "t:SpecificationElement",
      facts: { unitTag: "A.B.Wheel", body: "round", partOf: { "@id": entityUriOf(id) }, elementOrder: 1 },
      version: 1,
    };
    const vault = createFakeVault(records([part]));
    vi.stubGlobal("fetch", vault.fetch);
    const { user, fake } = await signedInApp();
    await show(user, entityUriOf(id), true);
    await user.click(await screen.findByRole("button", { name: "Edit this card" }));
    await user.click(await screen.findByRole("button", { name: "round" }));
    const box = await screen.findByLabelText("Edit Wheel");
    await user.clear(box);
    await user.type(box, "square");
    fireEvent.blur(box);
    await waitFor(() => expect(vault.requests("PATCH", /./)).toHaveLength(1));
    const url = `${ORIGIN}/lws/r/part1`;
    const sent = vault.requests("PATCH", /./)[0]!;
    expect(sent.url).toBe(url);
    expect(sent.headers.authorization).toBe("DPoP fake-access-token");
    expect(sent.headers.dpop).toBe(`proof(PATCH ${url})`);
    expect(sent.headers["if-match"]).toBe('"v1"');
    expect(sent.body).toContain("square");
    expect(fake.signed).toContainEqual({ method: "PATCH", url });
    expect(vault.records.get("part1")!.facts.body).toBe("square");
    expect(vault.requests("PATCH", /./)).toHaveLength(1);
  });

  test("one edit of a Development Resource (its Endpoint) is one signed PATCH to that record", async () => {
    const vault = createFakeVault(records());
    vi.stubGlobal("fetch", vault.fetch);
    const { user } = await signedInApp();
    await show(user, entityUriOf("res1"), true);
    await user.click(await screen.findByRole("button", { name: "Edit this card" }));
    const box = await screen.findByLabelText("Subject words");
    await user.click(box);
    await user.type(box, "the river");
    await user.tab();
    await waitFor(() => expect(vault.requests("PATCH", /./)).toHaveLength(1));
    const url = `${ORIGIN}/lws/r/res1`;
    const sent = vault.requests("PATCH", /./)[0]!;
    expect(sent.url).toBe(url);
    expect(sent.headers.authorization).toBe("DPoP fake-access-token");
    expect(sent.headers.dpop).toBe(`proof(PATCH ${url})`);
    expect(sent.headers["if-match"]).toBe('"v1"');
  });

  test("a linked record that holds no name shows its main tag, read in a signed POST to the masters route", async () => {
    const vault = createFakeVault(
      records([{ id: "nv1", type: "t:Value", facts: { measures: { "@id": entityUriOf("fn1") } }, version: 1, mainTag: "Speed.Main" }]),
    );
    vi.stubGlobal("fetch", vault.fetch);
    const { user, fake } = await signedInApp();
    await show(user, entityUriOf("fn1"));
    await waitFor(() => expect(document.querySelector('[data-group="plan-function-of-value"]')?.textContent).toContain("Speed.Main"));
    const url = `${ORIGIN}/base/tag/masters`;
    expect(vault.tagReads.length).toBeGreaterThan(0);
    for (const r of vault.tagReads) {
      expect(r.url).toBe(url);
      expect(r.headers.authorization).toBe("DPoP fake-access-token");
      expect(r.headers.dpop).toBe(`proof(POST ${url})`);
    }
    expect(fake.signed).toContainEqual({ method: "POST", url });
    expect(vault.requests("POST", /./)).toHaveLength(0);
  });

  test("a record of another type is named in a plain sentence and no card is drawn", async () => {
    const vault = createFakeVault(records([{ id: "n1", type: "t:Task", facts: { title: "Do it" }, version: 1 }]));
    vi.stubGlobal("fetch", vault.fetch);
    const { user } = await signedInApp();
    await show(user, entityUriOf("n1"));
    await screen.findByText(/a record of type Task is not drawn/);
    expect(screen.queryByTestId("plan-function-form")).toBeNull();
  });

  test("an address that answers nothing, and text that is not an address, are said in words", async () => {
    const vault = createFakeVault(records());
    vi.stubGlobal("fetch", vault.fetch);
    const { user } = await signedInApp();
    await show(user, entityUriOf("nope"));
    await screen.findByText("No record answers at that address.");
    await user.clear(screen.getByLabelText(/Record address or id/));
    await user.type(screen.getByLabelText(/Record address or id/), "https://host/base/x/val1");
    await user.click(screen.getByRole("button", { name: "Show card" }));
    expect(within(screen.getByRole("region", { name: "Card" })).getByRole("alert").textContent).toContain("That is not a record address");
  });
});
