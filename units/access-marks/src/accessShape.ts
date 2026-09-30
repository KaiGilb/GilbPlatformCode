export type GrantMode = "read" | "write" | "append" | "control";

/**
 * Which icon a vault may wear.
 * Read and write together use the two-way icon.
 * Read alone uses the outward arrow.
 * Write alone, or nothing, uses no icon: the two-way icon would claim a read that is not there.
 */
export type VaultAccessShape = "read-and-write" | "read" | "none";

export function vaultAccessShape(modes: readonly string[]): VaultAccessShape {
  const read = modes.includes("read");
  const write = modes.includes("write");
  if (read && write) return "read-and-write";
  if (read) return "read";
  return "none";
}
