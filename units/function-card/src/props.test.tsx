// The card passes its props to the engine as they are: nothing is added, dropped or renamed.
import { describe, expect, test } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanFunctionForm } from "@kaigilb/gilbplatformcode-plan-card";
import { FunctionCard, type FunctionCardProps } from "./index";
import { SCREEN, VAULT, makeApp, mountCard } from "../test/app";
import { entityUriOf } from "../test/server";
import { settle } from "../test/helpers";

const served = { unitTag: "Content.Measure", levelStatements: [{ "a:status": "Planned", "a:statusWhen": "2026-10-01" }] };

describe("the props go through", () => {
  test("the card is the engine's element with the very props it was given", () => {
    const app = makeApp();
    const props: FunctionCardProps = { record: app.seed("fn1", "t:Function", served), vaultId: SCREEN, canEdit: false, onOpen: () => {}, onNotice: () => {} };
    const element = FunctionCard(props);
    expect(element.type).toBe(PlanFunctionForm);
    expect(element.props).toEqual(props);
    expect(element.props.record).toBe(props.record);
    expect(element.props.onOpen).toBe(props.onOpen);
    expect(element.props.onNotice).toBe(props.onNotice);
  });

  test("canEdit false draws a read-only card: no new status, no Type switch, no Level choice; the stored status is still there", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy", as: FunctionCard, canEdit: false });
    await settle();
    expect(screen.queryAllByRole("button", { name: "+ New status" })).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    expect(screen.queryAllByRole("combobox", { name: "Level" })).toHaveLength(0);
    expect(screen.getByTestId("plan-function-form").textContent).toContain("Planned");
  });

  test("canEdit true draws the edit controls", async () => {
    const app = makeApp();
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy", as: FunctionCard, canEdit: true });
    await settle();
    expect(screen.queryAllByRole("button", { name: "+ New status" })).toHaveLength(1);
    expect(screen.queryAllByRole("radio").length).toBeGreaterThan(0);
    expect(screen.queryAllByRole("combobox", { name: "Level" })).toHaveLength(1);
  });

  test("a host without its writers draws a read-only card even when canEdit is true", async () => {
    const app = makeApp({ readOnly: true });
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy", as: FunctionCard, canEdit: true });
    await settle();
    expect(screen.queryAllByRole("button", { name: "+ New status" })).toHaveLength(0);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  test("record, vaultId and onNotice reach the engine: an edit patches this record, in its vault, and a refusal reaches onNotice", async () => {
    const app = makeApp({ ifMatch: true });
    const notices: (string | null)[] = [];
    mountCard(app, app.seed("fn1", "t:Function", served), { mode: "legacy", as: FunctionCard, onNotice: (n) => notices.push(n) });
    await settle();
    expect(app.host.usePersonAuthorities).toHaveBeenCalled();
    expect(app.host.usePersonAuthorities.mock.calls.at(-1)![1]).toBe(SCREEN);
    const user = userEvent.setup();
    const write = async (label: string, text: string) => {
      await user.click(screen.getByRole("button", { name: `Edit ${label}` }));
      await user.type(screen.getByRole("textbox", { name: `Edit ${label}` }), text);
      await user.tab();
    };
    await write("HumanAgent", "review it");
    await waitFor(() => expect(app.host.patchRecord).toHaveBeenCalledTimes(1));
    const [id, patch, at] = app.host.patchRecord!.mock.calls[0]!;
    expect(id).toBe("fn1");
    expect(at).toBe(entityUriOf("fn1"));
    expect(patch).toEqual({ hasMeter: [{ "a:meterAgentKind": "human", "a:method": "review it" }] });
    await waitFor(() => expect(app.host.storePlanRow).toHaveBeenCalledTimes(1));
    // The record's own vault, not the screen's.
    expect(app.host.storePlanRow.mock.calls[0]![0]).toBe(VAULT);
    await settle();
    app.host.patchRecord!.mockRejectedValueOnce(new Error("The vault is read only."));
    await write("AiAgent", "scan");
    await waitFor(() => expect(notices).toContain("The vault is read only."));
  });
});
