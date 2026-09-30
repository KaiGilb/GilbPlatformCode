/**
 * Whether a stored link may be read to find out what it is.
 * A bare id may. An absolute address may only when its host is the holder's host.
 * The scheme is not compared. Nothing is fetched.
 */
export function handoffReadableAtHolder(
  link: string,
  holderUri: string | null | undefined,
): boolean {
  const trimmed = link.trim();
  if (!trimmed) return false;
  if (!/^https?:\/\//i.test(trimmed)) return !trimmed.includes(":") && !trimmed.includes("/");
  if (!holderUri) return false;
  try {
    return new URL(trimmed).host === new URL(holderUri).host;
  } catch {
    return false;
  }
}
