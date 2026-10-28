// Ported from `gilb-stakeholders` `test/ownCard/ownCard.d5.test.ts` at 27fe0cef: 1 of its 10 tests (the others call symbols that are not in this unit).
import { createHash } from "node:crypto";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { findOwnCard, type FindOwnCardDeps } from "./ownCard";
import { resetSystemHostLabels, setSystemHostLabels } from "./systemHostLabels";


const selfCardIdForVault = async (root: string) => `vsc-${createHash("sha256").update(root).digest("hex").slice(0, 24)}`;
const SEGMENTS = ["base", "vault"] as const;
const ROOT = "https://t3solo.example/vault";
const LEGACY = "mnb-profile-06gn7xywz9smdae2ehb7c4q57m"; // an organisation named "MNB Profile Org"

/** A seat: its pointer and its records by id with their served type. Listing is offered and must never be read. */
function seat(opts: { pointer?: string | null; cards: Record<string, unknown> }) {
  const reads: string[] = [];
  const deps = {
    selfCardIdForVault,
    vaultPathSegments: SEGMENTS,
    readProfilePointer: async () => (reads.push("pointer"), opts.pointer ?? null),
    readCard: async (id: string) => {
      reads.push(`card ${id}`);
      return id in opts.cards ? { atId: `${ROOT}/e/${id}`, type: opts.cards[id] } : null;
    },
    listPersonCards: async () => {
      reads.push("listing");
      return Object.keys(opts.cards).map((id) => ({ entity: `${ROOT}/e/${id}`, updatedAt: "2026-10-19T11:42:17Z" }));
    },
  } satisfies FindOwnCardDeps & { listPersonCards: unknown };
  return { deps, reads };
}

describe("D5: the pointer", () => {

  it("D5b: names a record on another vault: refused as MyNet refuses it", async () => {
    const { deps } = seat({ pointer: `https://helip.example/base/e/${LEGACY}`, cards: { [LEGACY]: "t:Person" } });
    deps.readCard = async () => ({ atId: `https://helip.example/base/e/${LEGACY}`, type: "t:Person" });
    const f = await findOwnCard(deps, { vaultRoot: ROOT });
    expect(f.cardId).toBeNull();
  });
});

// The platform's own host labels are a setting; the ported tests ran against these.
beforeEach(() => setSystemHostLabels(["id", "veda", "geo", "kaizen", "www", "skills", "connect", "gilb"]));
afterEach(() => resetSystemHostLabels());
