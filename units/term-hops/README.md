# term-hops

The term addresses inside one declared identity. Several terms may be joined with `|`. Only a `/base/t/<name>` address is kept. Nothing is fetched.

## What this is

`hopableTermIris(identity)` splits one identity string into the term addresses a caller may request one at a time.

Some function documents store `a:typeUri` as several addresses joined by `|`. Asking the server for the joined string returns not-found. Asking for each address on its own returns the children. This function is the split. The request stays in the host.

## What this is not

- Not a fetch, and not a children list. The host requests each returned address.
- Not the type-name unit. That unit pulls a bare name out of one address. This unit keeps the whole address, and it drops anything that is not a term address.
- Not the type-spell unit. A broken `%` there throws. This function does not decode, so a broken `%` stays in the string and does not throw.
- Not a preference picker. The app also has a private helper that chooses one hop when the caller has a preferred address. That helper stayed in the app. This unit returns the whole list.
- Not a decoder and not a case fold. `HTTP://` is dropped, not repaired.

## How to take it

Package: `@kaigilb/gilbplatformcode-term-hops`

```ts
import { hopableTermIris } from "@kaigilb/gilbplatformcode-term-hops";

const hops = hopableTermIris(identity);
```

## What you pass

One string. A single term address, or several addresses separated by `|`. Not a list. Not a document. If the identity is already an array, join it only when the host is sure `|` is the separator the document used. This function will split again.

## What you get

A new list of strings, in order, with duplicates removed after normalisation.

Each piece is trimmed, then **one** trailing slash is removed, then tested. A piece that fails the test is dropped. It is not returned unchanged.

The test, exactly:

`^https?:\/\/[^/?#]+\/base\/t\/[^/?#|]+$`

That means:

- The scheme is lowercase `http://` or `https://`. `HTTP://` fails.
- One host, with no `/`, `?`, or `#` inside it. A port is allowed, because `:` is allowed there.
- Then the path `/base/t/`. `/vault/t/` fails. The word `base` is lowercase and exact.
- Then a name of at least one character, containing no `/`, `?`, `#`, or `|`.
- The name must end the string.

| Input | Result |
|---|---|
| `https://terms.example.test/base/t/Chair` | that address, once |
| the same address twice, or once with a trailing slash and once without | one entry, without the slash |
| `http://terms.example.test/base/t/Seat` | kept. `http` is allowed |
| `https://terms.example.test/vault/t/Chair` | `[]` |
| `https://terms.example.test/base/t/Chair//` | `[]` — the second slash is not removed, so the name does not match |
| `HTTP://terms.example.test/base/t/Chair` | `[]` |
| `https://terms.example.test/base/t/Chair?x=1` | `[]` |
| `""` or `"not-an-address"` | `[]` |
| two different addresses joined by `\|` | both, in that order |

A space at either end is removed by the trim. A space in the middle of the name is kept and still matches, because the name test does not forbid spaces. Do not "fix" that by rejecting spaces.

Nothing is percent-decoded. `Chair%20` stays `Chair%20`. An encoded pipe (`%7C`) is part of the name, not a separator. The only separator is the character `|` before the test.

## Examples

```ts
const a = "https://terms.example.test/base/t/Chair";
const b = "http://terms.example.test/base/t/Seat";

hopableTermIris(`${a}/ | ${b}|${a}`);
// [a, b]

hopableTermIris("https://terms.example.test/base/t/Chair//");
// []
```

## Host must supply

The identity string already read from the document. This function does not look at `a:typeUri` by name. If the field is a list rather than a joined string, the host decides how to present it. Passing the list through `String()` will not produce the addresses.

## Do not

- Do not encode the pipe and request the whole string. Encoding is not the fix. The joined route is not a route.
- Do not treat `[]` as "this term has no children". It means the identity contained no hop address. The children were not asked for.
- Do not append `/children` inside this function. The host adds that when it builds the request, and only on an address this list returned.
- Do not drop `http://` to force `https://`. Both schemes are hop addresses.
- Do not decode the name. A `%` that is not valid encoding must not start throwing here. type-spell is the function that decodes, and it throws.

## Wrong readings

- A foreign path is dropped, not repaired into `/base/t/`. `/vault/t/Chair` does not become a base term.
- One trailing slash is removed. Two trailing slashes fail the whole piece. The piece is not returned with the slashes still on.
- Duplicates are judged after that slash is removed. `.../Chair/` and `.../Chair` are the same hop.
- Order is declaration order, not alphabetical order.
- The first hop is not "the" type. Callers that need one preferred address make that choice outside this list. The list does not drop the others.

## Source

GilbApp `src/lib/base/ontologyBrowse.ts`, `hopableTermIris`, and the `HOPABLE_TERM_IRI` pattern above it. The private `hopableTermIri` chooser was not copied.
