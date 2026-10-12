# standard-href

A link that opens one standard in the standards editor. The host passes the editor's address.

## What this is

`standardHref(editorBase, target)` returns an absolute URL. The query is the editor's own URL-as-state:

```
?pod=<vaultId>&section=standards[&stab=<tab>][&pk=<kind>]&<param>=<id>
```

1. `pod` is set only when `target.vaultId` is given.
2. `section` is always `standards`.
3. `stab` is set only when the tab is not `processes`, the editor's default tab.
4. `pk` is set only on the `processes` tab, and only when `processKind` is given and is not `process`.
5. The tab's own selection param carries the id: `std` for processes, `rs` for rules, `pr` for procedures.

## What this is not

- Not a standards editor. An app links to the editor; it never rebuilds it.
- Not a permission. Opening the link still depends on what the opener may read.
- Not the share link of the current screen. That is `share-link`.

## How to take it

Package: `@kaigilb/gilbplatformcode-standard-href`

```ts
import { standardHref } from "@kaigilb/gilbplatformcode-standard-href";

const href = standardHref(config.editorBase, { tab: "rules", param: "rs", id: ruleId, vaultId });
```

## What you pass

`editorBase`: the editor's absolute address, from the host's configuration.

`target`: `tab`, `param`, `id`, and optionally `processKind` and `vaultId`.

## What you get

An absolute URL string, the base's origin and path, with the query above. Values are encoded.

## Examples

```ts
standardHref("https://app.example.test/baseapp/", { tab: "procedures", param: "pr", id: "06abc", vaultId: "v9" });
// https://app.example.test/baseapp/?pod=v9&section=standards&stab=procedures&pr=06abc
```

## Host must supply

The editor's base URL. This unit names no host.

## Do not

- Do not pass a relative base. It throws a `TypeError`. Resolve it against your origin first.
- Do not pair a tab with another tab's param. The editor reads only the param its tab owns.

## Wrong readings

- A query already on the base is replaced, not kept.
- `processKind` on a tab other than `processes` is ignored.

## Source

`standardHref` from Kai's `gilb-shell` package. The URL shape is the standards editor's (GilbApp).
