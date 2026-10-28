// Ported from `gilb-stakeholders` `test/ownCard/isSeatOwnerCard.d5b.test.ts` at 27fe0cef: 2 of its 2 tests (the others call symbols that are not in this unit).
import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { isSeatOwnerCard, ownCardIds } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";


const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const ROOT = "https://kai.platform.example.test/vault";
const seat = { vaultRoot: ROOT, entity: `${ROOT}/e/v`, apiHost: "id.platform.example.test" };

describe("isSeatOwnerCard: MyNet's pointer validation, shared", () => {
  it("accepts an owner id in the seat (legacy slug, derived id, an OWNER_HOST-minted @id)", async () => {
    const { isOwnerCardId, derivedId } = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: ["base", "vault"] });
    expect(isSeatOwnerCard("mnb-profile-06g3n6abadrfx11a4a6nsr73qr", `${ROOT}/e/mnb-profile-06g3n6abadrfx11a4a6nsr73qr`, isOwnerCardId, seat)).toBe(true);
    expect(isSeatOwnerCard(derivedId!, `${ROOT}/e/${derivedId}`, isOwnerCardId, seat)).toBe(true);
    expect(isSeatOwnerCard("mnb-profile-1", "https://id.platform.example.test/base/e/mnb-profile-1", isOwnerCardId, seat)).toBe(true);
    expect(isSeatOwnerCard("mnb-profile-1", "", isOwnerCardId, seat)).toBe(true);
  });
  it("refuses a contact without an owner id, and an owner id on another person's vault", async () => {
    const { isOwnerCardId } = await ownCardIds(ROOT, { selfCardIdForVault, vaultPathSegments: ["base", "vault"] });
    expect(isSeatOwnerCard("ada-lovelace-06gn7y2bbbz8x2ehb7c4q57m11", `${ROOT}/e/ada-lovelace-06gn7y2bbbz8x2ehb7c4q57m11`, isOwnerCardId, seat)).toBe(false);
    expect(isSeatOwnerCard("mnb-profile-1", "https://helip.platform.example.test/base/e/mnb-profile-1", isOwnerCardId, seat)).toBe(false);
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
