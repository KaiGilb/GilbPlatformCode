// Ported from `gilb-stakeholders` `test/ownCard/ownCard.tester-s63.test.ts` at 27fe0cef: 1 of its 1 tests (the others call symbols that are not in this unit).
import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { findOwnCard, type FindOwnCardDeps } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";


const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const ROOT = "https://kai.example/base";

describe("findOwnCard parity with MyNet's seat-vault test (Agent.Tester s63)", () => {
  it("a pointer to an mnb-profile card on ANOTHER person-vault host is not the card MyNet shows", async () => {
    const derived = await selfCardIdForVault(ROOT);
    const foreign = "https://group.example/base/e/mnb-profile-06g3n6abadrfx11a4a6nsr73qr";
    const deps: FindOwnCardDeps = {
      selfCardIdForVault,
      vaultPathSegments: ["base", "vault"],
      readProfilePointer: async () => foreign,
      readCard: async (id) => id === derived || foreign.endsWith(id),
    };
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    // MyNet (profileStore.ts discoverProfile → tryFollowPointer → isSeatOwnerCard) refuses the foreign card and goes on to the derived one.
    expect(f.cardId).toBe(derived);
    expect(f.road).toBe("derived");
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
