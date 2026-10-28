// Changing the type of the card live: Function and Function Constraint, Solution and Solution Constraint. A constraint needs a named
// person as its Authority; the card asks for one, changes the type through the host, writes the Authority, and draws the new type's lines.
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CONSTRAINT_AUTHORITY_WHY, CONSTRAINT_UNLINKED } from "@kaigilb/gilbplatformcode-plan-stakeholders-model";
import { ANN, SCREEN, VAULT, makeApp, mountCard } from "../test/app";
import { entityUriOf } from "../test/server";
import { planKinds, settle } from "../test/helpers";

const FUNCTION_LINES = ["plan-type-level", "plan-description", "plan-stakeholder", "plan-authority", "plan-part-of", "plan-sub-functions", "plan-meter", "plan-status", "plan-function-of-value", "plan-solutions", "plan-type"];
const CONSTRAINT_LINES = ["plan-type-level", "plan-description", "plan-authority", "plan-stakeholder", "plan-part-of", "plan-sub-functions", "plan-meter", "plan-status", "plan-type"];

function setup(type: string, over: Parameters<typeof makeApp>[0] = {}) {
  const app = makeApp({ ifMatch: true, ...over });
  const row = app.seed("fn1", type, { unitTag: "Must.Do" });
  const notices: (string | null)[] = [];
  mountCard(app, row, { mode: "legacy", onNotice: (n) => notices.push(n) });
  return { app, notices, user: userEvent.setup() };
}
const authorityRequired = () => document.querySelector("[data-plan-label='Authority']")?.getAttribute("data-plan-required") ?? null;
const change = () => screen.getByRole("button", { name: "Change" }) as HTMLButtonElement;

async function pickAnn(user: ReturnType<typeof userEvent.setup>) {
  const box = within(screen.getByTestId("plan-retype-authority")).getByRole("textbox", { name: "Authority" });
  await user.type(box, "ann");
  await user.click(await screen.findByText("Ann Co"));
}

