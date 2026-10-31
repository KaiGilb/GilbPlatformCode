// New (0.3.0). A skill of theirs is shown by its name on the online card (linked), never by its address or the last part of it: the master's label, else the
// catalogue name in the term's address, else the word "A skill"; text that is not an address is its own name.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { OneCardField } from "@kaigilb/gilbplatformcode-one-card-merge";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { OneCardBody, OneCardOwnGroups, type OneCardBodyProps } from "./OneCardBody";
import { HostProvider, fakeHost } from "../test/fakeHost";
import { ANN, controllerOf, field, rig } from "../test/rig";

const ONTOLOGY = "https://veda.example.test";
const FIELDS: OneCardField[] = [{ term: "a:givenName", label: "Given name", readKeys: ["givenName"], writeKey: "a:givenName", many: false }];

beforeEach(() => setTermOrigin(ONTOLOGY));
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

const props = (over: Partial<OneCardBodyProps> = {}): OneCardBodyProps => ({
  controller: null,
  labelFor: () => "",
  searchName: "Ann Nordmann",
  canWrite: true,
  fieldOrder: FIELDS,
  servedFacts: {},
  skillPredicate: "a:skill",
  groupOf: (g) => (g.field === "a:givenName" ? "name" : null),
  skip: () => false,
  order: () => 0,
  personCard: null,
  recordUri: "https://holder.example.test/vault/e/rec1",
  children: <OneCardOwnGroups labelFor={() => "Skill"} />,
  ...over,
});

function draw(p: OneCardBodyProps) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrap = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={qc}>
      <HostProvider host={fakeHost()}>{children}</HostProvider>
    </QueryClientProvider>
  );
  return render(<OneCardBody {...p} />, { wrapper: wrap });
}

async function skillRow(value: string, label: string) {
  const r = rig({ link: { state: "linked", target: ANN }, fields: [field("a:givenName", "Ann"), field("a:skill", value)] });
  const view = draw(props({ controller: controllerOf(r), labelFor: (p) => (p === value ? label : "") }));
  await waitFor(() => expect(screen.getByTestId("one-card-row-value")).toBeTruthy());
  return view;
}

describe("a skill of theirs on the online card", () => {
  it("is shown by the master's label when there is one", async () => {
    await skillRow(`${ONTOLOGY}/base/t/StreetWelding`, "welding");
    expect(screen.getByTestId("one-card-row-value").textContent).toBe("welding");
  });
  it("with no label, is shown by the catalogue name in the term's address, in words", async () => {
    const { container } = await skillRow(`${ONTOLOGY}/base/t/StreetWelding`, "");
    expect(screen.getByTestId("one-card-row-value").textContent).toBe("Street Welding");
    expect(container.textContent).not.toContain("https://");
  });
  it.each([["a storage address", `${ONTOLOGY}/base/e/06gf80rjtdw3h9q187p80kx00m`], ["an address of another origin", "https://elsewhere.example.test/base/t/Welding"]])(
    "with no label, %s is shown as the word 'A skill': never the address, never its last part",
    async (_n, value) => {
      const { container } = await skillRow(value, "");
      expect(screen.getByTestId("one-card-row-value").textContent).toBe("A skill");
      expect(container.textContent).not.toContain("https://");
      expect(container.textContent).not.toContain("06gf80rjtdw3h9q187p80kx00m");
      expect(container.textContent).not.toContain("Welding");
    },
  );
  it("a free-text skill (not an address) is its own name", async () => {
    await skillRow("juggling", "");
    expect(screen.getByTestId("one-card-row-value").textContent).toBe("juggling");
  });
});
