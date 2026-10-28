// Ported from `gilb-stakeholders` `test/recordPages.s129.test.ts` at 27fe0cef: 1 of its 2 tests (the others call symbols that are not in this unit).
import { describe, expect, it } from "vitest";
import { syncRecordChanges } from "./recordPages";
import { type PlatformClient } from "./platform";


const ORIGIN = "https://holder.platform.example.test";
const VAULT = `${ORIGIN}/vault`;
const REAL_400 = { error: "since_cursor_invalid", message: "since must be the nextCursor this list returned to you for this vault, or the word start, or the word head", accepted: ["start", "head", "<nextCursor>"] };

function fake() {
  const seen: string[] = [];
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  const fetch = async (url: string): Promise<Response> => {
    seen.push(url);
    const q = new URL(url).searchParams;
    const since = q.get("since");
    const ended = q.get("lifecycle") === "ended";
    if (since === "head") return json(200, { records: [], complete: true, nextCursor: `ok-${ended ? "e" : "l"}` });
    if (since === "start") return json(200, { records: [{ entity: `${VAULT}/e/r1`, typeUri: "t:Person", label: "r1", body: { "@id": "r1" }, etag: '"1"' }], complete: true, nextCursor: "ok-l" });
    if (since && !since.startsWith("ok-")) return json(400, REAL_400);
    return json(200, { records: [], complete: true, nextCursor: since ?? "ok-l" });
  };
  return { platform: { origin: ORIGIN, fetch: fetch as PlatformClient["fetch"] }, seen };
}

describe("C214-SP1b · Agent.Tester s129 · the platform's real since_cursor_invalid answer", () => {
  it("syncRecordChanges answers null (read the list again), as its contract says, on the platform's real 400 body", async () => {
    const f = fake();
    await expect(syncRecordChanges(f.platform, VAULT, ["Person"], { live: "rotated-seal", ended: "ok-e" })).resolves.toBeNull();
  });
});
