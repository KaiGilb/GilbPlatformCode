# ref-keys

Two jobs that get mixed up on a profile card.

1. Tell a card field (phone, skill, a note) from the person row.
2. Treat `base:p/<id>` and the absolute principal address as the same person, so a fact written in the short form still meets the row written in the long form.

It also builds the synthetic id the graph uses for that fact-edge, and a short label for it.

## What this is

| Export | Role |
|---|---|
| `CARD_HANDLE_PREFIXES` | The seven prefixes GilbApp uses. A name that starts with one is a card field. |
| `isCardHandleName` | True only for those prefixes. Case-sensitive. Empty and missing are false. |
| `isHubRecord` | True when `facts.name` is not a handle. A missing name is a hub. `label` is not read. |
| `refKeyVariants` | The other strings that mean the same id. |
| `cardFactRelationUri` | `fact:<slug>:<sourceId>:<targetId>`. Not an address. Not stored. |
| `cardFactEdgeLabel` | A word for that id. `undefined` if it does not start with `fact:`. |
| `CARD_POINTER_SLUGS` | `claimSubject`, `heldParty`. Names only. This unit does not walk them. |
| `CARD_HUB_IDENTITY_SLUGS` | `claimSubject`, `principalUri`, `directReader`. Names only. |
| `CARD_PHOTO_SLUG` | `profilePhoto`. A label. Not the only spelling a photo uses. |

## What this is not

- Not the walker that hangs the phone off the person. That walker also reads the photo file id from another package. It stays in the app. These helpers are the pieces that walker calls.
- Not an origin. `refKeyVariants` will not expand `base:` unless you pass `identityOrigin`. There is no default host in this folder.
- Not a photo reader. `CARD_PHOTO_SLUG` is the canonical name for a label. Records also store the photo under older names. Reading only this name hides those.

## How to take it

Package: `@kaigilb/gilbplatformcode-ref-keys`

```ts
import { isCardHandleName, refKeyVariants, cardFactEdgeLabel } from "@kaigilb/gilbplatformcode-ref-keys";
```

Path: `units/ref-keys/`.

## Handle prefixes

Exactly these, in this order: `pfc:`, `name-claim:`, `skill-claim:`, `audience-rung:`, `connection-origin:`, `contact-private-note:`, `connection-decline:`.

`PFC:` does not match. A plain personal name does not match, so that row is the person (`isHubRecord`). A row with no `name` is also the person, even if `label` looks like a handle.

If your app uses a different prefix, do not add it here and do not call `isCardHandleName`. Compare your own list. Adding a prefix in this unit would reclassify rows in every app that imported it.

## `refKeyVariants`

```ts
refKeyVariants("base:p/abc");
// ["base:p/abc"]     — no origin, no expansion

refKeyVariants("base:p/abc", "https://id.example.test");
// includes "https://id.example.test/base/p/abc"
```

`identityOrigin` is the origin only. Do not include `/base`. A trailing slash is removed. If you pass `https://id.example.test/base`, the result contains `…/base/base/p/abc`. That doubled segment is wrong. The app passes the origin it was configured with, not a vault address.

For an absolute URL (scheme, then `://`):

| Added | Example for `https://id.example.test/base/p/abc` |
|---|---|
| the trimmed input | `https://id.example.test/base/p/abc` |
| host + path, no scheme, no trailing slash | `id.example.test/base/p/abc` |
| `base:p/<rest>` when the path starts with `/base/p/` | `base:p/abc` |

A path that is `/i` or merely ends with `/i` also adds the input with trailing slashes removed. `/base/p/i` ends with `/i`, so it gets that extra form. That breadth is intentional; do not narrow it to "the WebID path only".

A blank string returns `[]`, not `[""]`. A string that looks like a URL but does not parse stays as the trimmed input only.

Order is first-seen. A `Set` drops duplicates.

## Edge label

```ts
cardFactRelationUri({ sourceId: "phone", targetId: "person", slug: "claimSubject" });
// "fact:claimSubject:phone:person"

cardFactEdgeLabel("fact:claimSubject:phone:person"); // "about"
cardFactEdgeLabel("fact:heldParty:a:b");            // "held-party"
cardFactEdgeLabel("fact:profilePhoto:a:b");         // "profile-photo"
cardFactEdgeLabel("fact:member-of:a:b");            // "member-of"  (unknown slug, returned as itself)
cardFactEdgeLabel("relation:other");                // undefined
cardFactEdgeLabel("fact:");                         // ""
```

`undefined` means "not a fact edge". `""` means "it was a fact edge and the slug was empty". A check of `if (!label)` treats both as missing. Use that only when both should hide the verb. Use `label === undefined` when you need to know it was some other relation.

Only the piece between `fact:` and the next `:` is the slug. The source and target ids are not part of the label.

## What the host must supply

The identity origin, if you need `base:p/…` to meet an absolute principal. This folder does not know which host that is. Pass the same origin the app used when it expanded `base:` before. Omit it and short forms match only other short forms.

## Do not

- Do not hard-code a host inside the call. Pass it.
- Do not use `CARD_PHOTO_SLUG` as the only key you read.
- Do not store `cardFactRelationUri`. It is a drawing id. The facts on the records are the real link.

## Wrong readings

- "Not a handle, so it must be a person." It means the name did not start with one of the seven prefixes. A note with an ordinary title is a hub by this test.
- "I passed a vault address as the origin." Then `/base` is in it twice. Pass the origin only.

## Where it came from

GilbApp `src/lib/base/graphCardLinks.ts`: `CARD_HANDLE_PREFIXES`, `isCardHandleName`, `isHubRecord`, `refKeyVariants`, `cardFactRelationUri`, `cardFactEdgeLabel`, and the slug constants. The absolute expansion no longer names a fixed host; the caller passes `identityOrigin`. The pair walker that uses these helpers stays in the app, because it also reads a photo file id from elsewhere.
