// Test-only. Mounts the state against the in-memory vault and answers the master with the term names themselves.
import { expect, vi } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useEmployments, type EmploymentsEditor } from "../src/index";
import { VAULT, factOf, uriOf } from "./vault";

import { master } from "./master";
export { master };

export function answerMaster(): void {
  master.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  master.typeSpelling.mockReset().mockImplementation(async (n: string) => `t:${n}`);
}

export interface Opts {
  vaultId?: string | null;
  servedReady?: boolean;
  catalogueOrigin?: string;
  servedEdges?: unknown;
}

export function mountEditor(person: string, over: Opts = {}) {
  const onSaved = vi.fn();
  const view = renderHook(
    (p: Opts) =>
      useEmployments({
        recordId: person,
        recordEntityUri: uriOf(person),
        vaultId: p.vaultId === undefined ? VAULT : p.vaultId,
        edgeKey: "employment",
        servedEdges: "servedEdges" in p ? p.servedEdges : factOf(person, "employment"),
        onSaved,
        servedReady: p.servedReady ?? true,
        ...(p.catalogueOrigin !== undefined ? { catalogueOrigin: p.catalogueOrigin } : {}),
      }),
    { initialProps: over },
  );
  const editor = (): EmploymentsEditor => view.result.current;
  /** The card re-read the record after a write: the served edge list is what the vault holds now. */
  const reread = () => view.rerender({ ...over, servedEdges: factOf(person, "employment") });
  return { ...view, editor, onSaved, reread };
}

export async function loaded(m: ReturnType<typeof mountEditor>): Promise<EmploymentsEditor> {
  await waitFor(() => expect(m.editor().loading).toBe(false));
  return m.editor();
}
export async function settled(m: ReturnType<typeof mountEditor>): Promise<void> {
  await waitFor(() => expect(Object.values(m.editor().status).every((s) => s !== "saving")).toBe(true));
}
export { act, waitFor };
