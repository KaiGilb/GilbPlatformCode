/**
 * What a person may pick when creating another vault.
 * These four buttons are shortcuts. They are not the full list of types.
 * The live search stays in the app. Nothing here is fetched.
 */

/** One shortcut. The button shows pickName. The stored type is typeName. They can differ. */
export interface VaultPurposePick {
  pickName: string;
  typeName: string;
}

/**
 * Organization, Group, Building, Project.
 * Group stores CollectiveAgent. There is no Business button.
 * Building is included. Do not add the sign-in seat.
 */
export const READY_VAULT_PURPOSE_PICKS: readonly VaultPurposePick[] = [
  { pickName: "Organization", typeName: "Organization" },
  { pickName: "Group", typeName: "CollectiveAgent" },
  { pickName: "Building", typeName: "Building" },
  { pickName: "Project", typeName: "Project" },
];

/** The smallest shape this unit needs from a type the host already loaded. */
export interface VaultPurposeOption {
  typeName: string;
  id: string;
  kind: string;
}

/**
 * True for the sign-in seat, which a person must not assign.
 * The type name is trimmed, lowercased, and one leading "a:" is removed, then compared
 * to the word signinpod. "t:" is not removed.
 * The id is trimmed and lowercased, then searched for the letters signinpod anywhere.
 * A hyphenated "sign-in-pod" does not match.
 */
export function isSignInSeatType(option: { typeName: string; id: string }): boolean {
  const name = option.typeName.trim().toLowerCase().replace(/^a:/, "");
  const id = option.id.trim().toLowerCase();
  if (name === "signinpod") return true;
  if (id.includes("signinpod")) return true;
  return false;
}

/** True when the loaded option is a type and is not the sign-in seat. Kind must be exactly "type". */
export function isChoosableVaultPurposeType(option: VaultPurposeOption): boolean {
  return option.kind === "type" && !isSignInSeatType(option);
}
