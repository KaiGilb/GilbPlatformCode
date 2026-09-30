# unnamed-person

The label to show when this viewer was not given a name. The raw address is never the label.

## What this is

`friendlyUnnamedLabel(principal)` returns one of two shapes.

If `principal` parses as a URL and the hostname is not empty:

```text
Person on example.test
```

The URL parser lowercases the hostname before this function sees it. `https://WWW.example.test` is therefore the same as `https://www.example.test`. One leading `www.` is then removed. A second `www.` stays: `www.www.example.test` becomes `Person on www.example.test`. The port is not included. The path is not included. `https://example.test:8443/base/p/abc` is `Person on example.test`.

If it does not parse, or the hostname is empty (`file:///tmp/a` is one), the result is the exact string:

```text
Unnamed connection
```

## What this is not

- Not a name lookup. Call it only after the name you were allowed to read came back empty.
- Not a decision that the viewer may see a name. The read already happened.
- Not the principal. Do not fall back to the address when you dislike this sentence. The address in the label was the bug this function exists to avoid.
- Not `display-friendly`. That one shortens an address you are allowed to show. This one refuses to show the address at all.

## How to take it

Package: `@kaigilb/gilbplatformcode-unnamed-person`

```ts
import { friendlyUnnamedLabel } from "@kaigilb/gilbplatformcode-unnamed-person";
```

Path: `units/unnamed-person/`.

## Examples

```ts
friendlyUnnamedLabel("https://www.example.test/base/p/abc");
// "Person on example.test"

friendlyUnnamedLabel("https://WWW.example.test/a");
// "Person on example.test"

friendlyUnnamedLabel("https://www.www.example.test/a");
// "Person on www.example.test"

friendlyUnnamedLabel("not a url");
// "Unnamed connection"

friendlyUnnamedLabel("");
// "Unnamed connection"
```

## What the host must supply

The principal string you already have. The name, when there is one. This function will not fetch a card.

## Do not

- Do not append the path or the id. Two people on one host share this label. That is honest: you were not given a name that distinguishes them.
- Do not strip every `www.`. Only one leading prefix.
- Do not return the principal from the catch. The catch is the unnamed sentence.

## Wrong readings

- "`WWW.` is kept because the strip is case-sensitive." The strip is case-sensitive, and it never sees `WWW.` on an http(s) URL. The parser has already lowercased the host.
- "An empty result means pass the address through." The result is never empty. It is either `Person on …` or `Unnamed connection`.
- "This is a display name." It is the label for the case where there is no display name.

## Where it came from

MyNetBase `friendlyUnnamedLabel` in `src/lib/base/myConnections.ts`.
