/** Two URLs are the same when they parse to the same address, ignoring trailing slashes. Used to pin the vault and to gate creates. */
export const sameUrl = (a: string | null | undefined, b: string): boolean => {
  if (!a) return false;
  try {
    return new URL(a).href.replace(/\/+$/, "") === new URL(b).href.replace(/\/+$/, "");
  } catch {
    return false;
  }
};
