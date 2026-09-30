# claim-slot

The slot string that keeps two employments from sharing one claim. The kind is exact.

## What this is

A claim is found by the person, the field, and a slot string. The slot is the only thing that stops two jobs, or two titles inside one job, from landing on one claim.

`employmentCompanySlot(empKey)` returns the employment key unchanged.

`employmentJobTitleSlot(empKey, titleKey)` returns `empKey`, a colon, and `titleKey`.

`employmentKeyFromClaimSlot(kind, slot)` reads an employment key back from a slot that was stored that way.

`profileFieldClaimKindFromType(type)` maps a profile field row's type onto a claim kind.

`isProfileFieldClaimKind` is the seven-kind list.

## What this is not

- Not the writer that saves the claim. The network call stays in the app.
- Not a parser for every slot. Email, phone, social, address, and photo do not use this employment split. Asking this unit for an email slot returns null.
- Not a map from `org` or `title`. Those words are not field-row types. Mapping them here would make the field editor look as if it updated the job. It does not. The job is `company` and `job-title`.
- Not `employment-role`. That unit is the role document (month, place, wire facts). This unit is only the slot address.

## How to take it

Package: `@kaigilb/gilbplatformcode-claim-slot`

```ts
import {
  employmentCompanySlot,
  employmentJobTitleSlot,
  employmentKeyFromClaimSlot,
} from "@kaigilb/gilbplatformcode-claim-slot";

const companySlot = employmentCompanySlot(empKey);
const titleSlot = employmentJobTitleSlot(empKey, titleKey);
const owner = employmentKeyFromClaimSlot("job-title", titleSlot);
```

## What you pass

`empKey` is the employment's own stable key, such as `emp1`. Pass the key you already stored. Do not invent a prettier one at the call site.

`titleKey` is that employment's title key, such as `t0`.

`kind` is one of the seven exact strings. `job-title` contains a hyphen. `jobTitle` is not a kind.

`type` for the field-row map is the row's type, exact: `email`, `phone`, `social`, or `address`.

## What you get

Company slot: the key, including an empty string, including surrounding spaces. No trim. No fallback.

Title slot: the two pieces joined by one colon. `employmentJobTitleSlot("emp1", "t0")` is `emp1:t0`. `employmentJobTitleSlot("", "t0")` is `:t0`. `employmentJobTitleSlot("emp1", "")` is `emp1:`.

Reading back:

- Kind `company`: the slot, or null when the slot is `""`. A colon is kept. `emp1:t0` as a company slot is the key `emp1:t0`. It is not split into a title. If you see a colon on a company slot, the writer used the wrong function.
- Kind `job-title`: the text before the first colon. `emp1:t0` → `emp1`. `emp1:t0:extra` → `emp1`. `emp1:` → `emp1`. `:t0` → null.
- Any other kind: null.

The field-row map returns the same four words, or null. `org`, `title`, `company`, `job-title`, `profile-photo`, `Email`, and `email ` are null.

## Examples

```ts
employmentCompanySlot("emp1");             // "emp1"
employmentJobTitleSlot("emp1", "t0");      // "emp1:t0"
employmentKeyFromClaimSlot("company", "emp1:t0"); // "emp1:t0"  — not split
employmentKeyFromClaimSlot("job-title", "emp1:t0"); // "emp1"
profileFieldClaimKindFromType("org");      // null
profileFieldClaimKindFromType("email");    // "email"
```

## The host must supply

The employment key and the title key. This unit does not mint them. Handles are `claim-handle`.

## Do not

- Do not concatenate `empKey + ":" + titleKey` in a component. A second spelling will not find the claim.
- Do not split a company slot on colon "to be helpful."
- Do not add `org` or `title` to the field-row map. Those rows are not how employment is stored.
- Do not trim. ` emp1 ` and `emp1` are different slots and different claims.

## Wrong readings

- "The colon is a separator the server also splits." No. The slot is one string. Only this read of a `job-title` slot cuts at the first colon, and it does that to recover the employment key.
- "`company` and `org` are the same kind." No.
- "Null from the field-row map means the value is not enforced." No. It means this map is the wrong door.

## Where it was taken from

MyNetBase `src/lib/base/profileFieldClaim.ts`: `PROFILE_FIELD_CLAIM_KINDS`, `isProfileFieldClaimKind`, `profileFieldClaimKindFromType`, `employmentCompanySlot`, `employmentJobTitleSlot`, `employmentKeyFromClaimSlot`. The claim routes and the save stay in the app.
