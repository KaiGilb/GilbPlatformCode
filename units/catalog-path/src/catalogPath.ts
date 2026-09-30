/**
 * The catalog file under an app mount.
 *
 * A mount with no trailing slash would glue the next segment onto the last
 * folder (`/mynet` + `data` becomes `/mynetdata`). This function adds the slash
 * when it is missing. It does not add a leading slash. A relative mount stays
 * relative. Nothing is trimmed.
 */

/**
 * `<mount>/data/thin-skills.json`, with exactly one slash between mount and `data`.
 *
 * `"/"` and `"/mynet/"` are unchanged before `data` is added.
 * `"/mynet"` becomes `"/mynet/data/thin-skills.json"`.
 * `""` becomes `"/data/thin-skills.json"`, because the empty string does not
 * end in `/`, so a slash is added first.
 */
export function thinSkillsPathFor(baseUrl: string): string {
  const mount = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${mount}data/thin-skills.json`;
}
