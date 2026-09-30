/**
 * Four lines for one access row.
 *
 * The key that holds the grant is the string you pass. It is never replaced
 * by an alias. A missing name is a sentence about what is missing. It is not
 * the key printed as if it were a name.
 *
 * Silence is not a fact. `registered` omitted is not `registered: false`.
 */

export type PrincipalLabelSource =
  | "vault-name"
  | "identity-seat"
  | "account-email"
  | "account-email-superseded";

export type PrincipalViewerRelation = "self" | "earlier-identity-of-self";

/** The fields this row reads. Other fields on a server entry are ignored. */
export interface PrincipalAclEntry {
  label?: string | null;
  webId?: string | null;
  labelSource?: PrincipalLabelSource | null;
  registered?: boolean;
  viewer?: PrincipalViewerRelation | null;
}

export interface PrincipalRow {
  /** Who, when a name was supplied. Otherwise what the key is. Never the raw key. */
  title: string;
  /** The viewer's own row, or null. */
  badge: string | null;
  /** Where the title came from. Always non-empty. */
  provenance: string;
  /** The key you passed, unchanged. */
  grantKey: string;
  /** A page address when one was supplied. Null when it was blank. */
  identityPage: string | null;
}

const PROVENANCE: Record<PrincipalLabelSource, string> = {
  "vault-name": "Name reserved in the BaseID register",
  "identity-seat": "Email proven to BaseID for this identity",
  "account-email": "The email this key signs in as",
  "account-email-superseded":
    "An earlier sign-in identity of this account — the account no longer signs in as this key, " +
    "but this key still holds the access below",
};

/**
 * Which namespace a key is in. Text that is not an absolute URL is `other`.
 * This function does not trim. The URL parser itself ignores a leading or
 * trailing space, so those still classify. Do not add a trim, and do not
 * treat a surrounding space as `other`.
 *
 * Checked in this order:
 * 1. path contains `/base/g/` → `group`
 * 2. path contains `/base/p/` → `principal`
 * 3. path is exactly `/base` or `/base/` → `pod`
 * 4. path is exactly `/i` or ends with `/i` → `pod`
 * 5. anything else, including `/vault`, → `other`
 *
 * `/base/g` without the slash after `g` is `other`. `/i/` is `other`.
 * A path that ends in `/i` is `pod` even when it is not a short identity,
 * unless an earlier rule matched. `/files/i` is `pod`.
 *
 * A user vault root (`/vault`) is `other`, not `pod`. Do not add it.
 */
export function keyNamespace(uri: string): "principal" | "group" | "pod" | "other" {
  try {
    const u = new URL(uri);
    if (u.pathname.includes("/base/g/")) return "group";
    if (u.pathname.includes("/base/p/")) return "principal";
    if (u.pathname === "/base" || u.pathname === "/base/") return "pod";
    if (u.pathname === "/i" || u.pathname.endsWith("/i")) return "pod";
    return "other";
  } catch {
    return "other";
  }
}

/** First hostname label, unless that label is `id` or `www`, in which case the whole hostname. */
function vaultHostLabel(uri: string): string {
  try {
    const host = new URL(uri).hostname;
    const first = host.split(".")[0] ?? "";
    return first === "id" || first === "www" ? host : first;
  } catch {
    return "";
  }
}

/**
 * The four lines.
 *
 * A trimmed label with a source uses that source's sentence.
 * A trimmed label with no source says the register was not stated.
 * A spaces-only label is not a label.
 *
 * No label:
 * - `pod` → title is the host label above, or `Vault` when that is empty.
 *   `registered` truthy uses the reserved-name sentence. False, missing, and
 *   no entry at all share the other pod sentence. A pod does not say
 *   `Registered pod`.
 * - `registered: true` → `Registered group` or `Registered principal`.
 *   `other` is worded as a principal.
 * - `registered` omitted → `Group key` or `Principal key`, and a sentence
 *   that a name was not returned. This is not the "holds nothing" sentence.
 * - `registered: false` → the same title, and the sentence that no reserved
 *   name, vault, identity seat, or account is held.
 *
 * Badge is `YOU` or `YOU — EARLIER IDENTITY`, or null. The dash is an em dash.
 *
 * `grantKey` is `uri`, not a field on the entry.
 */
export function principalRow(uri: string, entry?: PrincipalAclEntry | null): PrincipalRow {
  const label = entry?.label?.trim() ?? "";
  const source = entry?.labelSource ?? null;
  const ns = keyNamespace(uri);
  const badge =
    entry?.viewer === "self"
      ? "YOU"
      : entry?.viewer === "earlier-identity-of-self"
        ? "YOU — EARLIER IDENTITY"
        : null;
  const identityPage = entry?.webId && entry.webId.trim() !== "" ? entry.webId.trim() : null;

  if (label !== "" && source !== null) {
    return { title: label, badge, provenance: PROVENANCE[source], grantKey: uri, identityPage };
  }
  if (label !== "") {
    return {
      title: label,
      badge,
      provenance: "Name supplied by BaseID (register not stated)",
      grantKey: uri,
      identityPage,
    };
  }

  const kindWord = ns === "group" ? "group" : ns === "pod" ? "pod" : "principal";
  if (ns === "pod") {
    const host = vaultHostLabel(uri);
    return {
      title: host || "Vault",
      badge,
      provenance: entry?.registered
        ? "A vault identity registered in BaseID; no reserved name"
        : "Read from the vault's own host — BaseID holds no reserved name for it",
      grantKey: uri,
      identityPage,
    };
  }
  if (entry?.registered === true) {
    return {
      title: `Registered ${kindWord}`,
      badge,
      provenance:
        `BaseID holds an account for this ${kindWord}, and its name is not published to you. ` +
        "The access below is held by the key on the line above.",
      grantKey: uri,
      identityPage,
    };
  }
  if (entry?.registered === undefined) {
    return {
      title: `${kindWord === "group" ? "Group" : "Principal"} key`,
      badge,
      provenance: `No name was returned for this ${kindWord}. It holds the access below.`,
      grantKey: uri,
      identityPage,
    };
  }
  return {
    title: `${kindWord === "group" ? "Group" : "Principal"} key`,
    badge,
    provenance:
      `BaseID holds no reserved name, vault, identity seat or account for this ${kindWord}. ` +
      "It exists only as the holder of the access below.",
    grantKey: uri,
    identityPage,
  };
}

/** Line 1 of {@link principalRow}. */
export function principalLabel(uri: string, entry?: PrincipalAclEntry | null): string {
  return principalRow(uri, entry).title;
}

/**
 * The key that holds the grant.
 *
 * Returns `uri` unchanged. It does not return an alias, a trimmed copy, or
 * a page address. Those are other lines.
 */
export function principalGrantKey(uri: string): string {
  return uri;
}
