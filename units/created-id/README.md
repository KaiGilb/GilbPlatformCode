# created-id

The id of a step that was minted, when the list did not confirm that the step joined.

A create can succeed at minting a record and still fail the check that the record is in this process's ordered list. The failure has to carry the id. A refusal that never minted anything has no id. Showing an invented id, or hiding a real one, are both wrong.

## What this is

`StepCreatedNotConfirmedError` has:

- `createdId` — whatever the create answered. An empty string is allowed. It means the success answer named no id. Do not replace it with a guess.
- `linkState` — `"not-linked"` when the list was read and the id was not in it, or `"unverified"` when that read failed. Unknown is not proof the step is an orphan. This unit does not delete anything.
- `message` — the sentence you pass in. This unit does not write the sentence.

`createdStepIdOf(error)` returns `createdId` when `error` is that class. Otherwise null.

## What this is not

- Not the create call. The host still posts the step. `step-order` builds the facts for a new step. This unit only names the id after a confirmation failure.
- Not a general "read createdId off any object". A plain object, or a different error, with a `createdId` field returns null. The class is the test. A lookalike from another realm also returns null, because `instanceof` does not cross realms.

## How to take it

Package: `@kaigilb/gilbplatformcode-created-id`

```ts
import { StepCreatedNotConfirmedError, createdStepIdOf } from "@kaigilb/gilbplatformcode-created-id";
```

Path: `units/created-id/`.

Throw `new StepCreatedNotConfirmedError(id, linkState, message)` from the host's create path. The panel reads `createdStepIdOf`. It does not sniff the message for an id.

## What you pass

The thrown value, as `unknown`. You do not need to narrow it first.

## What you get

A string, which may be empty, or null.

Null means this failure did not mint a record, or it was not this error. A 403 on the create itself is null. Do not show an id in that case.

An empty string means this error was thrown and the create answer did not include an id. The panel should not quote an id. It also should not treat the failure as "nothing was minted" solely because the string is empty. The class was thrown. The id is blank.

`linkState` is not returned by `createdStepIdOf`. Read it on the error when the panel must distinguish "the list omitted it" from "the list could not be read".

## Examples

```ts
createdStepIdOf(new StepCreatedNotConfirmedError("abc", "not-linked", "missing"));
// "abc"

createdStepIdOf(new StepCreatedNotConfirmedError("", "unverified", "unread"));
// ""

createdStepIdOf(new Error("nope"));
// null

createdStepIdOf({ createdId: "abc" });
// null
```

## What the host must supply

The create, the follow-up read of the list, and the decision to throw this class only after a record was minted. A transport failure before any id exists throws a different error.

## Do not

- Do not parse the message to find the id.
- Do not treat null and `""` as the same. Null is "not this error". `""` is "this error, and no id was sent".
- Do not delete the minted record because `linkState` is `"unverified"`. The read failed. That is not a confirmed orphan.

## Wrong readings

- "Any error with a createdId field counts." Only this class.
- "Empty createdId means show nothing and move on as if the create never happened." The record may exist. The id is simply not in the answer. Say that the confirmation failed, and do not invent the id.

## Where it came from

GilbApp `src/lib/base/processHooks.ts`, `StepCreatedNotConfirmedError` and `createdStepIdOf`. The create and the verify read stay in the app.
