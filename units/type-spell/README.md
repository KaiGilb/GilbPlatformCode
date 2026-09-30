# type-spell

One absolute type address from any spelling of the same type. The host supplies the address. A foreign address stays as it was.

## What this is

`normalizeTypeUri(raw, absoluteTypeUri)` returns one string your type registry can use as a key.

The second argument builds that address from a bare name. This unit does not know which host you use.

## What this is not

- Not `type-name`. That unit returns a short name, or null when a slash remains.
- Not `type-curie`. That unit returns `t:Name` or the original trimmed text. It does not build an absolute address.
- Not a decision about which types the app has icons for. You collapse the spelling here, then your registry looks the address up. A miss is still a miss.
- Not a writer. Do not store the result back onto a record unless that write is already your app's rule. Collapsing a third-party host that happens to use `/base/t/` is a known hole. It is preserved. Closing it is a behaviour change, not a cleanup.

## How to take it

Package: `@kaigilb/gilbplatformcode-type-spell`

```ts
import { normalizeTypeUri } from "@kaigilb/gilbplatformcode-type-spell";

const key = normalizeTypeUri(servedType, (name) => `${typeNamespace}${name}`);
```

`typeNamespace` is your app's type namespace, including the trailing slash, such as the absolute `…/base/t/` you already resolve types with.

## What you pass

`raw` is whatever the vault handed you: a bare name (`Task`), a CURIE (`t:Task`), an absolute `…/base/t/Task` on any host, or a foreign address.

`absoluteTypeUri` is called with the bare name only. It must return the address your registry is keyed by. It is not called for a missing value, an empty string, or a foreign address.

## What you get

A string.

- `null`, `undefined`, a non-string, and `""` return `""`. The builder is not called.
- `Task` and `t:Task` both go to the builder as `Task`.
- `t:` goes to the builder as `""`. The `t:` prefix is lowercase and exact. `T:Task` is not stripped. The builder receives `T:Task`.
- `http://` and `https://` are recognised only in lowercase. `HTTP://…` is not an address. It is passed to the builder as the whole string.
- An address whose path contains `/base/t/<Name>` calls the builder with `<Name>`. The match is case-insensitive, first only. `?` and `#` end the name. The name is decoded once.
- An address with no `/base/t/<Name>` is returned unchanged. `https://schema.example/Task` stays that string.
- A path `/base/t/` with nothing after `t/` is not a name. The original address is returned.
- Spaces are not trimmed. `"  Task"` is a different name from `"Task"`.
- A broken `%` in the name throws. Catch it at the edge if you must. Do not catch it inside and invent a name.

## Examples

```ts
const abs = (name: string) => `https://types.example/base/t/${name}`;

normalizeTypeUri("t:Task", abs);
// "https://types.example/base/t/Task"

normalizeTypeUri("https://other.example/base/t/Caf%C3%A9", abs);
// builder receives "Café"

normalizeTypeUri("https://schema.example/Task", abs);
// "https://schema.example/Task"  — builder not called

normalizeTypeUri(null, abs);
// ""
```

## The host must supply

The function that turns a bare name into your registry's absolute type address. Two apps on two hosts pass two functions. They must not share one hardcoded host.

## Do not

- Do not drop the builder and paste a host into this unit.
- Do not treat "no `/base/t/` segment" as an error. That address is returned so a foreign type is not joined to yours.
- Do not narrow the path match to a list of hosts inside this function. The app collapses every host. A later allow-list is a separate change.
- Do not catch the decode error and pass the broken text to the builder. The throw is the signal.

## Wrong readings

- "`t:` and `T:` are the same." No. Only a lowercase `t:` is removed.
- "The builder always runs." No. Empty input and a foreign address skip it.
- "This returns `t:Task`." No. It returns whatever your builder returns.

## Where it was taken from

GilbApp `src/lib/base/recordTypes.ts`, `normalizeTypeUri`. In the app the builder is `typeUri`, which reads that app's own origin. The origin stays in the app. `baseHost` and `typeNamespace` stay in the app with it.
