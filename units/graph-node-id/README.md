# graph-node-id

Stable ids for a relation node and a pendant node. A record id must not collide with either.

## What this is

`relationNodeId(relationUri)` returns `rel:` plus the relation address, unchanged.

`pendantNodeId(recordId, relationUri)` returns `pend:` plus the record id, plus `:`, plus the relation address. All unchanged.

Record nodes stay on the bare record id. That is not a function in this unit. Do not prefix record nodes.

## What this is not

- Not the graph. Counting members, drawing an edge, and deciding that the far end is unreadable stay in the app. `graph-layout` places nodes that already have ids. `graph-contract` says which gestures exist. Neither mints these ids.
- Not a parser. The strings are opaque. A relation address contains colons. Splitting on `:` drops the scheme and can split a record id.
- Not a check that the address is real. Empty inputs are still prefixed.

## How to take it

Package: `@kaigilb/gilbplatformcode-graph-node-id`

```ts
import { pendantNodeId, relationNodeId } from "@kaigilb/gilbplatformcode-graph-node-id";

const relationNode = relationNodeId(relationUri);
const pendantNode = pendantNodeId(recordId, relationUri);
```

Use the same two functions everywhere a node id is created or compared. A second spelling of the prefix is a second node.

## What you pass

`relationUri` is the relation's own address, as stored. Not the tail, unless the tail is what you already use as the identity everywhere else. This function will not make those agree for you.

`recordId` is the record id you already use for the record node. Not a prefixed id.

## What you get

A string. No trim, no encode, no lowercase.

`relationNodeId("")` is `rel:`.

`pendantNodeId("", "")` is `pend::`.

`relationNodeId(" https://vault.example/base/r/a ")` keeps the spaces.

## Examples

```ts
relationNodeId("https://vault.example/base/r/abc");
// "rel:https://vault.example/base/r/abc"

pendantNodeId("rec1", "https://vault.example/base/r/abc");
// "pend:rec1:https://vault.example/base/r/abc"
```

The record node for `rec1` is the string `rec1`. It is not `rel:rec1` and not `pend:rec1:…`.

## The host must supply

The record id and the relation address. The rule for when a relation becomes a node (more than two members in the set) or a pendant (one member in the set) stays in the app.

## Do not

- Do not prefix the record node with `rel:` or `pend:`. A click that selects by node id would miss the record.
- Do not invent a third prefix for the same node. The app's edges point at these strings.
- Do not decode or trim to "clean up" an id. The edge and the node must be the same characters.

## Wrong readings

- "The id is the last segment." No. The whole input is kept after the prefix.
- "`pend:` can be split into record id and address on the first extra colon." No. The record id is allowed to contain colons, and the address always does.

## Where it was taken from

GilbApp `src/lib/base/graphModel.ts`, `relationNodeId` and `pendantNodeId`. `assembleGraph` stays in the app.
