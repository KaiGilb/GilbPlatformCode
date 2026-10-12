// The vault self-card ADDRESS — the one road to a person's own card that needs no pointer,
// no localStorage and no prior knowledge.
//
// ── WHY THIS EXISTS ───────────────────────────────────────────────────────────────────────
// A person's photo can be on their card, and the card in their vault, with no way back to it:
// the vault's own record names no self-card (`a:vaultSelfCard` has no writers), so no vault
// carries the pointer. On reload an app then has three roads, and all three are conditional:
//     1. the vault→card pointer     — does not exist, for any vault
//     2. a localStorage pointer     — the device that saved it, until the cache is cleared
//     3. a cross-app person lookup  — a network round trip that 404s for non-person vaults
// The avatar paints right after a save (road 2) and reverts to initials on a clean reload. The
// person's words for that are "the profile picture is not saved".
//
// 🔴 THE ADDRESS IS DERIVABLE, so none of those roads is load-bearing. The server mints a
// self-card at a DETERMINISTIC address keyed on the vault root: `vsc-` + sha256(vault root)
// truncated to 24 hex. Any app that knows the vault root can compute where the card MUST be and
// fetch it directly.
//
// ⛔ Two apps agreeing on a constant is not interoperability — two apps running the SAME
// derivation is. If each app wrote this, a one-character divergence would send them to different
// addresses and the photo would be visible in one app and invisible in the other, silently.

/** Id prefix the server uses for a vault self-card. Must match `SELF_CARD_ID_PREFIX` on the server. */
export const SELF_CARD_ID_PREFIX = "vsc-";

/** Hex characters of the digest the server keeps. Must match the server's `.slice(0, 24)`. */
const SELF_CARD_HASH_LEN = 24;

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (const b of bytes) out += b.toString(16).padStart(2, "0");
  return out;
}

/**
 * The self-card id for a vault root — `vsc-<sha256(vaultRoot) first 24 hex>`.
 *
 * 🔴 THE INPUT IS THE VAULT ROOT EXACTLY AS THE SERVER STORES IT, and the two live shapes are
 * `https://<host>/base` (a SYSTEM vault) and `https://<host>/vault` (a USER vault). They hash
 * to DIFFERENT addresses — that is the server's behaviour, not a defect here, and it is why
 * this takes the root verbatim and ⛔ never normalises, trims a trailing slash or guesses a
 * segment. A caller that passes a guessed root gets a real-looking address for a card that
 * does not exist.
 *
 * ⚠ Async because it uses Web Crypto, which is the digest available in BOTH a browser and
 * Node without a dependency. ⛔ Do not swap in a hand-rolled sha256 to make it synchronous:
 * this value must be byte-identical to the server's or it addresses nothing.
 */
export async function selfCardIdForVault(vaultRoot: string): Promise<string> {
  const root = typeof vaultRoot === "string" ? vaultRoot.trim() : "";
  if (!root) {
    throw new Error(
      "selfCardIdForVault requires the vault root — an empty key would collide every vault onto one card.",
    );
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(root));
  return `${SELF_CARD_ID_PREFIX}${toHex(digest).slice(0, SELF_CARD_HASH_LEN)}`;
}

/**
 * The self-card's full entity URI in its own vault, which is the address a read must be
 * ADDRESSED AT — the server routes a dereference by the host the request names and answers about no
 * other vault. ⛔ Never fetch a self-card at a default origin and conclude it is absent.
 */
export async function selfCardEntityUri(vaultRoot: string): Promise<string> {
  const id = await selfCardIdForVault(vaultRoot);
  return `${vaultRoot.trim().replace(/\/+$/, "")}/e/${id}`;
}

/** True when an id looks like a derived self-card address rather than a minted record id. */
export function isSelfCardId(id: string | null | undefined): boolean {
  return typeof id === "string" && new RegExp(`^${SELF_CARD_ID_PREFIX}[0-9a-f]{${SELF_CARD_HASH_LEN}}$`).test(id.trim());
}
