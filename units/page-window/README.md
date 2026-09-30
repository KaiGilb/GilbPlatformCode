# page-window

Whether another page should be asked for. The `complete` flag is not the stop.

## What this is

`windowExhausted(offset, returned, total)` is true when `offset + returned >= total`.

- `returned` is how many items this page actually carried. It is not the limit you asked for. A short page is not the end.
- `total` is the total the vault declared. This function does not know if that total is exact, a lower bound, or a guess. Pair it with the result-total unit when the kind matters. The arithmetic here is the same either way.
- A `complete: false` on the last page is ignored, because that flag has been seen on a page that had nothing left. Stopping on it fetches forever. Do not add it as an argument.

`pageWindowParams(window, includeOffset?)` writes the query. `includeOffset` defaults to true, which is the shipped walk. Pass false and `offset` is omitted. `limit` is always written, including `limit=0`. A comment in the app says a zero-width ask emits nothing. This function does not do that. Do not "correct" it to match that comment.

`withPageWindow(url, window, includeOffset?)` appends those params. It uses `?` when the URL has no query yet, and `&` when it does. It looks at the URL. It does not assume the URL is a bare path.

`PAGE_WALK_MAX_PAGES` is `50`. That is a safety cap on how many pages one walk may request. Hitting it means the walk stopped unfinished. It is not proof the list ended. The app calls this constant `FAMILY_PAGE_WALK_MAX_PAGES`. The walk itself stays in the app. This package does not fetch.

Numbers are not clamped. A negative offset is written as `-1`. Do not pass one.

## What this is not

- Not a pager component, and not a fetcher.
- Not a promise that `total` is right. If the vault's total is wrong, this stop is wrong in the same direction. It will not second-guess the total.

## How to take it

Package: `@kaigilb/gilbplatformcode-page-window`

```ts
import { windowExhausted, pageWindowParams, withPageWindow, PAGE_WALK_MAX_PAGES } from "@kaigilb/gilbplatformcode-page-window";
```

Path: `units/page-window/`.

## Examples

```ts
windowExhausted(0, 30, 30); // true
windowExhausted(0, 10, 50); // false — a short page, keep going
windowExhausted(0, 0, 0);   // true

pageWindowParams({ offset: 0, limit: 30 });       // "offset=0&limit=30"
pageWindowParams({ offset: 0, limit: 30 }, false); // "limit=30"

withPageWindow("https://example.test/items", { offset: 0, limit: 30 });
// "https://example.test/items?offset=0&limit=30"

withPageWindow("https://example.test/items?a=1", { offset: 30, limit: 30 });
// "https://example.test/items?a=1&offset=30&limit=30"
```

## Do not

- Do not stop because `complete` is false, or continue because `complete` is true. Do not pass that flag in.
- Do not use the requested limit as `returned`.
- Do not report a walk that hit `PAGE_WALK_MAX_PAGES` as "that is all there is".

## Where it came from

GilbApp `src/lib/base/standardsFamilyPaging.ts`, `windowExhausted`, `pageWindowParams`, and `withPageWindow`. `includeOffset` replaces the compile-time constant `FAMILY_OFFSET_WALK`, which is true in the app. Pass true, or omit it, to match.
