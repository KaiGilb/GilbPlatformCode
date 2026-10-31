// Test-only. The Employment section over an in-memory vault behind `fetch` (the real peers run against it): the master answered with the term
// names themselves, a finder over the vault's organization records, and `show` to mount the section.
import { expect, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { EmploymentRows } from "../src/index";
import { VAULT, factOf, store, uriOf } from "./vault";
import { master } from "./master";

export function answerMaster(): void {
  master.attributeSpelling.mockReset().mockImplementation(async (n: string) => n);
  master.typeSpelling.mockReset().mockImplementation(async (n: string) => `t:${n}`);
}

/** The finder the host gives: the organization records of the vault whose name has a word starting with the text. Complete. */
export const finder = vi.fn(async (vaultId: string, text: string) => ({
  hits: [...store.entries()]
    .filter(([, e]) => e.type === "t:Organization")
    .filter(([, e]) => String(e.facts["name"] ?? "").toLowerCase().split(/\s+/).some((w) => w.startsWith(text.toLowerCase())))
    .map(([id, e]) => ({ uri: `${vaultId}/e/${id}`, label: String(e.facts["name"]) })),
  complete: true,
}));

export type RowsProps = Parameters<typeof EmploymentRows>[0];

export function show(person: string, over: Partial<RowsProps> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onSaved = vi.fn();
  const mk = (p: Partial<RowsProps>) => (
    <QueryClientProvider client={qc}>
      <EmploymentRows
        title="Employment"
        recordId={person}
        recordEntityUri={uriOf(person)}
        vaultId={VAULT}
        edgeKey="employment"
        servedEdges={factOf(person, "employment")}
        canEdit
        onSaved={onSaved}
        find={finder}
        vaultName="Hytta"
        {...over}
        {...p}
      />
    </QueryClientProvider>
  );
  const view = render(mk({}));
  /** The record re-read after a write: the served edges are what the vault holds now. */
  const reread = (p: Partial<RowsProps> = {}) => view.rerender(mk({ servedEdges: factOf(person, "employment"), ...p }));
  return { ...view, onSaved, reread, rerenderWith: (p: Partial<RowsProps>) => view.rerender(mk(p)), q: within(view.container) };
}
export { expect };
