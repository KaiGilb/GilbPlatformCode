// The host contract: one context, read first; the shell hook is the first hook the card calls; the label hook is mounted for the fields that point at records;
// the package exports exactly what the README lists.
import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClientProvider } from "@tanstack/react-query";
import { StakeholderRecordCard } from "./index";
import * as unit from "./index";
import { RecordDetail, ShellContext, seam } from "../test/app";
import { cardWorld, newQc, personRecord, putList, shellOf, P } from "../test/cardWorld";

afterEach(() => vi.restoreAllMocks());

describe("the host", () => {
  it("without a StakeholderRecordCardHostContext.Provider the card throws an error that names it", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() =>
      render(
        <QueryClientProvider client={newQc()}>
          <StakeholderRecordCard recordId="x" vaultId={P} />
        </QueryClientProvider>,
      ),
    ).toThrow(/needs a StakeholderRecordCardHostContext\.Provider above it/);
  });

  it("the shell hook is called on every render of the card, and the card never changes the order of its hooks as the record becomes ready", async () => {
    cardWorld();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const rec = personRecord("pn", { givenName: "Tom", familyName: "Gilb" });
    const qc = newQc();
    putList(qc, P, [rec]);
    render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={shellOf(rec)}>
          <RecordDetail />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });
    expect(seam.useShellCalls).toBeGreaterThanOrEqual(4);
    const hookErrors = errors.mock.calls.filter((c) => String(c[0]).includes("change in the order of Hooks") || String(c[0]).includes("Rendered more hooks") || String(c[0]).includes("Rendered fewer hooks"));
    expect(hookErrors).toEqual([]);
  });
});

describe("one card, another record", () => {
  it("the body is a new body for a new record: the mode goes back to presentation", async () => {
    cardWorld();
    const a = personRecord("a1", { givenName: "Ann", familyName: "One" });
    const b = personRecord("b2", { givenName: "Bo", familyName: "Two" });
    const qc = newQc();
    putList(qc, P, [a, b]);
    const view = render(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={shellOf(a)}>
          <RecordDetail />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("record-detail-content").getAttribute("data-stakeholder-state")).toBe("ready"), { timeout: 4000 });
    await userEvent.click(screen.getByTestId("card-edit"));
    expect(screen.getByTestId("card-done")).toBeTruthy();
    view.rerender(
      <QueryClientProvider client={qc}>
        <ShellContext.Provider value={shellOf(b)}>
          <RecordDetail />
        </ShellContext.Provider>
      </QueryClientProvider>,
    );
    await waitFor(() => expect(screen.getByTestId("card-edit")).toBeTruthy());
    expect(screen.queryByTestId("card-done")).toBeNull();
  });
});

describe("the package", () => {
  it("exports exactly these names", () => {
    expect(Object.keys(unit).sort()).toEqual(["StakeholderRecordCard", "StakeholderRecordCardHostContext", "editorFacts", "extraKeysFromFacts", "unambiguousVaultOfRecord", "useStakeholderRecordCardHost"]);
  });
});
