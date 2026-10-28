// PlanSubFunctions against a fake host: a read-only line over the host's find of `a:fvParent`.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanSubFunctions } from "./index";
import { VAULT, labels, makeHost, row, uri } from "../test/fakeHost";
import { mount } from "../test/mount";
import type { ComponentProps } from "react";

afterEach(() => {
  cleanup();
  for (const k of Object.keys(labels)) delete labels[k];
});

const self = row("self", "Door");
function setup(over: Partial<ComponentProps<typeof PlanSubFunctions>> = {}, h = makeHost()) {
  const p = { record: self, vaultId: VAULT, onOpen: vi.fn(), ...over };
  return { p, ...mount(<PlanSubFunctions {...p} />, h) };
}

describe("the rows", () => {
  it("asks the host's find for the records whose a:fvParent is this record, in the plan vault", () => {
    const h = makeHost();
    setup({ planVault: "https://q.example.test/vault" }, h);
    expect(h.fn.usePlanFind).toHaveBeenCalledWith("https://q.example.test/vault", "a:fvParent", self);
  });

  it("asks in the screen vault when no plan vault is given", () => {
    const h = makeHost();
    setup({}, h);
    expect(h.fn.usePlanFind).toHaveBeenCalledWith(VAULT, "a:fvParent", self);
  });

  it("shows nothing for a find that has not answered", () => {
    setup();
    expect(screen.getByTestId("plan-sub-functions").textContent).toBe("");
  });

  it("shows the Functions found by their live tag, sorted by tag then id, and leaves out other types", () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = {
      isError: false,
      data: {
        rows: [
          row("b", "Door.Open"),
          row("v", "Door.Value", { typeUri: "t:Value" }),
          row("a", "Door.Close"),
          row("c", "Door.Close"),
        ],
        total: 4,
        capped: false,
        unread: 0,
      },
    };
    labels[uri("a")] = "Door.Close";
    labels[uri("b")] = "Door.Open";
    labels[uri("c")] = "Door.Close again";
    setup({}, h);
    const text = [...screen.getByTestId("plan-sub-functions").querySelectorAll("button")].map((b) => b.textContent);
    expect(text).toEqual(["Door.Close", "Door.Close again", "Door.Open"]);
  });

  it("follows a label that changes, since the row stores only the address", () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [row("a", "Door.Close")], total: 1, capped: false, unread: 0 } };
    labels[uri("a")] = "Door.Close";
    const t = setup({}, h);
    expect(screen.getByText("Door.Close")).toBeTruthy();
    labels[uri("a")] = "Door.Shut";
    t.view.rerender(<PlanSubFunctions {...t.p} />);
    expect(screen.getByText("Door.Shut")).toBeTruthy();
  });

  it("opens a row by its id; a row with no address shows its own tag and opens by id", async () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = {
      isError: false,
      data: { rows: [row("a", "Door.Close"), row("n", "Door.Noaddr", { entityUri: undefined })], total: 2, capped: false, unread: 0 },
    };
    labels[uri("a")] = "Door.Close";
    const t = setup({}, h);
    await userEvent.click(screen.getByText("Door.Close"));
    expect(t.p.onOpen).toHaveBeenLastCalledWith("a");
    await userEvent.click(screen.getByText("Door.Noaddr"));
    expect(t.p.onOpen).toHaveBeenLastCalledWith("n");
  });
});

describe("a find that failed", () => {
  const failed = () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = {
      isError: true,
      data: { rows: [row("a", "Door.Close")], total: 1, capped: false, unread: 0 },
    };
    return h;
  };

  it("offers Try again in place of the rows", async () => {
    labels[uri("a")] = "Door.Close";
    const h = failed();
    setup({ planVault: "https://q.example.test/vault" }, h);
    expect(screen.queryByText("Door.Close")).toBeNull();
    await userEvent.click(screen.getByText("Could not read the sub-functions — try again"));
    expect(h.fn.invalidatePlanFind).toHaveBeenCalledWith("https://q.example.test/vault", "a:fvParent", "self");
  });
});

describe("the notes under the list", () => {
  it("says nothing for a whole find", () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [], total: 0, capped: false, unread: 0 } };
    setup({}, h);
    expect(screen.queryByText("Try again")).toBeNull();
  });

  it("says how many are shown of how many when the find was cut off, with the cap it used, and Try again", async () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [], total: 450, capped: true, unread: 0, cap: 300 } };
    setup({}, h);
    expect(screen.getByText("Showing the first 300 of 450 sub-functions at this level.")).toBeTruthy();
    await userEvent.click(screen.getByText("Try again"));
    expect(h.fn.invalidatePlanFind).toHaveBeenCalledWith(VAULT, "a:fvParent", "self");
  });

  it("uses the default cap of 300 when the find did not say", () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [], total: 450, capped: true, unread: 0 } };
    setup({}, h);
    expect(screen.getByText("Showing the first 300 of 450 sub-functions at this level.")).toBeTruthy();
  });

  it("says how many could not be read, singular and plural, and Try again", async () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [], total: 5, capped: false, unread: 1 } };
    const t = setup({}, h);
    expect(screen.getByText("1 sub-function could not be read. Try again")).toBeTruthy();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [], total: 5, capped: false, unread: 3 } };
    t.view.rerender(<PlanSubFunctions {...t.p} />);
    await userEvent.click(screen.getByText("3 sub-functions could not be read. Try again"));
    expect(h.fn.invalidatePlanFind).toHaveBeenCalledTimes(1);
  });

  it("shows both notes when the find was cut off and some did not read", () => {
    const h = makeHost();
    h.state.finds["a:fvParent"] = { isError: false, data: { rows: [], total: 400, capped: true, unread: 2 } };
    setup({}, h);
    expect(screen.getByText("Showing the first 300 of 400 sub-functions at this level.")).toBeTruthy();
    expect(screen.getByText("2 sub-functions could not be read. Try again")).toBeTruthy();
  });
});
