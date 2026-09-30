# instruction-prefix

Finds a token written at the front of an instruction sentence. It does not decide that the token is the step's tag.

## What this is

`liftInstructionPrefix(instruction)` returns `{ tag, body }` or null.

The separator is `INSTRUCTION_PREFIX_SEPARATOR`: a space, an em dash (U+2014), and a space. In source that is `" \u2014 "`.

A hyphen-minus (` - `) does not match. An en dash (U+2013) does not match. The role date line (`role-when`) uses an en dash. This separator is the other dash. Do not make them the same character.

The token must contain no whitespace, and must not start with `[[`. The separator must not be at the start of the string (`sep` index 0 is a reject).

```ts
liftInstructionPrefix("ProcVdcStProc — body with [[link]]");
// { tag: "ProcVdcStProc", body: "body with [[link]]" }

liftInstructionPrefix("has space — body"); // null
liftInstructionPrefix("[[Proc]] — body");  // null
liftInstructionPrefix("Token - body");     // null  (hyphen, not em dash)
liftInstructionPrefix(" — body");          // null  (nothing before the separator)
```

## What this is not

- Not permission to show `tag` in a pill.
- Not the step editor. The editor (`prefillStepEdit` in the app) uses this shape and then throws the result away unless a real carrier is present and equal to the token.
- Not a save. Nothing is written.

## How to take it

Package: `@kaigilb/gilbplatformcode-instruction-prefix`

```ts
import { liftInstructionPrefix, INSTRUCTION_PREFIX_SEPARATOR } from "@kaigilb/gilbplatformcode-instruction-prefix";
```

Path: `units/instruction-prefix/`.

The viewer that also strips handoff links is `step-instruction`. Use that when you are drawing the step. Use this when you only need to see whether the sentence has the token shape.

## What the host must supply

The tag stored on the record, if you are about to hide the token.

Law the app follows, which this function deliberately does not apply:

1. No stored tag (`unitTag` / `a:unitTag` absent or blank) → the pill is empty, and the sentence stays whole, token included. Do not call this and then display `tag`.
2. Stored tag equals `tag` from this function → the pill is the stored tag, and the sentence may become `body`.
3. Stored tag differs → the pill is the stored tag, and the sentence stays whole. The token in the sentence is not a second tag.

A bare `tag` field on the record is not the carrier. Do not treat it as one.

## Do not

- Do not replace the em dash with a hyphen or an en dash. Existing sentences will stop matching, and new ones will not match the app.
- Do not trim the token. A token with a space is rejected on purpose.
- Do not treat null as "the step has no text". Null means the prefix shape was not there. The text is still the original string.

## Wrong readings

- "`tag` in the result is the ontology tag." It is the characters before the separator. The ontology tag is whatever the record stored.
- "A missing separator means the body is empty." No. You keep the whole instruction.

## Where it came from

GilbApp `src/lib/base/processTypes.ts`, `liftInstructionPrefix`. The separator constant was private there; it is exported here so a caller does not guess the character.
