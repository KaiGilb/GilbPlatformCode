# history-actor

Who is named on a change, read from the address string alone.

## What this is

- `describeAgent(agent)` → `{ who, whoKind, agentLabel }`
- `agentLabel(agent)` → `describeAgent(agent).agentLabel`

`whoKind` is `person`, `agent`, `system`, or `unknown`.

## What this is not

- Not a person lookup. A person address becomes the word `Person`. The app may replace that later with a published name. This unit does not.
- Not a cache. Each call returns a new object. The app remembers the answer for the session. Do not rely on object identity.
- Not `units/history-value`. That one reads the value that changed.
- Not `units/history-events`. That one groups rows and carries a private copy of this function. Keep the copies in agreement, or pass `describeAgent` into `groupHistoryDatoms`.

## How to take it

Package: `@kaigilb/gilbplatformcode-history-actor`

```ts
import { describeAgent, agentLabel } from "@kaigilb/gilbplatformcode-history-actor";
```

Path: `units/history-actor/`.

## What you pass

The agent string from the change row, or `null`, or `undefined`. It is trimmed. A blank string is the unknown actor.

## What you get

The first match wins. Later patterns are not tried.

1. An agent job. Either `/base/e/agent-` plus a slug, or `agent-` at the start or after a slash. This pattern is case-insensitive. The slug stops at `?` or `#`.
   - `who` is `AI agent · ` plus the slug with `-` and `_` turned into spaces, then three word replacements: a whole word `vabasevedanta` becomes `VA BVedanta`, a whole word `vedanta` becomes `BVedanta`, a whole word `esco` becomes `ESCO`. The replacements ignore case. `vabasevedanta` is replaced before `vedanta`, so it is not replaced twice.
   - `agentLabel` is the raw slug, before the spaces and the word replacements.
   - `myvedanta` does not contain the word `vedanta`. It is left as written. `escort` is not `esco`.
2. A person. `/base/p/` plus an id, case-insensitive. `who` is `Person`. `agentLabel` is `Person`. The id is not in either string.
3. Any other `/base/e/` id. This pattern is **case-sensitive**. `/BASE/E/` does not match.
   - If the id starts with `agent-` or `agent_`, this is the underscore path. `who` is `AI agent · ` plus the slug with `-` and `_` turned into spaces. The three word replacements are **not** applied on this path. `agent_vedanta` stays `vedanta`, not `BVedanta`. `agentLabel` is the slug after the prefix is removed, still with its dashes.
   - Otherwise `who` is `System · ` plus the id. An id longer than 20 characters is cut to 16 plus `…` in `who` only. `agentLabel` is the full id.
   - An id of exactly `agent-` (nothing after the mark) takes this branch and produces `AI agent · ` with an empty slug. The first pattern requires at least one character after `agent-`.
4. Anything else. `who` is `Actor · ` plus the last path segment. `agentLabel` is that segment.

The dot in `AI agent ·` is `·`, not a hyphen and not a bullet.

Blank, `null`, `undefined`, and a whitespace-only string:

| Field | Value |
|---|---|
| `who` | `Unknown actor` |
| `whoKind` | `unknown` |
| `agentLabel` | `unknown` |

## Examples

```ts
describeAgent(null);
// { who: "Unknown actor", whoKind: "unknown", agentLabel: "unknown" }

describeAgent("http://example.test/base/e/agent-VABaseVedanta");
// who: "AI agent · VA BVedanta"
// agentLabel: "VABaseVedanta"

describeAgent("http://example.test/base/e/agent_vedanta");
// who: "AI agent · vedanta"   — no BVedanta replacement on this path

describeAgent("http://example.test/base/p/abc?x=1");
// { who: "Person", whoKind: "person", agentLabel: "Person" }

describeAgent("http://example.test/BASE/E/short-id");
// Actor, not System. The entity test is case-sensitive.
```

## What the host must supply

The address string the change row carried. A person's published name, if you want one, comes from your own read. Put it on the screen after this call. Do not expect this function to change its answer on a second call.

## Do not

- Do not show `agentLabel` as the sentence. The sentence is `who`. The badge is the raw slug.
- Do not run the vedanta and ESCO replacements on the underscore path. The hyphen path is the only one that has them.
- Do not treat `/BASE/E/<id>` as a system record.
- Do not put the person id in the line. The line says `Person` until a later lookup replaces it.
- Do not truncate `agentLabel` when `who` is truncated. The cut is only in the sentence, and only past 20 characters, to 16 plus `…`.

## Wrong readings

- "Person means the name was looked up." It means the address was a person principal. The name was not.
- "Every agent id is prettified the same way." `agent-` is. `agent_` is only spaced.
- "The second call returns the same object." It returns an equal object. Not the same one.

## Where it came from

GilbApp `src/lib/base/ontologyHistory.ts`, `describeAgent` and `agentLabel`. The session cache and the person-name fetch are not in this unit.
