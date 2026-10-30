// What this app made, kept per principal and vault so End knows exactly which records are its own: `speedkittaking-live.made.<principal>.<vault>`.
export const madeKey = (principal: string, vault: string): string => `speedkittaking-live.made.${principal}.${vault}`;

export function readMade(principal: string, vault: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(madeKey(principal, vault)) ?? "[]") as unknown;
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch { return []; }
}
export function writeMade(principal: string, vault: string, ids: readonly string[]): void {
  try { localStorage.setItem(madeKey(principal, vault), JSON.stringify([...new Set(ids)])); } catch { /* storage blocked: End then sees nothing, which is the safe side */ }
}
export function addMade(principal: string, vault: string, id: string): void { writeMade(principal, vault, [...readMade(principal, vault), id]); }
export function removeMade(principal: string, vault: string, gone: readonly string[]): void {
  const drop = new Set(gone);
  writeMade(principal, vault, readMade(principal, vault).filter((x) => !drop.has(x)));
}
