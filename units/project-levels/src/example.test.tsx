// The README example, run: a host kept in memory, a level chooser, the defaults written once, a level added.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";
import { useEffect, useState } from "react";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import {
  ADD_LEVEL,
  DEFAULT_LEVELS,
  ProjectLevelsHostContext,
  levelTag,
  levelTree,
  nextPosition,
  optionLabel,
  pascalCase,
  pickerNodes,
  tagOf,
  tokenOf,
  useProjectLevels,
  type AllLevelsResult,
  type ProjectLevelsHost,
} from "./index";

const VAULT = "https://plan.example.test/vault";

// ---- as in the README ----
const stored: GridRecord[] = []; // the host's own store of the vault's level records
const writes: string[] = [];

function levelRecord(vaultId: string, tag: string, label: string, position: number, extra: Record<string, unknown>): GridRecord {
  const id = `level-${tokenOf(tag)}`;
  return {
    id,
    entityUri: `${vaultId}/e/${id}`,
    typeUri: "t:CauseEffectLevel",
    facts: { unitTag: tag, label, levelPosition: String(position) },
    opaqueFacts: [],
    etag: null,
    updatedAt: 0,
    served: { facts: { unitTag: tag, label, levelPosition: position, ...extra }, context: undefined, etag: null },
  };
}

const host: ProjectLevelsHost = {
  useAllLevels(vaultId) {
    const [state, setState] = useState<AllLevelsResult>({ isSuccess: false, isError: false, error: null });
    useEffect(() => {
      if (!vaultId) return;
      setState({ data: [...stored], isSuccess: true, isError: false, error: null }); // a real host reads the vault here
    }, [vaultId]);
    return state;
  },
  async waitForLevels() {},
  async ensureDefaultLevels(vaultId) {
    if (stored.length === 0) {
      for (const d of DEFAULT_LEVELS) {
        writes.push(`default ${d.token}`);
        stored.push(levelRecord(vaultId, tagOf(d.token), d.label, d.position, { ontologyTerm: d.ontologyTerm }));
      }
    }
    return [...stored];
  },
  async addProjectLevel(vaultId, label, parentToken) {
    const pascal = pascalCase(label.trim());
    if (!pascal) throw new Error("A level needs a label.");
    await host.ensureDefaultLevels(vaultId);
    const tree = levelTree(stored);
    const parent = parentToken ? tree.find((n) => n.token === parentToken) ?? null : null;
    const tag = parent ? `${levelTag(parent)}.${pascal}` : tagOf(pascal);
    const extra: Record<string, unknown> = { ontologyTerm: "none" };
    if (parent?.record?.entityUri) extra.partOf = { "@id": parent.record.entityUri };
    writes.push(`add ${tag}`);
    stored.push(levelRecord(vaultId, tag, label.trim(), nextPosition(tree, parent ? parent.token : null), extra));
    return tokenOf(tag);
  },
};

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
// ---- end ----

beforeEach(() => {
  stored.length = 0;
  writes.length = 0;
  setTermOrigin("https://terms.example.test");
});
afterEach(() => {
  cleanup();
  resetTermOrigin();
});

describe("README example", () => {
  it("offers the defaults, writes them once on Set, and adds a level under Product", async () => {
    render(
      <ProjectLevelsHostContext.Provider value={host}>
        <LevelChooser vaultId={VAULT} current="Product" />
      </ProjectLevelsHostContext.Provider>,
    );
    const options = () => screen.getAllByRole("option").map((o) => o.textContent);
    expect(options()).toEqual(["Business", "Stakeholder", "Product", "Solution", "Add a level"]);
    expect(screen.getByTestId("state").textContent).toBe("defaults ");

    await act(async () => screen.getByText("Set").click());
    await act(async () => screen.getByText("Set").click());
    expect(writes).toEqual(["default Business", "default Stakeholder", "default Product", "default Solution"]);
    expect(stored[2]!.served?.facts.ontologyTerm).toBe("https://terms.example.test/base/t/ProductLevel");

    await act(async () => screen.getByText("Add").click());
    expect(writes.at(-1)).toBe("add Level.Product.SubProduct");
    await waitFor(() => expect(screen.getByTestId("state").textContent).toBe("defaults Product.SubProduct"));
    const sub = stored.at(-1)!;
    expect(sub.served?.facts).toMatchObject({ unitTag: "Level.Product.SubProduct", label: "Sub Product", levelPosition: 1, ontologyTerm: "none" });
    expect(options()).toContain("Business");
  });
});
