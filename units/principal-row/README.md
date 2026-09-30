# principal-row

The four lines of one access row. A missing name is not the key, and silence is not a fact.

## What this is

`principalRow(uri, entry)` returns the title, the badge, the provenance sentence, the grant key, and an identity page when one was supplied.

`principalLabel` is the title alone.

`principalGrantKey` is the uri alone. It exists so a later edit does not put the page address back into the slot that holds the grant.

`keyNamespace` says whether the path is a group, a principal, a pod, or something else.

## What this is not

- Not the access read. You already have the entry.
- Not `principal-key`. That unit encodes a card key. This unit labels a key you already store.
- Not `principal-mark`. That unit recognises the public grantee. This unit does not.
- Not a place to print the raw uri as the person's name. The title is a name or a sentence. The uri is line `grantKey` only.

## How to take it

Package: `@kaigilb/gilbplatformcode-principal-row`

```ts
import { principalRow } from "@kaigilb/gilbplatformcode-principal-row";

const row = principalRow(storedGranteeUri, entry);
```

Pass the uri that holds the grant. Do not pass the page address in its place.

## What you pass

`uri` — the stored grantee. This function does not trim. A string that is not an absolute URL is namespace `other`. A leading or trailing space is still classified, because the URL parser drops those spaces before it reads the path. A space in the middle is `other`. Do not add your own trim to "fix" the edges, and do not assume a surrounding space means `other`.

`entry` — optional.

- `label` — trimmed. Spaces only do not count.
- `labelSource` — one of `vault-name`, `identity-seat`, `account-email`, `account-email-superseded`. Null or omitted means the register was not stated.
- `webId` — the page, trimmed. Blank becomes null.
- `registered` — true, false, or omitted. Omitted is not false.
- `viewer` — `self`, `earlier-identity-of-self`, or omitted.

Fields this unit does not declare are ignored. There is no second uri on the entry.

## What you get

`grantKey` is the uri argument, character for character.

`identityPage` is the trimmed page, or null.

`badge` is `YOU`, or `YOU — EARLIER IDENTITY` (em dash, U+2014), or null.

Title and provenance, in order:

1. A real label and a source. Title is the trimmed label. Provenance is that source's sentence. The superseded sentence contains an em dash.
2. A real label and no source. Provenance is `Name supplied by BaseID (register not stated)`.
3. No label, and the namespace is `pod`. Title is the host label, or `Vault` if the host label is empty. The host label is the first dotted piece, except when that piece is exactly `id` or exactly `www`: then the title is the whole hostname. `192.0.2.1` becomes `192`, because the first piece is `192`. Do not "correct" an address into the full host. `registered` truthy: `A vault identity registered in BaseID; no reserved name`. Otherwise, including omitted: `Read from the vault's own host — BaseID holds no reserved name for it` (em dash). A pod is never titled `Registered pod`.
4. No label, `registered: true`. Title `Registered group` or `Registered principal`. Namespace `other` uses the word principal. Provenance says an account is held and the name is not published to you.
5. No label, `registered` omitted (no entry counts as omitted). Title `Group key` or `Principal key`. Provenance: `No name was returned for this <kind>. It holds the access below.`
6. No label, `registered: false`. Same title as 5. Provenance says no reserved name, vault, identity seat, or account is held.

## Examples

```ts
keyNamespace("https://h.example/vault"); // "other"  — /vault is not a pod
keyNamespace("https://h.example/base");  // "pod"
keyNamespace("https://h.example/base/g"); // "other" — the slash after g is required
keyNamespace("https://h.example/files/i"); // "pod"  — the path ends in /i

principalRow("https://h.example/base/p/1", {
  label: "Ada",
  labelSource: "account-email",
  webId: "https://ada.example/i",
}).grantKey;
// "https://h.example/base/p/1"  — not the page

principalRow("https://kaizen.example/base").title; // "kaizen"
principalRow("https://id.example/base").title;    // "id.example"
principalRow("https://h.example/base/g/1").title; // "Group key"
principalRow("https://h.example/base/g/1", { registered: false }).provenance;
// mentions "holds no reserved name"
principalRow("https://h.example/base/g/1").provenance;
// "No name was returned…" — different sentence
```

## The host must supply

The stored uri and the entry the server returned. Do not fill `registered: false` when the server left the field out.

## Do not

- Do not show `grantKey` as the title when the title is a sentence. The sentence is the point.
- Do not substitute `webId` for the grant key. Two strings for one party then look like two grantees.
- Do not treat `/vault` as a pod. This function does not. A user-vault root stays `other` and is worded as a principal.
- Do not collapse "field omitted" into "Base holds nothing." Those are branches 5 and 6.

## Wrong readings

- "`/i/` is a pod." No. The path `/i/` does not equal `/i` and does not end with `/i`.
- "A group path without the trailing slash is still a group." No. `/base/g` is `other`. `/base/g/1` is `group`.
- "The badge dash is a hyphen." No. It is an em dash, in the badge and in two provenance sentences.
- "`principalGrantKey` picks the friendliest uri." No. It returns the argument.

## Where it was taken from

GilbApp `src/lib/base/vaultAccess.ts`, `keyNamespace`, `principalRow`, `principalLabel`, and `principalGrantKey`. The access fetch stays in the app.
