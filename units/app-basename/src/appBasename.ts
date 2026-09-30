/**
 * The app mount used when joining a path, with one trailing slash removed.
 *
 * catalog-path adds a slash when one is missing, because it joins a file name.
 * This function removes one slash when one is present, because the caller
 * joins the next segment itself. They are not interchangeable.
 *
 * The bundler value stays in the host. Pass it in.
 */

/**
 * One trailing slash removed.
 *
 * A missing mount and a null mount are treated as `/`, and `/` with the slash
 * removed is `""`.
 * An empty string stays `""`. It is not replaced with `/` first.
 * Only one slash is removed. `/mynet//` becomes `/mynet/`.
 * Nothing is trimmed. A relative mount stays relative.
 */
export function appBasenameFrom(baseUrl: string | null | undefined): string {
  const raw = baseUrl ?? "/";
  return raw.replace(/\/$/, "");
}
