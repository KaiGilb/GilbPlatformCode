// Ported from GilbApp (private repo `KaiGilb/GilbApp`, commit `a703b3ed78e612e2cab77e94876ce9bce109d5a3`), `src/lib/mynet/heldnote/heldNoteVocab.registration.c214.test.ts` (1 cases).
// Re-based: the source drove the store through module mocks of the app's record client; here the real peers run over a fake platform
// (test/fakePlaceStore.ts, at the level of `fetch`). It imports the vocabulary module alone, so no earlier resolve registers the type first.
// Agent.Scaling Delta7 F4 — the held claim type is hidden from the register AT MODULE LOAD, before any
// person card resolves the vocabulary (`heldNoteVocab.ts`'s top-level `registerCardPartTypes`). Kept in
// its own file so no earlier resolve in the same module graph can register it first (that is why M12
// survived in heldSkillNote.c214.test.ts: it resolved the vocabulary before asserting).
import { expect, it } from "vitest";
import { isCardPartType } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import "./heldNoteVocab";

it("importing the held-note vocabulary alone hides t:HeldPartyFieldClaim from the register (no resolve)", () => {
  expect(isCardPartType("t:HeldPartyFieldClaim")).toBe(true);
});
