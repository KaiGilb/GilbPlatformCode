# card-ref

Which row is a card field, and which spellings name the same person.

## What this is

`isCardHandleName(name)` is true when the name starts with one of seven prefixes: `pfc:`, `name-claim:`, `skill-claim:`, `audience-rung:`, `connection-origin:`, `contact-private-note:`, `connection-decline:`.

`isHubRecord(record)` is true when the name is not one of those. A missing name is a hub.

`refKeyVariants(raw, identityOrigin)` lists the spellings of one reference, so a short form can meet an absolute form.

`hubIdentityKeys(record, identityOrigin)` lists the spellings of one person row: its entity address, its id, and the facts `claimSubject`, `principalUri`, and `directReader`.

## What this is not

- Not the drawing of card edges. `units/card-fact-edge` already builds the synthetic relation id. Finding which photo file hangs off a card stays in the app, because that read uses the photo package.
- Not a fetch.
- Not a choice of identity host. You pass `identityOrigin`. This unit does not contain one.

## How to take it

Package: `@kaigilb/gilbplatformcode-card-ref`

```ts
import { hubIdentityKeys, isHubRecord, refKeyVariants } from "@kaigilb/gilbplatformcode-card-ref";

if (isHubRecord(row)) {
  index(hubIdentityKeys(row, identityOrigin));
}
refKeyVariants("base:p/abc", identityOrigin);
```

## What you pass

`name` is the row's `facts.name`. It is not trimmed.

`identityOrigin` is the origin the app uses when it expands a `base:` spelling. No trailing slash unless you mean a double slash. The origin is not trimmed.

`raw` is one reference string. Surrounding spaces are removed. Nothing else is.

A hub record has `id`, optional `entityUri`, and `facts`.

## What you get

`isCardHandleName`:

- `"pfc:phone"` is true. `"pfc"` is false. The colon is required.
- `"PFC:phone"` is false. Case is kept.
- `" pfc:phone"` is false. No trim.
- `undefined`, `null`, and `""` are false.

`isHubRecord` is the opposite of that test on `facts.name`. No name means hub.

`refKeyVariants` returns a new list. Inside one call, duplicates are dropped. Order:

1. The trimmed text, if it is not empty. Blank in, empty list out.
2. If the text starts with `base:`, `identityOrigin + "/base/" + the rest`. `"base:p/abc"` with origin `https://id.example` adds `https://id.example/base/p/abc`. An origin that already ends in `/` adds a double slash. That is not cleaned up.
3. If the text is an absolute address (`scheme://`):
   - `host + path`, trailing slashes removed from the path. The host includes a port when there is one. The address parser lowercases the host. This function does not lowercase the rest.
   - If the path starts with `/base/p/`, also `base:p/` plus the rest of the path.
   - If the path is `/i` or ends with `/i`, also the original text with trailing slashes removed. `/files/i` matches. `/item` does not.

A space in the middle is not an address. The list keeps the trimmed text only. A query stays on the original spelling and is not copied onto the host-and-path spelling.

`hubIdentityKeys` concatenates those lists. The same spelling from the id and from `directReader` appears twice. This function does not dedupe across sources. An empty fact is skipped. A fact of spaces is trimmed by `refKeyVariants` and adds nothing.

## Do not

- Do not hardcode an identity host inside a caller and also pass a different origin here. One origin.
- Do not trim a handle name before calling. A leading space is not a handle, and the row stays a hub.
- Do not split these keys on a colon. A `pfc:` name contains several colons. It is a prefix test, not a parse.
- Do not use this unit to hang a photo. That pairing is still in the app.

## Wrong readings

- "Every row with a claimSubject is a card field." No. A person row also has a claimSubject. The handle test is the name prefix.
- "`base:p/abc` is expanded to whatever host the page is on." No. It is expanded with the origin you pass.
- "One person has one key." No. A hub lists every spelling, and a repeated spelling is listed again.

## Where it came from

GilbApp `src/lib/base/graphCardLinks.ts` — the prefixes, `isCardHandleName`, `isHubRecord`, `refKeyVariants`, `hubIdentityKeys`. The identity host was a fixed string in the app. It is an argument here. `findCardFactPairs` stayed in the app.
