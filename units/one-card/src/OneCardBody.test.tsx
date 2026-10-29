// The body of the person card: one card, its two kinds of foot, the places taken off the card, and the host it asks.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OneCardField, OneCardGroup } from "@kaigilb/gilbplatformcode-one-card-merge";
import { useOneCard } from "@kaigilb/gilbplatformcode-one-card-context";
import { OneCardBody, OneCardOwnGroups, isTheirPlaceGroup, type OneCardBodyProps } from "./OneCardBody";
import { __resetTheirPlaces, useTheirPlaces } from "./theirPlaces";
import { HostProvider, fakeHost, type FakeHost } from "../test/fakeHost";
import { ANN, GEO, RECORD, controllerOf, field, rig, type Rig } from "../test/rig";

const FIELDS: OneCardField[] = [
  { term: "a:givenName", label: "Given name", readKeys: ["givenName"], writeKey: "a:givenName", many: false },
  { term: "a:birthday", label: "Birthday", readKeys: ["birthday"], writeKey: "a:birthday", many: false },
];

const group = (rows: { value: string; source: "theirs" | "yours" }[], field_ = "a:claimPlace"): OneCardGroup =>
  ({ field: field_, rows: rows.map((r) => ({ field: field_, editable: false, ...r })) }) as unknown as OneCardGroup;

function Probe() {
  const places = useTheirPlaces(RECORD);
  return <span data-testid="published">{JSON.stringify(places)}</span>;
}

function View() {
  const view = useOneCard();
  return (
    <span data-testid="view">
      {JSON.stringify({ marks: view?.marks ?? null, own: view?.own ?? null })}
      {view ? view.valueText({ field: "a:birthday", value: "--03-14", source: "theirs", editable: false }) : ""}
    </span>
  );
}

const props = (over: Partial<OneCardBodyProps> = {}): OneCardBodyProps => ({
  controller: null,
  labelFor: (p) => (p === "a:claimPlace" ? "Claim Place" : ""),
  searchName: "Ann Nordmann",
  canWrite: true,
  fieldOrder: FIELDS,
  servedFacts: {},
  skillPredicate: null,
  groupOf: (g) => (g.field === "a:givenName" ? "name" : null),
  skip: () => false,
  order: () => 0,
  personCard: null,
  recordUri: RECORD,
  children: <p data-testid="children">the card's own groups</p>,
  ...over,
});

let host: FakeHost;
const draw = (p: OneCardBodyProps, h: FakeHost = host) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <HostProvider host={h}>{children}</HostProvider>
    </QueryClientProvider>
  );
  return render(
    <>
      <OneCardBody {...p} />
      <Probe />
    </>,
    { wrapper: wrap },
  );
};
const linked = (r: Rig = rig({ link: { state: "linked", target: ANN } })) => ({ r, controller: controllerOf(r) });

beforeEach(() => {
  host = fakeHost();
  __resetTheirPlaces();
});
afterEach(cleanup);

describe("isTheirPlaceGroup", () => {
  it("is true when every value of theirs is a geo address, asking the host about each, trimmed", () => {
    const g = group([{ value: ` ${GEO}a `, source: "theirs" }, { value: `${GEO}b`, source: "theirs" }]);
    expect(isTheirPlaceGroup(host, g, () => null)).toBe(true);
    expect(host.isGeoEntityId.mock.calls).toEqual([[`${GEO}a`], [`${GEO}b`]]);
  });
  it("is false when one value of theirs is not a geo address", () => {
    expect(isTheirPlaceGroup(host, group([{ value: `${GEO}a`, source: "theirs" }, { value: "Oslo", source: "theirs" }]), () => null)).toBe(false);
  });
  it("is false for a group the card places in a group of its own, and then asks the host nothing", () => {
    expect(isTheirPlaceGroup(host, group([{ value: `${GEO}a`, source: "theirs" }]), () => "address")).toBe(false);
    expect(host.isGeoEntityId).not.toHaveBeenCalled();
  });
  it("is false when there is no value of theirs (yours only, or none)", () => {
    expect(isTheirPlaceGroup(host, group([{ value: `${GEO}a`, source: "yours" }]), () => null)).toBe(false);
    expect(isTheirPlaceGroup(host, group([]), () => null)).toBe(false);
  });
  it("takes its answer from the host: a host that knows no geo address takes nothing", () => {
    host.isGeoEntityId.mockReturnValue(false);
    expect(isTheirPlaceGroup(host, group([{ value: `${GEO}a`, source: "theirs" }]), () => null)).toBe(false);
  });
});

