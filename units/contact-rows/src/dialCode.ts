// `joinPhone` as the app has it. ⚠ It is NOT the `joinPhone` of `phone-text`: a national number that already starts with "+" is
// returned as it is (the line `if (n.startsWith("+")) return n;`), where `phone-text` has no such line and would put the code before it.

export function joinPhone(dial: string, national: string): string {
  const d = dial.replace(/\D/g, "");
  const n = national.trim();
  if (n.startsWith("+")) return n;
  if (!d && !n) return "";
  if (!d) return n;
  return n ? `+${d} ${n}` : `+${d}`;
}