describe("Function to Function Constraint", () => {
  test("asks first, in the Function's words, and changes nothing until Change is pressed", async () => {
    const { app, user } = setup("t:Function");
    expect(authorityRequired()).toBeNull();
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(screen.getByText("Change this Function to a Function Constraint?")).toBeTruthy();
    expect(app.host.useRetypeRecord).toHaveBeenCalled();
    expect(app.log.filter((l) => l.startsWith("retype"))).toEqual([]);
    expect(planKinds()).toEqual(FUNCTION_LINES);
  });

  test("with no person yet as Authority, Change waits for one: it is off, with the reason, until a person is picked", async () => {
    const { user } = setup("t:Function");
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(screen.getByTestId("plan-retype-authority")).toBeTruthy();
    expect(change().disabled).toBe(true);
    expect(change().title).toBe(CONSTRAINT_AUTHORITY_WHY);
    await pickAnn(user);
    await waitFor(() => expect(change().disabled).toBe(false));
  });

  test("Change retypes through the host (with the screen's vault), writes the Authority in the record's vault, and the lines change live", async () => {
    const { app, user, notices } = setup("t:Function");
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await pickAnn(user);
    await user.click(change());
    await waitFor(() => expect(planKinds()).toEqual(CONSTRAINT_LINES));
    expect(app.log.filter((l) => l.startsWith("retype"))).toEqual([`retype ${JSON.stringify([SCREEN, "fn1", "FunctionConstraint"])}`]);
    expect(app.host.writeAuthorityRelation).toHaveBeenCalledTimes(1);
    expect(app.host.writeAuthorityRelation!.mock.calls[0]![0]).toEqual({
      recordId: "fn1",
      recordUri: entityUriOf("fn1"),
      stakeholderUri: ANN,
      vaultId: VAULT,
    });
    expect(authorityRequired()).toBe("true");
    expect(screen.queryByTestId("plan-retype-authority")).toBeNull();
    expect(screen.queryByText("Change this Function to a Function Constraint?")).toBeNull();
    expect(notices[notices.length - 1]).toBeNull();
    expect((screen.getByRole("radio", { name: "Function Constraint" }) as HTMLInputElement).checked).toBe(true);
    expect(app.state.relations.get("fn1")).toEqual([expect.objectContaining({ relation: "t:AuthorityOf", uri: ANN })]);
    expect(app.server.get("fn1")!.typeUri).toBe("t:FunctionConstraint");
  });

  test("a person who is already an Authority is enough: no one is asked for, and no relation is written", async () => {
    const { app, user } = setup("t:Function", { people: [{ uri: ANN }] });
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(screen.queryByTestId("plan-retype-authority")).toBeNull();
    expect(change().disabled).toBe(false);
    await user.click(change());
    await waitFor(() => expect(planKinds()).toEqual(CONSTRAINT_LINES));
    expect(app.host.writeAuthorityRelation).not.toHaveBeenCalled();
  });

  test("while the Authorities are still being read, Change is off", async () => {
    const { app, user } = setup("t:Function");
    app.state.peoplePending = true;
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(change().disabled).toBe(true);
    expect(screen.queryByTestId("plan-retype-authority")).toBeNull();
  });

  test("when they cannot be read, Change is off and says so", async () => {
    const { app, user } = setup("t:Function");
    app.state.peopleError = true;
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    expect(change().disabled).toBe(true);
    expect(change().title).toBe("Could not read who already requires it.");
  });

  test("Cancel closes the question and changes nothing", async () => {
    const { app, user } = setup("t:Function");
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText("Change this Function to a Function Constraint?")).toBeNull();
    expect(app.log.filter((l) => l.startsWith("retype"))).toEqual([]);
  });

  test("a hit that is not a person is refused with the reason", async () => {
    const { app, user, notices } = setup("t:Function");
    app.state.hitType = "Organization";
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await pickAnn(user);
    expect(notices).toContain(CONSTRAINT_AUTHORITY_WHY);
    expect(change().disabled).toBe(true);
  });

  test("a retype the vault refuses shows its message and leaves the question open", async () => {
    const { app, user, notices } = setup("t:Function", { people: [{ uri: ANN }] });
    app.host.useRetypeRecord!.mockReturnValue({ mutateAsync: async () => Promise.reject(new Error("Not allowed to change the type.")) });
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await user.click(change());
    await waitFor(() => expect(notices).toContain("Not allowed to change the type."));
    expect(screen.getByText("Change this Function to a Function Constraint?")).toBeTruthy();
    expect(planKinds()).toEqual(FUNCTION_LINES);
    expect(change().disabled).toBe(false);
  });

  test("a retype that was made but whose Authority could not be written says the constraint is not linked, and the lines are the constraint's", async () => {
    const { app, user, notices } = setup("t:Function");
    app.host.writeAuthorityRelation!.mockRejectedValueOnce(new Error("relation refused"));
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await pickAnn(user);
    await user.click(change());
    await waitFor(() => expect(notices).toContain(CONSTRAINT_UNLINKED));
    await waitFor(() => expect(planKinds()).toEqual(CONSTRAINT_LINES));
  });
});

