/** The vault path segments that are live at once. A user vault addresses its records under
 *  `/vault/...`; the identity node and the ontology master use `/base/...`.
 *  ⛔ Do not inline this alternation at a call site. Import it. */
export const VAULT_PATH_SEGMENTS = ["base", "vault"] as const;

/** The vault path segment an entity URI carries (`/vault` or `/base`), defaulting to `/base`
 *  when there is no URI to read — the same id-only case the origin resolver answers with the
 *  app's default origin. ⛔ Never hardcode the segment beside an origin: the URI in hand already
 *  carries it, and that is the only place it is true. */
export function vaultSegmentOf(entityUri: string | null | undefined): string {
  if (!entityUri) return "/base";
  try {
    const first = new URL(entityUri).pathname.split("/").filter(Boolean)[0];
    return (VAULT_PATH_SEGMENTS as readonly string[]).includes(first ?? "")
      ? `/${first}`
      : "/base";
  } catch {
    return "/base";
  }
}

/** Id prefix Base uses for a vault self-card. Must match `SELF_CARD_ID_PREFIX` on the server. */
export const SELF_CARD_ID_PREFIX = "vsc-";

/** Hex characters of the digest Base keeps. Must match the server's `.slice(0, 24)`. */
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
 * 🔴 THE INPUT IS THE VAULT ROOT EXACTLY AS BASE STORES IT, and the two live shapes are
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
