# group-vault

Whether a vault is a group, and the word for what it represents. The type addresses are passed in.

## What this is

You pass three full type addresses: organization, project, and person. Comparison is exact. This unit does not know the addresses, and it does not contain a host.

`vaultRepresentsLabel(uri, kinds)` returns `Organization`, `Project`, or `Person` when `uri` is exactly one of those addresses. Otherwise it returns the last slash segment. Null, undefined, and `""` return null.

`isOrgOrProjectVault(vault, kinds)` is true when `represents` is exactly the organization address or the project address.

`isGroupVault(vault, kinds)` is the list a member should see as groups.

`writableParentVaults(vaults)` keeps rows that have `write` in `modes` and a truthy `@id`.

## What this is not

- Not a mint. Creating a vault stays in the app.
- Not the tree order and not the session's writable default. Those are `vault-list`.
- Not a tail comparison. The letters `Person` at the end of a different address are not the person address you passed.

## How to take it

Package: `@kaigilb/gilbplatformcode-group-vault`

```ts
import { isGroupVault, vaultRepresentsLabel, writableParentVaults } from "@kaigilb/gilbplatformcode-group-vault";

const kinds = {
  organization: organizationTypeUri,
  project: projectTypeUri,
  person: personTypeUri,
};
const groups = vaults.filter((vault) => isGroupVault(vault, kinds));
```

Pass the same object to the label and to the group check. Two different objects will disagree.

## What you pass

`kinds` is the three addresses the vault stored, full strings.

A group row has `represents`, `isLandingVault`, `name`, and `modes`. `modes` is required. A parent row needs `modes` and `@id`.

## What you get

The label:

- The three words, only for an exact address.
- Otherwise the last segment, not decoded and not trimmed. `"  Custom  "` stays `"  Custom  "` when it contains no slash.
- A blank last segment (the uri ends in `/`) returns the uri unchanged.
- Do not use the word as a type check. Another host can end in `Person`.

The group check, in this order:

1. Organization or project. True, even with no `read` mode, and even when it is the landing vault.
2. Represents exactly the person address. False.
3. `isLandingVault === true`. False. Any other value is not landing. This is stricter than `vault-row`, which treats any truthy flag as landing.
4. Otherwise true only when the trimmed name is non-empty and `modes` contains the element `read`. `write` alone is not enough. `Read` is not `read`.

Parents: order kept, not sorted. `@id` of `""` is dropped. `@id` of `" "` is kept, because it is not trimmed. A missing `@id` is dropped. The group rules are not applied.

## Examples

```ts
isGroupVault(
  { represents: kinds.organization, isLandingVault: true, name: "", modes: [] },
  kinds,
) === true;

isGroupVault({ represents: kinds.person, name: "Kai", modes: ["read"] }, kinds) === false;

isGroupVault({ name: "Fortnight", modes: ["read"] }, kinds) === true;

isGroupVault({ name: "Fortnight", modes: ["write"] }, kinds) === false;
```

A person address you did not pass, on a named vault with `read`, is a group. Pass the address the vault stored or that seat is listed.

## The host must supply

The three type addresses, from the vocabulary the app already uses. Do not hardcode a host inside this call's library code. The app holds the addresses.

## Do not

- Do not compare by the last segment.
- Do not require `read` on a typed organization. The type check is first.
- Do not treat the landing flag the way `vault-row` does. Here only `true` counts.
- Do not sort the parent list.

## Wrong readings

- "A group must be readable." A typed organization is a group even when this session cannot read it. An untyped name is a group only with `read`.
- "The landing vault is never a group." A landing organization is still a group.
- "A whitespace id is blank." It is not trimmed, so it is kept as a parent.

## Where it was taken from

MyNetBase `src/lib/base/createNamedVault.ts`, `vaultRepresentsLabel`, `isOrgOrProjectVault`, `isGroupVault`, and `writableParentVaults`. The three type address constants stay in the app. The mint stays in the app.
