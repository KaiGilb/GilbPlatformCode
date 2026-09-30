# command-match

Whether a command's label or one of its keywords contains the query. An empty query keeps the command.

## What this is

`commandMatches(cmd, query)` returns true or false.

The palette uses it to hide commands while someone types. The vault search beside those commands is a different list. This function does not see that list.

## What this is not

- Not `text-filter`. That unit keeps a row only when every word of the query appears in the joined fields. This unit is one substring. `open notes` as a query does not mean both words. It means the exact characters `open notes`, including the space, appear inside the label or one keyword.
- Not a ranker. There is no score. A label hit and a keyword hit are the same true.
- Not a trimmer. The screen that calls this trims the query first. This function does not.
- Not a search of record bodies. A command that matched because a record's text contained the query is the bug this exists to avoid. You pass the label and the keywords only.

## How to take it

Package: `@kaigilb/gilbplatformcode-command-match`

```ts
import { commandMatches } from "@kaigilb/gilbplatformcode-command-match";

const shown = commands.filter((cmd) => commandMatches(cmd, query.trim()));
```

## What you pass

`cmd.label` is the words on the row.

`cmd.keywords` is the extra words you chose. It may be empty. The words are not read from the command's result.

`query` is what was typed. Pass `""` to keep every command. Pass the trimmed query if a space-only box should keep every command. If you pass the raw box value, `" "` is a query.

## What you get

True when the query is empty, or the lowercased query is found inside the lowercased label, or inside any one lowercased keyword.

False otherwise.

Lowercasing is `toLowerCase()` with no locale. `"I"` matches `"i"`. It is not the Turkish locale rule, and it is not `toLocaleLowerCase()`.

## Examples

```ts
commandMatches({ label: "Open notes", keywords: ["nodes"] }, "");
// true

commandMatches({ label: "Open notes", keywords: ["nodes"] }, "GRID");
// false — GRID is not in this command

commandMatches({ label: "Open notes", keywords: ["grid"] }, "GRID");
// true

commandMatches({ label: "Open notes", keywords: [] }, "note ");
// false — the trailing space is part of the query. " note" would match, because "open notes" contains space + note.
```

## The host must supply

The command list, and the decision to trim. This unit does not know which commands exist.

## Do not

- Do not switch the palette's own filter back on beside this. A second filter that also scores record text will drop the vault hits that do not contain the query as a substring.
- Do not split the query into words and require all of them. That is `text-filter`, and the command row will disappear for a two-word query that the label contains only as separate words in a different order.
- Do not trim the keywords inside a wrapper and expect this function to have trimmed them. A keyword `" file"` still matches `"file"` because `includes` does not care about the extra space. A query `" file"` does not match the keyword `"file"`.

## Wrong readings

- "An empty query hides everything." No. An empty query keeps everything.
- "Every word must match." No. One substring, whole query, one field.
- "The match is locale-aware." No.

## Where it was taken from

GilbApp `src/components/CommandPalette.tsx`, `commandMatches`. The palette component, the command list, and the vault search stay in the app.
