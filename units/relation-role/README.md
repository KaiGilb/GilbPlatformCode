# relation-role

Tells whether a served relation role is a given role, with or without its `role:` prefix, and names the shape of one relation a record takes part in.

## What this is

Tells whether a served relation role is a given role, with or without its `role:` prefix, and names the shape of one relation a record takes part in. It is two small pieces that the plan units share, kept in one place so they are not copied again:

- `roleIs(value, slug)`: whether a role the vault served is the role `slug` names. The vault sometimes drops the `role:` prefix, so `roleIs("source", "role:source")`, `roleIs("role:source", "source")`, `roleIs("source", "source")` and `roleIs("role:source", "role:source")` are all true. It is false for an empty, null, undefined or non-string value, and for a slug that is empty or only `role:`. The comparison is exact (case, spaces).
- `RecordRelation` (a type): one relation a record takes part in, as the platform's reverse lookup returns it: `relation` (the relation's entity URI), `role` (the role the record fills, verbatim), and, when the vault returns them, `members` (the co-members, each `{ member, role }`, a read-only list) and `type` (the relation's stored type, such as `t:PartOf`).

Pure: no React, no network. Wire vocabulary: the `role:` prefix.

## What this is not

- Not a relation reader or counter. It holds the shape of one row and a role test, nothing else. The unit `relation-count` counts and walks relations.
- Not a second `RecordRelation`. The existing unit `relation-count` declares its own `RecordRelation`; it has the same four fields with the same types (`relation: string`, `role: string`, `members?: readonly { member: string; role: string }[]`, `type?: string`; only the comments differ). The two types are mutually assignable, and TypeScript's strict identity test (`<T>() => T extends X ? 1 : 2`) calls them identical. A value of one is accepted where the other is asked for, so the two units can be installed together.
- Not a role vocabulary. It does not know any role name; the units that use it name their own (`role:solution`, `role:value`, `role:resource`).

## How to take it

Package: `@kaigilb/gilbplatformcode-relation-role`

From a clone of this repository, install the unit's folder:

```sh
npm install <path-to-the-library>/units/relation-role
```

Put this line in your app's own `.npmrc` so the unit is installed as a copy and not a link:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. No runtime dependency.

## Examples

```ts
import { roleIs, type RecordRelation } from "@kaigilb/gilbplatformcode-relation-role";

const rel: RecordRelation = {
  relation: "https://vault.example.test/base/r/abc",
  role: "solution", // the vault dropped the prefix
  members: [{ member: "https://vault.example.test/base/e/one", role: "value" }],
  type: "t:ImpactOn",
};

roleIs(rel.role, "role:solution"); // true
roleIs(rel.members?.[0]?.role, "role:resource"); // false
```

## What the host must supply

- Nothing. No React, no CSS, no environment. The relation rows come from wherever the host reads them.

## Do not

- Do not pass a role with a prefix other than `role:` and expect it to be stripped from the VALUE: only the slug loses its `role:`; the value is compared as it is, or with `role:` put in front.
- Do not use `roleIs` to test a relation's type (`t:ImpactOn`); it is for roles.
- Do not mutate `members`: it is typed read-only.

## Wrong readings

- "`roleIs(value, slug)` strips `role:` from both." Only from the slug. The value matches when it is the bare name or `role:` plus the bare name, so a value of `role:role:source` does not match `role:source`.
- "A slug of `role:` matches a value of `role:`." It does not: an empty bare name is always false.
- "A slug `role:role:x` is an error." One `role:` is stripped, so its bare name is `role:x`, and the values `role:x` and `role:role:x` match it.
- "`roleIs` is case-insensitive." It is not: `Source` is not `source`.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `dcfc18b33e9f091cf22d6ae06906839ec5855e67`:

- `src/lib/base/relationDoc.ts` lines 103-112 (`roleIs` with its doc comment) to `src/relationRole.ts`. Verbatim.
- `src/lib/base/relations.ts` lines 63-82 (`RecordRelation`, the interface with its comments) to `src/relationRole.ts`. Code verbatim. Comments made generic: "reverse-lookup" became "the platform's reverse lookup", "(Base reverse-lookup additive field)" became "(an additive field of the platform's reverse lookup)", a leading internal tag was dropped from the `type` comment, and "GilbPlatform sends it" became "The platform sends it".

`src/index.ts` is new. The tests are new: `src/relationRole.test.ts` pins `roleIs` and checks the `RecordRelation` type with `tsc` (including `@ts-expect-error` lines for a missing field).
