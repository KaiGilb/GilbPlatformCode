# app-basename

The app mount with one trailing slash removed. A missing mount becomes an empty path. The next segment is the caller's to join.

## What this is

`appBasenameFrom(baseUrl)` prepares the bundler's base path for joining.

The base path arrives with a trailing slash (`/` when the app is at the origin root, `/mynet/` when it is mounted in a folder). Joining another slash onto that produces a double slash. This function removes one trailing slash so the caller can write `basename + "/card/" + key`.

## What this is not

- Not catalog-path. That function **adds** a slash when the mount does not end in one, then appends `data/thin-skills.json`. This function **removes** one slash and appends nothing. Using one for the other either glues `mynet` onto `data` or strips the slash the catalog join needs.
- Not a read of the bundler. The app reads its base URL from the environment and would pass that string here. The environment stays in the host. There is no default folder name in this function.
- Not a resolver of `.` or `..`, and not a URL parser.
- Not a trim. A space is part of the mount.
- Not a strip of every trailing slash. Only one.

## How to take it

Package: `@kaigilb/gilbplatformcode-app-basename`

```ts
import { appBasenameFrom } from "@kaigilb/gilbplatformcode-app-basename";

const basename = appBasenameFrom(mount);
const path = `${basename}/card/${key}`;
```

## What you pass

A string, null, or undefined. The mount as the bundler reported it. Do not pre-strip the slash. The function's only job is that one strip, including the missing-mount case.

## What you get

A string.

| Input | Result |
|---|---|
| `undefined` or `null` | `""` — because a missing mount is taken as `/`, and `/` loses its slash |
| `"/"` | `""` |
| `"/mynet/"` | `"/mynet"` |
| `"/mynet"` | `"/mynet"` |
| `"/mynet//"` | `"/mynet/"` — the second slash stays |
| `""` | `""` — an empty string is not missing. It is not replaced with `/` |
| `"mynet/"` | `"mynet"` |
| `" /mynet/"` | `" /mynet"` — the leading space stays |

## Examples

```ts
appBasenameFrom("/mynet/"); // "/mynet"
appBasenameFrom(undefined); // ""
appBasenameFrom("");        // ""
appBasenameFrom("/mynet//"); // "/mynet/"
```

A root mount joins as `/card/...` only if the caller adds the slash: `"" + "/card/" + key`. A folder mount joins as `/mynet/card/...`. That is why the slash is removed here and added by the caller.

## Host must supply

The mount string. When the bundler leaves it unset, pass `undefined`, not `""`, if you want the app's missing-value behaviour. `undefined` and `""` are different. `undefined` becomes `""` via `/`. `""` stays `""`. Both results happen to be empty. The difference shows up only if a later change treats `/` differently. Pass what you actually have.

## Do not

- Do not also remove a leading slash. A mount of `/mynet` must stay absolute. Stripping the leading slash makes the next join relative to the current page.
- Do not collapse `//` in the middle or at the end beyond the single trailing slash. `/mynet//` becoming `/mynet/` is the whole repair. Collapsing further hides a wrong mount.
- Do not append `data/thin-skills.json` with this result unless you add the slash yourself. catalog-path already does that join. Call that unit for the catalog file.
- Do not hardcode a product folder name when the mount is missing. Missing means the app is at the root of its origin, which this function reports as an empty basename.

## Wrong readings

- "Undefined stays undefined." It does not. The result is always a string, and a missing mount becomes `""`.
- "`/` and `""` are the same input." They are not. They are the same output. The empty string never went through `/`.
- "Every trailing slash goes." No. One.
- This is not the origin. The origin, including any hardcoded production origin, stayed in the app. Do not add it here.

## Source

MyNetBase `src/lib/card/shareUrl.ts`, `appBasename`. The environment read was replaced by the argument. `appOrigin` in that file hardcodes a host and was not copied.
