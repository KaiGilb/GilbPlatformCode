// The card passes its props to the engine as they are: nothing is added, dropped or renamed.
import { describe, expect, test, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PlanFunctionForm } from "@kaigilb/gilbplatformcode-plan-card";
import { ResourceCard, type ResourceCardProps } from "./index";
import { SCREEN, VAULT, makeApp, mountCard } from "../test/app";
import { entityUriOf } from "../test/server";
import { settle } from "../test/helpers";

const served = { unitTag: "Cost.RiverProject" };

describe("the props go through", () => {
  test("the card is the engine's element with the very props it was given", () => {
    const app = makeApp();
    const props: ResourceCardProps = { record: app.seed("res1", "t:Resource", served), vaultId: SCREEN, canEdit: false, onOpen: vi.fn(), onNotice: vi.fn() };
    const element = ResourceCard(props);
    expect(element.type).toBe(PlanFunctionForm);
    expect(element.props).toEqual(props);
    expect(element.props.record).toBe(props.record);
    expect(element.props.onOpen).toBe(props.onOpen);
    expect(element.props.onNotice).toBe(props.onNotice);
  });

  test("canEdit false draws a read-only card: no Scale unit box, no Add level, no paste", async () => {
    const app = makeApp();
    mountCard(app, app.seed("res1", "t:Resource", served), { mode: "legacy", as: ResourceCard, canEdit: false });
    await settle();
    expect(screen.queryByRole("button", { name: "Add Budget level" })).toBeNull();
    expect(screen.queryByLabelText("Paste lines")).toBeNull();
    expect(screen.queryByLabelText("Scale unit")).toBeNull();
    expect(screen.queryAllByRole("combobox", { name: "Level" })).toHaveLength(0);
  });

  test("canEdit true draws the edit controls", async () => {
    const app = makeApp();
    mountCard(app, app.seed("res1", "t:Resource", served), { mode: "legacy", as: ResourceCard, canEdit: true });
    await settle();
    expect(screen.getByRole("button", { name: "Add Budget level" })).toBeTruthy();
    expect(screen.getByLabelText("Scale unit")).toBeTruthy();
    expect(screen.queryAllByRole("combobox", { name: "Level" })).toHaveLength(1);
  });

  test("a host without its writers draws a read-only card even when canEdit is true", async () => {
    const app = makeApp({ readOnly: true });
    mountCard(app, app.seed("res1", "t:Resource", served), { mode: "legacy", as: ResourceCard, canEdit: true });
    await settle();
    expect(screen.queryByRole("button", { name: "Add Budget level" })).toBeNull();
    expect(screen.queryByLabelText("Scale unit")).toBeNull();
  });

  test("record and vaultId reach the engine: the first Scale edit makes a Scale record in this Resource's vault and patches this Resource", async () => {
    const app = makeApp({ ifMatch: true });
    mountCard(app, app.seed("res1", "t:Resource", served), { mode: "legacy", as: ResourceCard });
    await settle();
    expect(app.host.usePersonAuthorities.mock.calls.at(-1)![1]).toBe(SCREEN);
    const user = userEvent.setup();
    const box = screen.getByLabelText("Scale unit");
    await user.click(box);
    await user.type(box, "seconds");
    await user.tab();
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.creates[0]).toMatchObject({ vault: VAULT, typeUri: "t:Scale", facts: { unit: "seconds", partOf: { "@id": entityUriOf("res1") } } });
    expect(app.server.log[0]!.id).toBe("res1");
    expect(app.host.storePlanRow.mock.calls.some((c) => c[0] === VAULT && c[1].id === "res1")).toBe(true);
  });

  test("onNotice reaches the engine: a refused Scale link says the record changed elsewhere", async () => {
    const app = makeApp({ ifMatch: true });
    const notices: (string | null)[] = [];
    mountCard(app, app.seed("res1", "t:Resource", served), { mode: "legacy", as: ResourceCard, onNotice: (n) => notices.push(n) });
    await settle();
    app.server.stale.add("res1");
    const user = userEvent.setup();
    const box = screen.getByLabelText("Scale unit");
    await user.click(box);
    await user.type(box, "seconds");
    await user.tab();
    await waitFor(() => expect(notices.some((n) => n && /changed elsewhere/.test(n))).toBe(true));
  });
});
