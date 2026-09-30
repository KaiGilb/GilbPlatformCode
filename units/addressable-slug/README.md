# addressable-slug

Whether a served key is a slug this app can prefix with `a:`. A foreign predicate is not one.

## What this is

Two functions.

`attrKey(slug)` returns `a:` plus the slug, with no other change.

`isAppAddressableSlug(slug)` says whether that prefix would still name the attribute the vault served.

## What this is not

- Not a check that the slug exists in an ontology. A slug can pass this test and still be unknown to the type system. This only says the app's own `a:` prefix round-trips.
- Not a reader of record facts. You already have the key.
- Not a reason to hide a fact. False means "do not render, edit, or retract this as one of our fields." The fact is still on the record.
- Not a normaliser. Neither function trims, lowercases, or strips a prefix you already added.

## How to take it

Package: `@kaigilb/gilbplatformcode-addressable-slug`

```ts
import { attrKey, isAppAddressableSlug } from "@kaigilb/gilbplatformcode-addressable-slug";

if (isAppAddressableSlug(slug)) {
  write(attrKey(slug), value);
}
```

## What you pass

`slug` is the bare name, such as `name` or `jobTitle`. It is not `a:name`, not `owl:sameAs`, and not an address.

## What you get

`attrKey("name")` is `a:name`.

`attrKey` does not look at the slug. `attrKey("a:name")` is `a:a:name`. `attrKey("")` is `a:`. `attrKey(" name")` is `a: name`.

`isAppAddressableSlug` is true only when the slug matches this shape: one ASCII letter, then up to 63 more characters, each an ASCII letter, a digit, `_`, or `-`. The whole slug is 1 to 64 characters.

## Examples

```ts
isAppAddressableSlug("name");       // true
isAppAddressableSlug("a-b_c");      // true
isAppAddressableSlug("a" + "b".repeat(63)); // true, 64 characters
isAppAddressableSlug("a" + "b".repeat(64)); // false, 65 characters
isAppAddressableSlug("");           // false
isAppAddressableSlug("9abc");       // false, leading digit
isAppAddressableSlug("owl:sameAs"); // false, a CURIE
isAppAddressableSlug("role:source"); // false
isAppAddressableSlug("Å");          // false, not A–Z
isAppAddressableSlug("name ");      // false, the space is not trimmed
```

## The host must supply

Nothing. There is no list of legal ontology slugs here. If you need that list, it stays in the app that owns the type registry.

## Do not

- Do not prefix a key that failed the test. `a:` plus a foreign predicate is a different attribute from the one you read.
- Do not treat false as "the field is empty." Not-understood is not the same as not-there.
- Do not trim inside a caller and then assume this function also trims. It does not. Trim yourself before the test if the wire can carry spaces, and know that you changed the slug.
- Do not use `attrKey` on a value that already starts with `a:`.

## Wrong readings

- "Any CURIE is addressable." No. A colon fails the test.
- "A 64-character slug is too long." No. 64 is still true. 65 is false.
- "Unicode letters count." No. Only A–Z and a–z.

## Where it was taken from

GilbApp `src/lib/base/recordTypes.ts`, `attrKey` and `isAppAddressableSlug`. The function that builds an absolute type address is not in this unit. That one needs the host, and it is `type-spell`.
