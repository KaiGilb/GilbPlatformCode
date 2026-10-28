// Cycle145 — THE DOOR IS PART OF THE QUESTION, SO IT IS PART OF THE CACHE KEY.
//
// This file guards carried item ①. It exists because the mutant tally said it had to:
// reverting the door out of `relationsKey` / `useRecord`'s key left every acceptance arm
// GREEN. An unguarded change is decoration, so either the change goes or a guard that
// bites does. This is the guard.
//
// ── What it protects, in one sentence ────────────────────────────────────────────────────
// `readRelations(id, null)` and `readRelations(id, "<vault>")` are TWO DIFFERENT QUESTIONS.
// Base resolves an id at the host the request NAMED and at no other (`resolveEntityUriById`,
// Ann's 2026-07-19 ruling 3P.C.EveryEntityInNamedVault.Base), so the first truthfully answers
// `[]` (the C2b non-disclosure 404) and the second truthfully answers the record's real
// participation set. Both are a well-formed `RecordRelation[]`; nothing downstream can tell
// them apart. Keyed on the id alone they SHARE ONE CACHE ENTRY — so whichever door is asked
// first owns the answer, and because the observer is already mounted, `queryFn` never re-runs
// when the address finally arrives.
//
// That is not hypothetical. Measured on the reload trace for Ann's `Ann`
// (`RecordGraph.vaqa145.test.tsx` VAQA-2, before the fix): 2 asks at the apex, 0 at the vault,
// byte-identical over 25 s, no self-heal past `staleTime`.
//
// ⚠ THE HONEST SCOPE OF THIS FILE. The hop-walk gate (`useGraphNodeSet` → `seedReady`) is
// what actually closes Ann's symptom today — measured, and stated plainly in the artefact.
// With that gate in place the graph no longer ASKS before it knows the address, so the
// key-blindness is not currently reachable through that path. It is still a live defect of
// the cache itself: any future path that learns an address late re-opens it silently. So the
// guard below measures the PROPERTY — "a changed door is re-asked" — rather than waiting for
// a second surface to rediscover it the way five previous symptoms in this family did.
// ⛔ It is NOT cited as evidence that Ann's reload symptom is fixed. VAQA-2 is that evidence.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { relationsKey } from "./relations";
import { setUp, tearDown } from "../test/support";

const VAULT_ORIGIN = "https://ann.platform.example.test";
const ID = "ann-06g1wznmzxrn7dc6rtm4dqa6f4";
const OTHER = "ben-06g1srta9xs1zdhcmesfrtpbcc";

beforeEach(() => {
  setUp();
});
afterEach(() => {
  tearDown();
});

describe("C145 ① — the door is in the cache key", () => {
  it("🔴 two DOORS are two KEYS — an apex answer can never be served as a vault answer", () => {
    const apex = relationsKey(ID, null);
    const vault = relationsKey(ID, `${VAULT_ORIGIN}/base/e/${ID}`);
    expect(apex).not.toEqual(vault);
  });

  it("the SAME vault is ONE key — the graph still warms the detail pane, never double-fetches", () => {
    // ⚠ Load-bearing in the other direction: keying on the raw `at` would give every record
    // its own door segment, split the pane's entry from the graph's, and double every
    // reverse-lookup in the app. The ORIGIN is exactly what varies the answer.
    const viaEntityUri = relationsKey(ID, `${VAULT_ORIGIN}/base/e/${ID}`);
    const viaVaultNamespace = relationsKey(ID, `${VAULT_ORIGIN}/base`);
    const viaOtherRecordInSameVault = relationsKey(ID, `${VAULT_ORIGIN}/base/e/${OTHER}`);
    expect(viaEntityUri).toEqual(viaVaultNamespace);
    expect(viaEntityUri).toEqual(viaOtherRecordInSameVault);
  });
});