describe("the person made in the dialog", () => {
  test("+ New stakeholder opens the host's dialog for a person in the record's vault and the screen's", async () => {
    const { app, user } = setup("t:Function");
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await user.click(within(screen.getByTestId("plan-retype-authority")).getByRole("button", { name: "+ New stakeholder" }));
    expect(screen.getByTestId("create-person-dialog")).toBeTruthy();
    const props = app.state.dialog[app.state.dialog.length - 1]!;
    expect(props).toMatchObject({ open: true, stakeholders: true, source: null, initialTypeId: "person", drawnVaultIds: [SCREEN, VAULT] });
    await user.click(screen.getByRole("button", { name: "Close person dialog" }));
    expect(screen.queryByTestId("create-person-dialog")).toBeNull();
  });

  test("the person it made is read back from the vault (the vault id in the slot for the address) and becomes the Authority to write", async () => {
    const { app, user } = setup("t:Function");
    app.seed("new-ann", "t:Person", { name: "Ann New" });
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await user.click(within(screen.getByTestId("plan-retype-authority")).getByRole("button", { name: "+ New stakeholder" }));
    await user.click(screen.getByRole("button", { name: "Person created" }));
    await waitFor(() => expect(screen.getByTestId("plan-retype-authority").textContent).toContain("Ann New"));
    expect(app.host.invalidateAuthoritySearch).toHaveBeenCalledTimes(1);
    expect(app.host.readRecord).toHaveBeenCalledWith("new-ann", VAULT);
    expect(screen.queryByTestId("create-person-dialog")).toBeNull();
    await waitFor(() => expect(change().disabled).toBe(false));
    await user.click(change());
    await waitFor(() => expect(planKinds()).toEqual(CONSTRAINT_LINES));
    expect(app.host.writeAuthorityRelation!.mock.calls[0]![0].stakeholderUri).toBe(entityUriOf("new-ann"));
  });

  test("a record that is not a person is not adopted, and the reason is shown", async () => {
    const { app, user, notices } = setup("t:Function");
    app.seed("new-ann", "t:Organization", { name: "Ann Co" });
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await user.click(within(screen.getByTestId("plan-retype-authority")).getByRole("button", { name: "+ New stakeholder" }));
    await user.click(screen.getByRole("button", { name: "Person created" }));
    await waitFor(() => expect(notices).toContain(CONSTRAINT_AUTHORITY_WHY));
    expect(change().disabled).toBe(true);
  });

  test("a record that cannot be read is not adopted either", async () => {
    const { user, notices } = setup("t:Function");
    await user.click(screen.getByRole("radio", { name: "Function Constraint" }));
    await user.click(within(screen.getByTestId("plan-retype-authority")).getByRole("button", { name: "+ New stakeholder" }));
    await user.click(screen.getByRole("button", { name: "Person created" }));
    await waitFor(() => expect(notices).toContain(CONSTRAINT_AUTHORITY_WHY));
  });
});

describe("Function Constraint to Function", () => {
  test("needs no one: Change is on, the Authority stops being required, and the lines are the Function's", async () => {
    const { app, user } = setup("t:FunctionConstraint");
    expect(authorityRequired()).toBe("true");
    await user.click(screen.getByRole("radio", { name: "Function" }));
    expect(screen.getByText("Change this Function Constraint to a Function?")).toBeTruthy();
    expect(screen.queryByTestId("plan-retype-authority")).toBeNull();
    await user.click(change());
    await waitFor(() => expect(planKinds()).toEqual(FUNCTION_LINES));
    expect(authorityRequired()).toBeNull();
    expect(app.log.filter((l) => l.startsWith("retype"))).toEqual([`retype ${JSON.stringify([SCREEN, "fn1", "Function"])}`]);
    expect(app.host.writeAuthorityRelation).not.toHaveBeenCalled();
  });
});

describe("Solution and Solution Constraint", () => {
  test("the constraint's type name is DesignConstraint", async () => {
    const { app, user } = setup("t:Solution", { people: [{ uri: ANN }] });
    await user.click(screen.getByRole("radio", { name: "Solution Constraint" }));
    expect(screen.getByText("Change this Solution to a Solution Constraint?")).toBeTruthy();
    await user.click(change());
    await waitFor(() => expect(app.server.get("fn1")!.typeUri).toBe("t:DesignConstraint"));
    await waitFor(() => expect((screen.getByRole("radio", { name: "Solution Constraint" }) as HTMLInputElement).checked).toBe(true));
    expect(authorityRequired()).toBe("true");
  });
});

describe("a Value or a Development Resource", () => {
  test.each(["t:Value", "t:Resource"])("%s has no Type switch", async (type) => {
    setup(type);
    await settle();
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("radiogroup", { name: "Type" })).toBeNull();
  });
});
