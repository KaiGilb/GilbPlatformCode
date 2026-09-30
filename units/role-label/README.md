# role-label

A role token shown with spaces and one capital letter. An empty role is the word `Member`.

## What this is

`roleLabel(role)` changes spelling only. `worksFor` becomes `Works for`. `assigned_to` becomes `Assigned to`. `role:member` becomes `Member`.

The prefix `role:` is removed only when those exact lowercase characters sit at the start. `ROLE:` is not a prefix. It becomes `Role:member`.

The rest is lowercased, then the first character is capitalised. It is not title case. `Assigned to` does not capitalise `to`. `XMLParser` becomes `Xmlparser`, because there is no lowercase letter for the camel-case split to catch, and then the whole word is lowercased.

## What this is not

- Not a translation, and not a list of known roles. An unknown token is still spaced and capitalised. It is not dropped and not replaced with `Member` unless it is empty.
- Not a writer. Do not save the spaced form back as the role. The stored token stays `worksFor`.

## How to take it

Package: `@kaigilb/gilbplatformcode-role-label`

```ts
import { roleLabel } from "@kaigilb/gilbplatformcode-role-label";
```

Path: `units/role-label/`.

## Examples

```ts
roleLabel("worksFor");     // "Works for"
roleLabel("assigned_to");  // "Assigned to"
roleLabel("role:member");  // "Member"
roleLabel("");             // "Member"
roleLabel("ROLE:member");  // "Role:member"
roleLabel("XMLParser");    // "Xmlparser"
```

## Do not

- Do not treat `Member` as "the vault said member". It also means the role was empty. If you need to tell those apart, check the stored role before calling.
- Do not title-case the result again. `Works for` would become `Works For` and no longer match this function.

## Where it came from

GilbApp `src/lib/base/relations.ts`, `roleLabel`.
