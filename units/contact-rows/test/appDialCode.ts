// The app's `splitPhone` and `joinPhone` (src/lib/mynet/phone/dialCode.ts lines 1-27), for the test copy of its PhoneValue.
// Copied from MyNet `src/lib/phone/dialCode.ts` at MyNet SHA 18f6c2d (Cycle214 step 1e it4: "make the
// fields exactly like MyNet in all ways. Ideally the same code"). Verbatim below this header.

// Splits a stored phone into the code and the rest.
// The code comes from the country record, not from a list kept here.
// A number with no space does not have its code guessed.
// A number that already starts with + is kept as typed.

export function splitPhone(value: string): { dial: string; national: string } {
  const trimmed = value.trim().replace(/^tel:/i, "");
  if (!trimmed.startsWith("+")) return { dial: "", national: trimmed };
  const body = trimmed.slice(1);
  const space = body.search(/\s/);
  if (space < 1) return { dial: "", national: trimmed };
  const dial = body.slice(0, space).replace(/\D/g, "");
  if (!dial) return { dial: "", national: trimmed };
  return { dial, national: body.slice(space + 1).trim() };
}

export function joinPhone(dial: string, national: string): string {
  const d = dial.replace(/\D/g, "");
  const n = national.trim();
  if (n.startsWith("+")) return n;
  if (!d && !n) return "";
  if (!d) return n;
  return n ? `+${d} ${n}` : `+${d}`;
}