describe("OneCardBody", () => {
  it("with no controller draws the card's own groups alone", () => {
    draw(props());
    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.queryByTestId("one-card")).toBeNull();
  });

  it("not linked: the same one body with one source, and the foot of a card with no online card", async () => {
    const r = rig();
    draw(props({ controller: controllerOf(r) }));
    const body = await screen.findByTestId("one-card");
    expect(body).toHaveAttribute("data-online-status", "none");
    expect(body).toHaveAttribute("data-link", "none");
    expect(screen.getByTestId("children")).toBeInTheDocument();
    expect(screen.getByTestId("one-card-find-foot").textContent).toContain("This is your card of Ann.");
    expect(r.http).toEqual([]);
    expect(host.listPlaceClaimsInVault).not.toHaveBeenCalled();
  });

  it("not linked and the whole record not read yet: no merge is made (the view is null)", async () => {
    const r = rig();
    draw(props({ controller: controllerOf(r), servedFacts: null, children: <View /> }));
    await screen.findByTestId("one-card");
    expect(screen.getByTestId("view").textContent).toBe('{"marks":null,"own":null}');
  });

  it("linked and read: one card with the foot and a quiet Unlink; Unlink is the controller's", async () => {
    const { r, controller } = linked();
    draw(props({ controller, children: <View /> }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.queryByTestId("one-card-status")).toBeNull();
    expect(screen.getByTestId("view").textContent).toContain('"marks":true');
    const unlink = vi.spyOn(controller, "unlink");
    fireEvent.click(screen.getByTestId("one-card-unlink"));
    expect(unlink).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("one-card-unlink-confirm"));
    expect(unlink).toHaveBeenCalledTimes(1);
    expect(r.nonGet).toEqual([]);
  });

  it("a read-only holder gets the foot without Unlink", async () => {
    const { controller } = linked(rig({ link: { state: "linked", target: ANN }, canWrite: false }));
    draw(props({ controller, canWrite: false }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByTestId("one-card-foot")).toBeInTheDocument();
    expect(screen.queryByTestId("one-card-unlink")).toBeNull();
  });

  it("a birthday of theirs reads as a day and month; a value of theirs is shown as served otherwise", async () => {
    const { controller } = linked();
    draw(props({ controller, children: <View /> }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByTestId("view").textContent).toMatch(/14 March|March 14/);
  });

  it("a card that cannot be reached says so, offers Try again, and Try again reads the card again", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, cardStatus: 500 });
    draw(props({ controller: controllerOf(r) }));
    const status = await screen.findByTestId("one-card-status");
    expect(status).toHaveTextContent("Their online card could not be reached just now. Your link is unchanged.");
    expect(status).toHaveAttribute("role", "alert");
    const before = r.http.length;
    await act(async () => {
      fireEvent.click(screen.getByTestId("one-card-retry"));
    });
    await waitFor(() => expect(r.http.length).toBeGreaterThan(before));
  });

  it("a place group of theirs is taken off the card and handed to the Details panel under the record's address; closing the card clears it", async () => {
    const r = rig({
      link: { state: "linked", target: ANN },
      fields: [field("a:givenName", "Ann"), field("a:claimPlace", `${GEO}osm-r-1`), field("a:claimPlace", `${GEO}osm-r-2`)],
    });
    const view = draw(props({ controller: controllerOf(r) }));
    await waitFor(() => expect(screen.getByTestId("published").textContent).not.toBe("[]"));
    expect(JSON.parse(screen.getByTestId("published").textContent!)).toEqual([{ label: "Claim Place", places: [`${GEO}osm-r-1`, `${GEO}osm-r-2`] }]);
    expect(host.isGeoEntityId).toHaveBeenCalledWith(`${GEO}osm-r-1`);
    view.rerender(<Probe />);
    expect(screen.getByTestId("published").textContent).toBe("[]");
  });

  it("a place group the card draws in a group of its own stays on the card and publishes nothing", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:claimPlace", `${GEO}osm-r-1`)] });
    draw(props({ controller: controllerOf(r), groupOf: (g) => (g.field === "a:givenName" ? "name" : "address") }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByTestId("published").textContent).toBe("[]");
  });

  it("with no record address nothing is published", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:claimPlace", `${GEO}osm-r-1`)] });
    draw(props({ controller: controllerOf(r), recordUri: null }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByTestId("published").textContent).toBe("[]");
  });

  it("a group that is not all geo addresses stays on the card", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:claimPlace", `${GEO}osm-r-1`), field("a:claimPlace", "Oslo")] });
    draw(props({ controller: controllerOf(r) }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByTestId("published").textContent).toBe("[]");
  });

  it("reads the holder's held addresses only for a linked card whose online card is read, and only when it names an address field", async () => {
    const { controller } = linked();
    draw(props({ controller, addressPredicate: "a:postalAddress", addressVaultId: "vault-1", addressSubject: RECORD }));
    await waitFor(() => expect(host.listPlaceClaimsInVault).toHaveBeenCalledWith("vault-1"));
    cleanup();
    host.listPlaceClaimsInVault.mockClear();
    draw(props({ controller: linked().controller, addressVaultId: "vault-1", addressSubject: RECORD }));
    await screen.findByTestId("one-card");
    expect(host.listPlaceClaimsInVault).not.toHaveBeenCalled();
  });

  it("does not read the holder's addresses while the online card is not read (it could not be reached)", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, cardStatus: 500 });
    draw(props({ controller: controllerOf(r), addressPredicate: "a:postalAddress", addressVaultId: "vault-1", addressSubject: RECORD }));
    await screen.findByTestId("one-card-status");
    expect(host.listPlaceClaimsInVault).not.toHaveBeenCalled();
  });

  it("without a OneCardHostContext.Provider it throws an error that names the context", () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const qc = new QueryClient();
    expect(() =>
      render(
        <QueryClientProvider client={qc}>
          <OneCardBody {...props()} />
        </QueryClientProvider>,
      ),
    ).toThrow("The one card needs a OneCardHostContext.Provider above it.");
    quiet.mockRestore();
  });
});

describe("OneCardOwnGroups", () => {
  it("draws nothing outside the one card", () => {
    const { container } = render(<OneCardOwnGroups labelFor={() => ""} />);
    expect(container.textContent).toBe("");
  });
  it("draws a group of its own for a field of theirs the card has no group for, titled by the master's label", async () => {
    const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:favouriteColour", "green")] });
    draw(props({ controller: controllerOf(r), labelFor: (p) => (p === "a:favouriteColour" ? "Favourite colour" : ""), children: <OneCardOwnGroups labelFor={(p) => (p === "a:favouriteColour" ? "Favourite colour" : "")} /> }));
    await waitFor(() => expect(screen.getByTestId("one-card")).toHaveAttribute("data-online-status", "ready"));
    expect(screen.getByText("Favourite colour")).toBeInTheDocument();
  });
});

