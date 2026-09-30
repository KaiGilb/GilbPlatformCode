# catalog-path

The catalog file under an app mount. A missing trailing slash is added. A leading slash is not. Nothing is fetched.

## What this is

`thinSkillsPathFor(baseUrl)` returns the path of the thin skills catalog relative to a mount the host passes.

`"/mynet"` joined straight onto `"data/..."` becomes `"/mynetdata/..."`. That file does not exist. This function puts exactly one slash between the mount and `data` when the mount does not already end in `/`.

## What this is not

- Not a fetch, and not a parser of the catalog. The host requests the path and reads the file.
- Not the skill-address builder. The app has a function that turns a catalog row into a term address on a fixed host. That host name is not allowed in this library, so that function stayed in the app. Do not copy it in beside this path.
- Not a resolver of `..`, `.`, or a scheme. The mount is used as text.
- Not a trim. A space is part of the mount.
- Not a guarantee of a leading slash. A relative mount stays relative. `""` is the one empty case that gains a slash, and only because it does not already end in `/`.

## How to take it

Package: `@kaigilb/gilbplatformcode-catalog-path`

```ts
import { thinSkillsPathFor } from "@kaigilb/gilbplatformcode-catalog-path";

const path = thinSkillsPathFor(mount);
```

The app builds one constant from the bundler's base URL and this function. The constant stayed in the app because the base URL is the app's. Call this with the mount you actually serve.

## What you pass

One string. The mount. In the app that is the bundler's base URL, which is expected to end in `/` (`/` in development, `/mynet/` in production). Other callers may pass a mount without that slash. Both are accepted. The function does not check that the mount is a URL.

## What you get

A string: `<mount>/data/thin-skills.json`, with one slash between the mount and `data`.

| Mount | Result |
|---|---|
| `"/"` | `"/data/thin-skills.json"` |
| `"/mynet/"` | `"/mynet/data/thin-skills.json"` |
| `"/mynet"` | `"/mynet/data/thin-skills.json"` |
| `"mynet"` | `"mynet/data/thin-skills.json"` — still relative |
| `""` | `"/data/thin-skills.json"` |
| `"/mynet//"` | `"/mynet//data/thin-skills.json"` — a slash already present is kept, including a doubled one |

No second slash is inserted when the mount already ends in `/`. No slash is removed.

## Examples

```ts
thinSkillsPathFor("/mynet");
// "/mynet/data/thin-skills.json"

thinSkillsPathFor("mynet");
// "mynet/data/thin-skills.json"

thinSkillsPathFor("");
// "/data/thin-skills.json"
```

## Host must supply

The mount. Do not pass a full origin unless the catalog really is served at `<origin>/data/thin-skills.json` with the origin included in the string you pass. This function will not extract a path from an origin. `"https://app.example"` becomes `"https://app.example/data/thin-skills.json"` because the string does not end in `/`. That is concatenation, not URL resolution.

## Do not

- Do not prefix a leading `/` when the mount is relative. A relative result is how a relative mount is supposed to come back.
- Do not collapse `//`. `"/mynet//"` keeps the double slash. Cleaning it would hide a wrong mount.
- Do not append the file name yourself. The file name is part of the result. Appending it again looks for `thin-skills.json/data/thin-skills.json` only if you also wrap the call, which is the mistake.
- Do not treat this path as a term address. The catalog file and the term it describes are different. The term address is the function that stayed in the app.

## Wrong readings

- `""` does not stay empty. It does not end in `/`, so the result is `"/data/thin-skills.json"`.
- `"/mynet"` and `"/mynet/"` are the same result. The production mount's trailing slash is why a test of the constant alone could not see the bug. Pass the mount without the slash when you want to prove the slash is added.
- A mount with a query or a hash is not parsed. `" /mynet?x"` does not end in `/`, so the file name is glued on after the query. Pass a mount, not a request address.
- Nothing is trimmed. `" /mynet"` becomes `" /mynet/data/thin-skills.json"`.

## Source

MyNetBase `src/lib/skills/thinSkills.ts`, `thinSkillsPathFor`. `THIN_SKILLS_PATH` and the referent builder in that file were not copied.
