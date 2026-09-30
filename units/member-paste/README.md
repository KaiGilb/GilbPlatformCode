# member-paste

Splits a paste box of members into entries. It does not decide who is a person.

## What this is

`parseMemberInputs` splits on whitespace, comma, and semicolon. A comma splits even when there is no space after it. `a,b` is two entries.

Each piece is trimmed. Empty pieces are dropped. Duplicates are dropped by `toLocaleLowerCase()` with no locale, so the machine's locale applies. The first spelling is kept: `Ada ada ADA` is `["Ada"]`. There is no NFC pass. There is no cap. A dot is not a separator. `one.two` is one entry.

## What this is not

- Not the direct-share split. Direct shares keep `a,b` as one entry, because that split is comma-plus-whitespace, not a bare comma. Do not swap the two. A member box that used the share split would glue `a,b` into one name and then fail to add either person.
- Not a person test. After this list, the app keeps an entry only when `person-address` says it is already a principal (`isResolvedPrincipalUri`) or it looks like a person address (`looksLikePersonAddress`). Compose those yourself. This package does not import them, so a change to one cannot silently change the other.
- Not a drop for a named vault. An address that ends in `/base` can be a principal. It must survive this split. Do not put a 36-character hex test in front of this list. That test drops named vaults before any request is sent, and the failure then has nothing on the wire.
- Not a grant, and not a fetch.

## How to take it

Package: `@kaigilb/gilbplatformcode-member-paste`

```ts
import { parseMemberInputs } from "@kaigilb/gilbplatformcode-member-paste";
import { isResolvedPrincipalUri, looksLikePersonAddress } from "@kaigilb/gilbplatformcode-person-address";

const entries = parseMemberInputs(raw).filter(
  (entry) => isResolvedPrincipalUri(entry) || looksLikePersonAddress(entry),
);
```

The filter is the app's filter. It is not inside this function. Bare names stay in `parseMemberInputs` so the screen can say they were not added. Dropping them inside the split would look the same as a blank box.

Path: `units/member-paste/`.

## Examples

```ts
parseMemberInputs("a,b; c\nd"); // ["a", "b", "c", "d"]
parseMemberInputs("  a,, ; b  "); // ["a", "b"]
parseMemberInputs("Ada ada"); // ["Ada"]
parseMemberInputs("one.two"); // ["one.two"]
parseMemberInputs(""); // []
```

## What the host must supply

The raw box. The person-address checks, if you are about to grant. A message for the names you filtered out. This function will not produce that message.

## Do not

- Do not require a space after the comma.
- Do not lowercase the kept spelling.
- Do not NFC the box to match `search-tokens`. This split does not normalise.
- Do not treat the result as a list of people.

## Wrong readings

- "`a,b` is one member." Not here. It is two.
- "Duplicates keep the lower-case form." They keep the first form.
- "An entry that survives this function can be granted." Survival means it was non-empty and not a duplicate. Person, group, and unknown name are still mixed together.

## Where it came from

MyNetBase `parseMemberInputs` in `src/lib/base/orgMembers.ts`. The grant filter in that file is the `person-address` composition shown above, not a second copy of those predicates.
