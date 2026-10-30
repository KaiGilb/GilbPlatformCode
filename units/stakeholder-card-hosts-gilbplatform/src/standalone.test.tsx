// The standalone Org units drawn inside ONLY the provider, over the fake platform: no host object written. Each one reads its host from a context the
// provider mounts (the mark's, the Employees group's, the pickers' query hook); the card-references host is a factory, called here as a developer would.
import { describe, expect, test, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { OrgMark } from "@kaigilb/gilbplatformcode-org-mark";
import { OrgEmployeesSection, type RecordFaceProps } from "@kaigilb/gilbplatformcode-org-employees";
import { OrgPartOfSection, OrgUnitsSection } from "@kaigilb/gilbplatformcode-org-hierarchy";
import { removeCardReference } from "@kaigilb/gilbplatformcode-card-references";
import { createCardReferencesHost } from "./index";
import { HOST, P, createWorld, type World } from "../test/world";
import { mountInProvider } from "../test/harness";

async function setUp(options: Parameters<typeof createWorld>[0] = {}): Promise<World> {
  const world = await createWorld(options);
  vi.stubGlobal("fetch", world.fetch);
  return world;
}
const employ = (world: World, org: string, name: string, title = "Engineer", extra: Record<string, unknown> = {}) => {
  const person = world.platform.seed(P, "t:Person", { "a:name": name, ...extra });
  world.platform.seed(P, "t:Employment", { "a:employer": { "@id": org }, "a:employee": { "@id": person }, "a:jobTitle": title });
  return person;
};

describe("org-mark (OrgMarkHostContext)", () => {
  test("draws the logo: the bytes of a file of the vault, read with the credential", async () => {
    const world = await setUp({ files: { orglogo: "logo-bytes" } });
    mountInProvider(world, <OrgMark logo="/files/orglogo" vaultId={P} name="Acme" />);
    await waitFor(() => expect(screen.getByTestId("org-mark").getAttribute("data-has-logo")).toBe("true"));
    const reads = world.requests("GET", /\/files\/orglogo$/);
    expect(reads.length).toBe(1);
    expect(reads[0]!.url).toBe(`${HOST}/files/orglogo`);
    expect(reads[0]!.headers.authorization).toBe("DPoP fake-access-token");
    expect(reads[0]!.headers.dpop).toBe(`proof(GET ${reads[0]!.url})`);
  });

  test("a file the vault does not have leaves the initial, and a file over the bound is not drawn", async () => {
    const world = await setUp({ files: { huge: "x".repeat(400_000) } });
    mountInProvider(
      world,
      <>
        <OrgMark logo="/files/missing" vaultId={P} name="Acme" />
        <OrgMark logo="/files/huge" vaultId={P} name="Nord" />
      </>,
    );
    await waitFor(() => expect(world.requests("GET", /\/files\/huge$/).length).toBeGreaterThan(0));
    await waitFor(() => expect(world.requests("GET", /\/files\/missing$/).length).toBeGreaterThan(0));
    const marks = screen.getAllByTestId("org-mark");
    expect(marks.map((m) => m.textContent)).toEqual(["A", "N"]);
    expect(marks.map((m) => m.getAttribute("data-has-logo"))).toEqual(["false", "false"]);
  });
});

describe("org-employees (OrgEmployeesHostContext)", () => {
  test("lists the people whose employment names the organization, with their titles, and opens one", async () => {
    const world = await setUp();
    const org = world.platform.seed(P, "t:Organization", { "a:name": "Acme" });
    const eva = employ(world, org, "Eva Berg", "Engineer");
    employ(world, org, "Per Dal", "Designer");
    const opened: string[] = [];
    mountInProvider(world, <OrgEmployeesSection orgUri={org} vaultId={P} onOpen={(id) => void opened.push(id)} />);
    await waitFor(() => expect(screen.getAllByTestId("org-employee").length).toBe(2), { timeout: 8000 });
    expect(screen.getAllByTestId("org-employee-name").map((e) => e.textContent).sort()).toEqual(["Eva Berg", "Per Dal"]);
    expect(screen.getAllByTestId("org-employee-title").map((e) => e.textContent).sort()).toEqual(["Designer", "Engineer"]);
    expect(screen.getByTestId("org-employees-count").textContent).toBe("2 people");
    // `readResources` is the provider's: every employment and person read carried the credential.
    const reads = world.calls.filter((c) => c.method === "GET" && /\/lws\/r\//.test(c.url));
    expect(reads.length).toBeGreaterThanOrEqual(4);
    for (const r of reads) expect(r.headers.authorization).toBe("DPoP fake-access-token");
    fireEvent.click(screen.getAllByTestId("org-employee").find((b) => within(b).queryByText("Eva Berg"))!);
    expect(opened).toEqual([eva.split("/").pop()]);
  });

  test("the photo term's keys find a person's picture, and the developer's RecordFace is drawn with it (without one no face is drawn)", async () => {
    const world = await setUp();
    const org = world.platform.seed(P, "t:Organization", { "a:name": "Acme" });
    employ(world, org, "Eva Berg", "Engineer", { "a:profilePhoto": "/files/eva" });
    const faces: RecordFaceProps[] = [];
    const RecordFace = (p: RecordFaceProps) => {
      faces.push(p);
      return <i data-testid="face" />;
    };
    mountInProvider(world, <OrgEmployeesSection orgUri={org} vaultId={P} onOpen={() => {}} />, { RecordFace });
    await waitFor(() => expect(screen.getByTestId("face")).toBeTruthy(), { timeout: 8000 });
    expect(faces[faces.length - 1]).toMatchObject({ photoRef: "/files/eva", vaultId: P, name: "Eva Berg" });
  });

  test("no RecordFace given: the row draws no face and still shows the name and the title", async () => {
    const world = await setUp();
    const org = world.platform.seed(P, "t:Organization", { "a:name": "Acme" });
    employ(world, org, "Eva Berg", "Engineer", { "a:profilePhoto": "/files/eva" });
    mountInProvider(world, <OrgEmployeesSection orgUri={org} vaultId={P} onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("org-employee-name").textContent).toBe("Eva Berg"), { timeout: 8000 });
    expect(screen.getByTestId("org-employee-title").textContent).toBe("Engineer");
    expect(document.querySelector('[data-testid="org-employee"] img, [data-testid="face"]')).toBeNull();
  });

  test("the full list is a history entry of sheet-history: Show all pushes one, Back closes the sheet", async () => {
    const world = await setUp();
    const org = world.platform.seed(P, "t:Organization", { "a:name": "Acme" });
    for (let i = 0; i < 12; i++) employ(world, org, `Person ${String(i).padStart(2, "0")}`);
    mountInProvider(world, <OrgEmployeesSection orgUri={org} vaultId={P} onOpen={() => {}} />);
    await waitFor(() => expect(screen.getByTestId("org-employees-showall")).toBeTruthy(), { timeout: 8000 });
    const before = window.history.length;
    fireEvent.click(screen.getByTestId("org-employees-showall"));
    await waitFor(() => expect(screen.getByTestId("org-employees-sheet")).toBeTruthy());
    expect(window.history.length).toBe(before + 1);
    act(() => window.history.back());
    await waitFor(() => expect(screen.queryByTestId("org-employees-sheet")).toBeNull());
  });
});

describe("org-hierarchy (the Employees host, the mark's and the pickers' query hook)", () => {
  test("the units below an organization: names, a logo read through the mark's host, and the employment count of each", async () => {
    const world = await setUp({ files: { northlogo: "north-bytes" } });
    const org = world.platform.seed(P, "t:Organization", { "a:name": "Acme" });
    const north = world.platform.seed(P, "t:Organization", { "a:name": "Acme North", "a:parentOrganization": { "@id": org }, "a:logo": "/files/northlogo" });
    world.platform.seed(P, "t:Organization", { "a:name": "Acme South", "a:parentOrganization": { "@id": org } });
    employ(world, north, "Eva Berg");
    const opened: string[] = [];
    mountInProvider(world, <OrgUnitsSection orgUri={org} vaultId={P} onOpen={(id) => void opened.push(id)} />);
    await waitFor(() => expect(screen.getAllByTestId("org-unit").length).toBe(2), { timeout: 8000 });
    expect(screen.getAllByTestId("org-unit-name").map((e) => e.textContent).sort()).toEqual(["Acme North", "Acme South"]);
    await waitFor(() => expect(screen.getAllByTestId("org-mark").map((m) => m.getAttribute("data-has-logo")).sort()).toEqual(["false", "true"]));
    await waitFor(() => expect(screen.getAllByTestId("org-unit-count").map((e) => e.textContent).sort()).toEqual(["0 employments", "1 employment"]));
    expect(world.requests("GET", /\/files\/northlogo$/)[0]!.headers.authorization).toBe("DPoP fake-access-token");
    fireEvent.click(screen.getAllByTestId("org-unit")[0]!);
    expect(opened.length).toBe(1);
  });

  test("the picker of 'Part of' runs its search through the provider's query hook, and choosing writes the parent with the credential", async () => {
    const world = await setUp();
    const head = world.platform.seed(P, "t:Organization", { "a:name": "Acme Holding" });
    const sub = world.platform.seed(P, "t:Organization", { "a:name": "Acme North" });
    const saved = vi.fn();
    mountInProvider(world, <OrgPartOfSection record={{ id: sub.split("/").pop()!, entityUri: sub }} vaultId={P} parentRef="" canEdit={true} onOpen={() => {}} onSaved={saved} />);
    fireEvent.click(screen.getByTestId("org-partof-add"));
    await waitFor(() => expect(screen.getByTestId("org-record-picker")).toBeTruthy());
    const hit = await screen.findByText("Acme Holding", {}, { timeout: 8000 });
    fireEvent.click(hit.closest("button")!);
    await waitFor(() => expect(saved).toHaveBeenCalledTimes(1), { timeout: 8000 });
    const patch = world.requests("PATCH", new RegExp(`/lws/r/${sub.split("/").pop()}$`))[0]!;
    expect(patch.headers.authorization).toBe("DPoP fake-access-token");
    expect(JSON.parse(patch.body!)).toMatchObject({ "a:parentOrganization": { "@id": head } });
  });
});

describe("card-references (createCardReferencesHost)", () => {
  test("removing a link patches the one key, conditional on the version read (If-Match), with the credential", async () => {
    const world = await setUp();
    const target = world.platform.seed(P, "t:Person", { "a:name": "Ben" });
    const other = "https://elsewhere.example.test/base/e/other";
    const card = world.platform.seed(P, "t:Person", { "a:name": "Ann", "a:sameAs": [{ "@id": target }, { "@id": other }] });
    const id = card.split("/").pop()!;
    const etag = world.platform.etagOf(card);
    mountInProvider(world, <span />);
    await removeCardReference(createCardReferencesHost(), { recordId: id, carrier: card, factKeys: ["a:sameAs"], target, label: "same-as" });
    const patch = world.requests("PATCH", new RegExp(`/lws/r/${id}$`))[0]!;
    expect(patch.headers["if-match"]).toBe(etag);
    expect(patch.headers.authorization).toBe("DPoP fake-access-token");
    expect(patch.headers.dpop).toBe(`proof(PATCH ${patch.url})`);
    expect(JSON.parse(patch.body!)).toEqual({ "a:sameAs": { "@id": other } });
  });

  test("a link the record does not hold is said, and nothing is written", async () => {
    const world = await setUp();
    const card = world.platform.seed(P, "t:Person", { "a:name": "Ann", "a:sameAs": { "@id": "https://elsewhere.example.test/base/e/other" } });
    mountInProvider(world, <span />);
    await expect(
      removeCardReference(createCardReferencesHost(), { recordId: card.split("/").pop()!, carrier: card, factKeys: ["a:sameAs"], target: "https://nowhere.example.test/base/e/x", label: "same-as" }),
    ).rejects.toThrow("The record does not hold this link in a form this app can remove, so nothing was changed.");
    expect(world.requests("PATCH", /./)).toEqual([]);
  });
});
