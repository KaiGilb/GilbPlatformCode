# condition-title

The title of one condition, and the stored spelling of the list that holds conditions.

## What this is

`conditionTitle` reads `title`, then `a:title`.

- The camel key wins when it is present, including when it is `""`. An empty camel title hides `a:title`. Null and a missing key fall through.
- A string is trimmed. `"  Hello  "` is `"Hello"`. A string of spaces is `""`.
- A non-string, a missing title, and a title that trims to nothing all return `""`. Not undefined. A condition with no title is an empty string, so a row can render without a second check.

`conditionFieldKebab` maps the two list names the app uses in code onto the stored names:

| You pass | You get |
|---|---|
| `entryCondition` | `entry-condition` |
| `exitCondition` | `exit-condition` |

Anything else is not in the type. A value that is already `entry-condition` is not accepted. The function does not trim.

## What this is not

- Not the process name. `stored-field`'s `storedProcessName` returns a machine handle untrimmed once it contains a non-space character. A condition title is always trimmed, and a miss is `""`.
- Not the removal check. That is `condition-removal`.
- Not a writer. It does not build the patch that sets a title.

The camel-or-stored read is a private copy of `wireField` in `units/stored-field`. An empty string blocks the other spelling in both. This folder does not import that package. The two copies must stay in agreement.

## How to take it

Package: `@kaigilb/gilbplatformcode-condition-title`

```ts
import { conditionFieldKebab, conditionTitle } from "@kaigilb/gilbplatformcode-condition-title";
```

Path: `units/condition-title/`.

## Examples

```ts
conditionTitle({ title: "  Hello  " }); // "Hello"
conditionTitle({ title: "", "a:title": "stored" }); // ""
conditionTitle({ title: null, "a:title": " stored " }); // "stored"
conditionTitle({ title: 1, "a:title": "stored" }); // ""
conditionTitle({}); // ""

conditionFieldKebab("entryCondition"); // "entry-condition"
conditionFieldKebab("exitCondition"); // "exit-condition"
```

## What the host must supply

The condition object. Which list you are editing. This unit will not guess that a missing title should show the condition text.

## Do not

- Do not fall through to `a:title` when `title` is `""`.
- Do not return the untrimmed title to match the process-name rule. These are different fields.
- Do not pass `entry-condition` into `conditionFieldKebab`. Pass the camel name.

## Wrong readings

- "Empty string and missing are the same." Missing falls through. `""` on `title` blocks `a:title` and then trims to `""`.
- "A number title uses the stored string beside it." A present non-null camel value wins, and a non-string becomes `""`. The stored string is not consulted.
- "This names the condition." It names the title only. The tag is `condition-tag`.

## Where it came from

GilbApp `conditionTitle` and `conditionFieldKebab` in `src/lib/base/processTypes.ts`.
