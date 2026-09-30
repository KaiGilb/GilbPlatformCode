/**
 * The title of one condition, and the stored spelling of the list that holds it.
 *
 * `conditionTitle` reads `title`, then `a:title`. The camel key wins when it is
 * present, including when it is `""`. Null and a missing key fall through.
 * The result is trimmed. A non-string, a missing title, and a title that trims
 * to nothing all return `""`, not undefined. This is not the process name.
 * A process name is returned untrimmed. A condition title is not.
 *
 * The camel-or-stored read is a private copy of `wireField` in `units/stored-field`.
 * The two must stay in agreement. This folder does not import that package.
 *
 * `conditionFieldKebab` maps the two list names:
 *   `entryCondition` → `entry-condition`
 *   `exitCondition` → `exit-condition`
 * Only those two strings are accepted. It does not trim, and it does not
 * recognise a name that is already kebab-case.
 */

export type ConditionListField = "entryCondition" | "exitCondition";

function wireField<T>(doc: Record<string, unknown>, camel: string, kebab: string): T | undefined {
  if (doc[camel] !== undefined && doc[camel] !== null) return doc[camel] as T;
  if (doc[kebab] !== undefined && doc[kebab] !== null) return doc[kebab] as T;
  return undefined;
}

export function conditionTitle(condition: Record<string, unknown>): string {
  const titled = wireField<string>(condition, "title", "a:title");
  return typeof titled === "string" ? titled.trim() : "";
}

export function conditionFieldKebab(field: ConditionListField): string {
  return field === "entryCondition" ? "entry-condition" : "exit-condition";
}
