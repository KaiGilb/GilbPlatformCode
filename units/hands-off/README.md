# hands-off

Links from one record to other records. Read every link. Write the whole list, or do not write the field. A short name with a colon is not saved as a link.

## What this is

A pure planner. You pass the value the vault already returned, and the list the editor is holding. You get the value to write, or `null` when the list did not change, or a throw when a write would lose or mis-point a link. Nothing is fetched.

### Reading

`readHandsOffTo(value)` accepts:

- nothing (`null` or `undefined`) → no links
- one `{ "@id": "…" }` or one string
- an array of those

Empty strings are skipped. The same link twice is kept once, first wins. A member that is not a string and not an `{ "@id": string }` (a number, a nested array, an object with no string `@id`) increments `unreadable` and is not dropped silently. `unreadable` above 0 means a later save must refuse, because rewriting the field would delete that member.

`servedHandsOffTo(doc)` reads the field under three names, in order: `handsOffTo`, then `hands-off-to`, then `a:handsOffTo`. A present camelCase value blocks the later names, including `""`. `null` falls through.

### What counts as the same link

`handsOffLinkKey(host, link)` is the identity.

- A full `http://` or `https://` address is itself.
- A bare id (`left`, no slash, no colon) is joined onto the holding record's address, replacing the last segment. Holder `https://example.test/base/e/holder` plus `left` is `https://example.test/base/e/left`.
- Anything else is unknown, and the key is the text itself.

Unknown means: a colon-prefix such as `base:e/x` or `t:X`, or any non-http text that contains `/` such as `e/x`. A bare id is not unknown.

Two full addresses on different hosts are different links even when the last segment is the same. `https://example.test/base/e/left` and `https://other.example.test/base/e/left` are not the same link. Removing by the last segment removes a link nobody asked to remove.

### Writing

`handsOffToWireValue(ids)`:

- `[]` → `null` (clear)
- one id → `{ "@id": id }` (not a one-element array)
- two or more → an array of `{ "@id" }`, in order

`planHandsOffToSave(host, served, input)`:

- The editor list matches the served list, by identity, in the same order → `null`. Omit the field. Do not send an "unchanged" write. A bare id and the full address of that same holder count as the same link, so a save that did not touch it stays `null`.
- `served.unreadable > 0` → throws `HandsOffToUnreadableError` before any other work.
- Any link whose key is an unknown address, kept or added → throws `HandsOffToUnknownAddressError`.
- Otherwise `{ write, added }`. `write` is the whole list. A kept link is the served text, not a rewritten one. An added bare id is resolved to a full address. `added` is only the new ones.

`addHandoffLink`, `removeHandoffLink`, and `handoffLinksToSave` edit the editor's list by the same identity. They return a copy. `handoffLinksToSave` includes a link still typed in the add box, so a draft is not dropped on save. A blank draft adds nothing.

## What this is not

- Not the step-patch builder. Tag freeze, instruction text, and the merge-patch object stay in the app. Call `planHandsOffToSave`, and put `write` on the patch yourself when the plan is non-null.
- Not a lookup of the target. `added` is the list a host may verify. This package does not verify.
- Not a guess for `base:e/x`. That form is refused. The document does not say which host the short name stands for. Writing it would store the text, or point it at the wrong record.

## How to take it

Package: `@kaigilb/gilbplatformcode-hands-off`

```ts
import {
  servedHandsOffTo,
  planHandsOffToSave,
  handsOffToWireValue,
  HandsOffToUnknownAddressError,
  HandsOffToUnreadableError,
} from "@kaigilb/gilbplatformcode-hands-off";
```

Path: `units/hands-off/`.

The holder you pass as `host` is `{ "@id": <the record that holds the links> }`. For the editor helpers, pass that same address as `hostUri`.

## Examples

```ts
const host = { "@id": "https://example.test/base/e/holder" };
const left = "https://example.test/base/e/left";

readHandsOffTo([{ "@id": left }, { "@id": left }, 4]);
// { ids: [left], unreadable: 1 }

planHandsOffToSave(host, { ids: [left], unreadable: 0 }, [left]);
// null — unchanged

planHandsOffToSave(host, { ids: ["left"], unreadable: 0 }, [left]);
// null — the bare id and the full address are the same link

planHandsOffToSave(host, { ids: [left], unreadable: 0 }, [left, "other"]);
// write: [left, "https://example.test/base/e/other"]
// added: ["https://example.test/base/e/other"]

handsOffToWireValue([left]);
// { "@id": left }     not an array

// planHandsOffToSave(host, { ids: [], unreadable: 0 }, ["base:e/x"])
// throws HandsOffToUnknownAddressError

removeHandoffLink(host["@id"], [left, "https://other.example.test/base/e/left"], left);
// the other host stays
```

## Do not

- Do not write one `{ "@id" }` when the list has two links. The second link is deleted.
- Do not send the field when the plan is `null`. Omitting it keeps the stored value. Sending a rebuilt list can change bytes the person did not edit.
- Do not remove every link that shares a tail.
- Do not catch the unknown-address error and store the text anyway.
- Do not treat `unreadable: 0` plus an empty `ids` as "I may overwrite". That part is fine. `unreadable` above 0 is the stop, even if some links did parse.

## Wrong readings

- "`null` from the plan means there are no links." It means the editor list is the served list. Clear the links by planning an empty input against a non-empty served list. That returns a plan whose `write` is empty, and `handsOffToWireValue([])` is `null`, which is the clear. Those two nulls are different. The plan's `null` means omit. The wire `null` means clear. Use the plan's `null` before you ever call the wire helper.
- "A `base:` short name is this vault." It is not resolved. It is refused.
- "The same tail is the same record." Only a bare id is joined onto this holder. A full address on another host is a different record.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`: the read, the wire value, `resolveHandsOffToUri`, `handsOffLinkKey`, `planHandsOffToSave`, and the add/remove helpers. The step patch that calls the plan was not copied.
