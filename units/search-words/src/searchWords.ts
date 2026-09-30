/**
 * Turn a type name into the words a label search can see, and the queries to try.
 *
 * A search over labels often misses a bare PascalCase name. These two functions
 * are the queries. They do not search, and they do not pick a hit.
 * Nothing is lowercased.
 */

/**
 * Spaces inserted into PascalCase or camelCase, and `_` or `-` become a space.
 *
 * `AnchorDurability` is `Anchor Durability`.
 * `SkillYearsOfExperienceScale` is `Skill Years Of Experience Scale`.
 * `XMLParser` is `XML Parser`.
 * Runs of space are one space. The ends are trimmed.
 * A colon is not a split. `a:Name` stays `a:Name`.
 */
export function pascalCaseToSearchWords(name: string): string {
  return name
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Queries to try, in this order, with duplicates removed.
 *
 * 1. The name, trimmed.
 * 2. The spaced form, only when it is not the same string as the untrimmed name.
 * 3. When the spaced form has three or more words, the first three, then the first two.
 * 4. When it has exactly two words, the first word only.
 *
 * A blank after trim is skipped. Comparison is exact, not folded.
 * `FooBar` is `FooBar`, then `Foo Bar`, then `Foo`.
 * `A B C` is `A B C`, then `A B`. The full string is not repeated.
 */
export function entityResolveSearchQueries(termName: string): string[] {
  const spaced = pascalCaseToSearchWords(termName);
  const out: string[] = [];
  const push = (q: string) => {
    const t = q.trim();
    if (t && !out.includes(t)) out.push(t);
  };
  push(termName);
  if (spaced !== termName) push(spaced);
  const words = spaced.split(" ").filter(Boolean);
  if (words.length >= 3) {
    push(words.slice(0, 3).join(" "));
    push(words.slice(0, 2).join(" "));
  } else if (words.length === 2) {
    push(words[0]!);
  }
  return out;
}
