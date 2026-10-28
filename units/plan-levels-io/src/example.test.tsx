// @vitest-environment jsdom
// The README example, run: the host of `project-levels` assembled from this unit's four functions, a level chooser over a fake vault, the defaults
// written once, a level added.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { ADD_LEVEL, ProjectLevelsHostContext, optionLabel, pickerNodes, useProjectLevels, type ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import { addProjectLevel, ensureDefaultLevels, useAllLevels, waitForLevels } from "./index";
import { installVault, V } from "../test/levelsWire";
import { setUp, tearDown } from "../test/support";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  tearDown();
});

// ---- as in the README ----
function LevelsHost({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const host = useMemo<ProjectLevelsHost>(
    () => ({
      useAllLevels,
      waitForLevels: (vaultId) => waitForLevels(qc, vaultId),
      ensureDefaultLevels: (vaultId) => ensureDefaultLevels(vaultId, qc),
      addProjectLevel: (vaultId, label, parentToken) => addProjectLevel(vaultId, qc, label, parentToken),
    }),
    [qc],
  );
  return <ProjectLevelsHostContext.Provider value={host}>{children}</ProjectLevelsHostContext.Provider>;
}

function LevelChooser({ vaultId, current }: { vaultId: string; current: string }) {
  const { tree, hasStored, ensure, add } = useProjectLevels(vaultId);
  const [added, setAdded] = useState("");
  return (
    <div>
      <select defaultValue={current}>
        {pickerNodes(tree, current).map((n) => (
          <option key={n.token} value={n.token}>{optionLabel(n)}</option>
        ))}
        <option value={ADD_LEVEL}>Add a level</option>
      </select>
      <button onClick={() => void ensure()}>Set</button>
      <button onClick={() => void add("Sub Product", "Product").then(setAdded)}>Add</button>
      <p data-testid="state">{hasStored ? "stored" : "defaults"} {added}</p>
    </div>
  );
}

const app = (qc: QueryClient) => (
  <QueryClientProvider client={qc}>
    <LevelsHost>
      <LevelChooser vaultId={V} current="Product" />
    </LevelsHost>
  </QueryClientProvider>
);
// ---- end of the README example ----

describe("the README example", () => {
  it("shows the four defaults for a vault with no level, writes them only when asked, and adds a level under a parent", async () => {
    const vault = installVault([]);
    render(app(new QueryClient()));
    await waitFor(() => expect(vault.gets).toHaveLength(1));
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("defaults"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Business", "Stakeholder", "Product", "Solution", "Add a level"]);
    expect(vault.posts).toEqual([]);

    await act(async () => screen.getByText("Set").click());
    await waitFor(() => expect(vault.posts).toHaveLength(4));
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("stored"));

    await act(async () => screen.getByText("Add").click());
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("Product.SubProduct"));
    expect(vault.posts).toHaveLength(5);
    expect(vault.posts[4]!.body.facts).toMatchObject({ "a:unitTag": "Level.Product.SubProduct", "a:label": "Sub Product", "a:partOf": { "@id": expect.stringContaining("/e/new-3") } });
    await waitFor(() => expect(screen.getAllByRole("option").map((o) => o.textContent)).toContain("  Sub Product · Product.SubProduct"));
  });

  it("shows a vault's own levels and writes nothing", async () => {
    const vault = installVault([{ id: "a", token: "Alpha", position: 1 }]);
    render(app(new QueryClient()));
    await waitFor(() => expect(screen.getByTestId("state").textContent).toContain("stored"));
    expect(screen.getAllByRole("option").map((o) => o.textContent)).toEqual(["Product", "Alpha", "Add a level"]);
    expect(vault.posts).toEqual([]);
  });
});
