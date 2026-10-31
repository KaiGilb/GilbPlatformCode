// Test-only. What A's `AddressRows.*` tests got from its own helpers and from module mocks of its record client, here at the level of `fetch` over the fake
// platform of `fakePlaceStore.ts`: the catalogue's address, the writes seen, a create held until released, and the tap that opens every stored address.
import { vi } from "vitest";
import { fireEvent, waitFor, within } from "@testing-library/react";
import * as fake from "./fakePlaceStore";

export const GEO = `${fake.GEO_HOST}/base/e`;
/** The writes the platform saw, by method (A counted calls of `createRecord`, `patchRecord`, `deleteRecord`: one per request). */
let pending = 0;
export const creates = () => [...fake.writes.filter((w) => w.method === "POST"), ...Array.from({ length: pending }, () => ({ method: "POST", url: "(held)", body: null }))];
export const patches = () => fake.writes.filter((w) => w.method === "PATCH");
export const deletes = () => fake.writes.filter((w) => w.method === "DELETE");

/** Holds the next create (the composite a new address mints first) until released. A's `fake.createRecord.mockImplementationOnce`. */
export function holdNextCreate(): () => void {
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const inner = globalThis.fetch;
  let held = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      if (!held && (init?.method ?? "GET").toUpperCase() === "POST" && /\/lws\/vault\/[^/]+\/c$/.test(new URL(String(input)).pathname)) {
        held = true;
        pending += 1;
        await gate;
        pending -= 1;
      }
      return inner(input as never, init);
    }),
  );
  return release;
}

/** Waits until every stored address in `container` is compact (or already open), then taps each compact one open. A's `src/test/openStoredAddresses.ts`. */
export async function openStoredAddresses(container: HTMLElement): Promise<void> {
  await waitFor(
    () => {
      const articles = within(container).queryAllByRole("article");
      if (articles.length === 0) throw new Error("no stored address yet");
      for (const a of articles) {
        if (!a.querySelector('[data-testid="place-claim-compact"]') && !a.querySelector("input")) throw new Error("an address has not resolved yet");
      }
    },
    { timeout: 3000 },
  );
  for (const b of within(container).queryAllByTestId("place-claim-compact")) fireEvent.click(b);
}

/** The next listing of the vault's records fails (A: `fake.listVaultRecordsPage.mockImplementationOnce(throw)`). */
export function failNextListing(): void {
  const inner = globalThis.fetch;
  let done = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: unknown, init?: RequestInit) => {
      if (!done && (init?.method ?? "GET").toUpperCase() === "GET" && /\/lws\/vault\/[^/]+\/records$/.test(new URL(String(input)).pathname)) {
        done = true;
        throw new Error("503 unavailable");
      }
      return inner(input as never, init);
    }),
  );
}
