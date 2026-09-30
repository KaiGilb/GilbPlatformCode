# person-ruling-key

One storage key for a server's ruling about a principal, and the admit rule once you have looked that ruling up.

## What this is

`personRulingKey(principal)` is the key to store and read under.

- Trim first. A blank trims to `""`. Do not store under `""`.
- A value that is not an address is returned trimmed, and not lowercased.
- For an address: the host is lowercased, one trailing slash is removed from the path, the fragment is dropped, the userinfo is dropped, and the search is kept.
- The path's letter case is kept. `/Base` and `/base` are two keys.
- A root with and without a slash is the same key: both become `https://host.example.test` with no trailing slash.
- Only one slash is removed. `/base//` becomes `/base/`.
- A default port is dropped by the address parser (`:443` on https, `:80` on http). Any other port stays.
- The scheme stays, so `http` and `https` are two keys.

`admitAsPerson(principal, ruling)` is true unless `ruling` is exactly `"not-a-person"`. A null ruling is true. That is deliberate: a missing ruling must not hide a person. A blank principal is false even when the ruling is null.

This function does not look the ruling up. You look it up under `personRulingKey(principal)`, then pass what you found.

## What this is not

- Not a decision that a path shape is a person. `/base` is both a person's vault and a group's vault. The server says which. This unit only stops two spellings of one address from being stored as two rulings.
- Not the store. The app keeps an in-memory map and a `localStorage` copy. Those stay in the app. Pass the ruling you read back.
- Not the write-check folding in `record-write`. That one lowercases the whole string, path included. This one does not. A ruling stored under this key will miss if you look it up with the other folding.

## How to take it

Package: `@kaigilb/gilbplatformcode-person-ruling-key`

```ts
import { admitAsPerson, personRulingKey } from "@kaigilb/gilbplatformcode-person-ruling-key";

const key = personRulingKey(principal);
if (!key) return false;
const ruling = store.get(key) ?? null;
return admitAsPerson(principal, ruling);
```

Path: `units/person-ruling-key/`.

`PersonRuling` is `"person"` or `"not-a-person"`. Do not store any other word. On read, the app ignores a stored value that is neither word and treats it as no ruling. Do that before you call `admitAsPerson`. If you pass a garbage string by casting, it is not `"not-a-person"`, so admit returns true.

## Examples

```ts
personRulingKey("https://Person.Example.TEST/Base/");
// "https://person.example.test/Base"

personRulingKey("https://person.example.test/base?q=1#h");
// "https://person.example.test/base?q=1"

personRulingKey("https://user:name@person.example.test/base");
// "https://person.example.test/base"

personRulingKey("  not a url  "); // "not a url"
personRulingKey("   "); // ""

admitAsPerson("https://person.example.test/base", null); // true
admitAsPerson("https://person.example.test/base", "not-a-person"); // false
admitAsPerson("   ", null); // false
```

## What the host must supply

The principal string, and the ruling you previously stored under this key. Write the ruling only when the server has said `person` or `not-a-person`. Do not write a ruling from a path check.

## Do not

- Do not lowercase the path to make `/Base` and `/base` collide. They are different principals.
- Do not fail closed when the key is absent. Absence is true, once the principal itself is non-blank.
- Do not drop the search. `?q=1` is part of the key. The fragment is not.
- Do not use this key as the write-check identity. See `record-write`.

## Wrong readings

- "True means the server said this is a person." True also means the server has not said. Only false means the server said not a person.
- "The key is a display name." It is not. Never show it as a name. It can be the raw address.
- "A trailing slash always matters." One trailing slash is removed. A second one stays. The root slash is removed entirely, so the root has no slash in the key.

## Where it came from

MyNetBase `rulingKey` and `admitAsPerson` in `src/lib/base/personRuling.ts`. The memory map and `localStorage` stay in the app.
