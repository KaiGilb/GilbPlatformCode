// A value that follows another one only after it has been still for `ms`. Starts equal to the value, so a box opened with words in it filters at once.
import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    if (Object.is(settled, value)) return;
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms, settled]);
  return settled;
}
