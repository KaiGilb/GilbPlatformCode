// The Type line: a GilbVeda type chosen with the host's search; the earlier concept, replaced only when the person says so;
// the focus returning to the Type field's trigger when the question closes.
import { describe, expect, test } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { TypeOption } from "@kaigilb/gilbplatformcode-type-chooser";
import { makeApp, mountCard } from "../test/app";
import { settle } from "../test/helpers";

const TERMS = "https://ontology.example.test";
const options: TypeOption[] = [
  { id: "veda:Door", label: "Door", typeName: "Door", spec: null, kind: "type" },
  { id: "veda:Person", label: "Person", typeName: "Person", spec: null, kind: "type" },
];

function setup(served: Record<string, unknown> = {}, over: Parameters<typeof makeApp>[0] = {}) {
  const app = makeApp({ ifMatch: true, ...over });
  app.host.searchTypes.mockImplementation(async () => ({ options, reach: "Searched the example ontology.", degraded: false }));
  const row = app.seed("fn1", "t:Function", { unitTag: "Content.Measure", ...served });
  mountCard(app, row, { mode: "legacy" });
  return { app, user: userEvent.setup() };
}
const trigger = () => document.querySelector<HTMLElement>('[data-testid="plan-type-field"] [data-plan-type-trigger]')!;

async function choose(user: ReturnType<typeof userEvent.setup>, name: string, open = "Choose a type") {
  await user.click(screen.getByRole("button", { name: open }));
  const list = await screen.findByTestId("plan-type-picker");
  await user.click(await within(list).findByText(name));
}

describe("choosing a type", () => {
  test("the card passes the host's search and the reach sentence to the Type field", async () => {
    const { app, user } = setup();
    app.host.searchTypes.mockImplementation(() => new Promise(() => {}));
    await user.click(screen.getByRole("button", { name: "Choose a type" }));
    await screen.findByTestId("plan-type-picker");
    await waitFor(() => expect(app.host.searchTypes).toHaveBeenCalledWith(""));
    expect(document.body.textContent).toContain("Type to search the example ontology.");
  });

  test("a pick is one patch of the term's address", async () => {
    const { app, user } = setup();
    await choose(user, "Door");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toEqual({ ontologyTerm: `${TERMS}/base/t/Door` });
    expect(app.server.log[0]!.ifMatch).toBe('"v1"');
  });

  test("with an earlier concept naming the same type, the concept goes in the same patch", async () => {
    const { app, user } = setup({ concept: { "a:label": "Door", "@id": `${TERMS}/base/t/Door` } });
    await choose(user, "Door", "Edit Type");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toEqual({ ontologyTerm: `${TERMS}/base/t/Door`, concept: null });
  });
});

describe("an earlier concept that names another type", () => {
  const concept = { concept: { "a:label": "Performance", "@id": `${TERMS}/base/t/Performance` } };

  test("asks before it goes; Keep writes the new type and keeps the concept", async () => {
    const { app, user } = setup(concept);
    await choose(user, "Door", "Edit Type");
    const ask = await screen.findByTestId("plan-type-replace-ask");
    expect(ask.textContent).toContain("Replace the earlier concept Performance?");
    expect(app.server.log).toEqual([]);
    await user.click(within(ask).getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toEqual({ ontologyTerm: `${TERMS}/base/t/Door` });
    expect(screen.queryByTestId("plan-type-replace-ask")).toBeNull();
  });

  test("Replace writes the new type and takes the concept out in the same patch", async () => {
    const { app, user } = setup(concept);
    await choose(user, "Door", "Edit Type");
    await user.click(within(await screen.findByTestId("plan-type-replace-ask")).getByRole("button", { name: "Replace" }));
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toEqual({ ontologyTerm: `${TERMS}/base/t/Door`, concept: null });
  });

  test("when the question closes, the focus goes back to the Type field's trigger", async () => {
    const { user } = setup(concept);
    await choose(user, "Door", "Edit Type");
    const ask = await screen.findByTestId("plan-type-replace-ask");
    await user.click(within(ask).getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(screen.queryByTestId("plan-type-replace-ask")).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger()));
  });

  test("a concept that is only words is kept when a type is chosen, and shown as an earlier note that its × takes out", async () => {
    const { app, user } = setup({ concept: { "a:label": "Gate idea" } });
    expect(screen.getByTestId("plan-type-earlier").textContent).toContain("Earlier note: Gate idea");
    await choose(user, "Door");
    await waitFor(() => expect(app.server.log).toHaveLength(1));
    expect(app.server.log[0]!.body).toEqual({ ontologyTerm: `${TERMS}/base/t/Door` });
    await settle();
    await user.click(screen.getByRole("button", { name: "Remove earlier note" }));
    await waitFor(() => expect(app.server.log).toHaveLength(2));
    expect(app.server.log[1]!.body).toEqual({ concept: null });
  });
});
