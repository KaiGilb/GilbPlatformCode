# legacy-employment-key

The old flat keys for a job, from before one employment was one group.

`orgName` and `title` are the first job. `orgName2` and `title2` are the second. `emp1` is not one of these keys. `t0` is not one of these keys.

## What this is

| Function | You pass | You get |
|---|---|---|
| `employmentIndexOfKey` | One key. | The index, or null. |
| `employmentKeys` | An index. | `{ org, title }` for that index. |

## What this is not

- Not `claim-handle`. That unit makes `emp1` and `t0`. This unit does not.
- Not `employment-role`. That unit reads dates and a place on a role that already exists.
- Not a migration. It does not move old facts onto new keys. The caller does that, and only when it is actually reading the old shape.

## How to take it

Package: `@kaigilb/gilbplatformcode-legacy-employment-key`

```ts
import { employmentIndexOfKey, employmentKeys } from "@kaigilb/gilbplatformcode-legacy-employment-key";
```

Path: `units/legacy-employment-key/`.

## What you pass

A key string, exactly. The match is case-sensitive. `OrgName` is null. `orgName2x` is null. `emp1` is null.

Or a number. The number is not checked. `0` is a real input. `1.5` would be written as `orgName1.5`. Do not pass a number you have not already decided is a whole index.

## What you get

Reading:

- `orgName` and `title` are index 1. The missing number means 1, not 0.
- `orgName1` and `title1` are also index 1.
- `title0` is index 0.
- `title2` is index 2.
- Anything else is null. Null means "not this old shape". It does not mean index 0.

Writing:

- Index 1 is `orgName` and `title`, with no digit. It is not `orgName1`.
- Index 2 is `orgName2` and `title2`.
- Index 0 is `orgName0` and `title0`. Zero is not rewritten as the unsuffixed pair.

So the reader accepts two spellings for index 1, and the writer emits only the unsuffixed pair. If you round-trip index 1 through `employmentKeys`, `orgName1` becomes `orgName`. That is the old writer's shape. Do not "fix" the reader to reject `orgName1`, and do not "fix" the writer to emit `orgName1`.

## Examples

```ts
employmentIndexOfKey("orgName");  // 1
employmentIndexOfKey("orgName1"); // 1
employmentIndexOfKey("title2");   // 2
employmentIndexOfKey("emp1");     // null
employmentKeys(1); // { org: "orgName", title: "title" }
employmentKeys(2); // { org: "orgName2", title: "title2" }
```

## What the host must supply

The decision that this document is still in the old flat shape. New employments use `claim-handle`, not these keys.

## Do not

- Do not use this to name a new employment.
- Do not treat null as "first job".
- Do not lowercase the key before matching.

## Wrong readings

- "orgName1 is a different job from orgName." Both read as index 1.
- "Index 1 writes orgName1, because the reader accepts it." The writer does not emit the digit for index 1.
- "These are the same as emp1 and t0." They are the shape those handles replaced. Mixing them is how two jobs become one.

## Where it came from

MyNetBase `src/model/profile.ts`, `employmentIndexOfKey` and `employmentKeys`.
