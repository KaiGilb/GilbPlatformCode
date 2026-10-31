// A recording catalogue: a stand-in `fetch` that answers the skill search, and the term origin the host sets once.
import { vi } from "vitest";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export const ORIGIN = "https://catalogue.example.test";
export const NURSING = `${ORIGIN}/base/t/Nursing`;
export const SELL = `${ORIGIN}/base/t/SellProducts`;

export interface Hit {
  entity: string;
  label: string | null;
  typeUri: string | null;
  does: string | null;
}
export const hit = (label: string, typeUri: string, does: string | null = null, n = label.length): Hit => ({ entity: `${ORIGIN}/base/e/${n}`, label, typeUri, does });

export function useOrigin() {
  setTermOrigin(ORIGIN);
}
export function clearOrigin() {
  resetTermOrigin();
}

export interface Seen {
  url: string;
  init: RequestInit;
}
/** Answers every request with `answer(url)`; records each. */
export function stubSearch(answer: (url: string, init: RequestInit) => Response | Promise<Response>): Seen[] {
  const seen: Seen[] = [];
  vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
    seen.push({ url: String(url), init });
    return answer(String(url), init);
  });
  return seen;
}
export const body = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status });
