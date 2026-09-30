# map-limit

Run a list with a cap on how many calls are in flight. The result order matches the list.

## What this is

`mapWithConcurrency(items, limit, fn)` calls `fn(item, index)` for each item, with at most `limit` calls running at once, and returns the results in input order.

## What this is not

- Not a retry. A throw rejects the whole promise.
- Not a pool you keep open. One call, then it is done.
- Not a reason to raise the cap. The app uses 6 because a browser keeps about that many connections to one host. Pass the cap you mean. This function does not know about hosts.

## How to take it

Package: `@kaigilb/gilbplatformcode-map-limit`

```ts
import { mapWithConcurrency } from "@kaigilb/gilbplatformcode-map-limit";

const planes = await mapWithConcurrency(names, 6, (name, index) => readPlane(name, index));
```

## What you pass

`items` is the list. An empty list does not call `fn` and returns `[]`.

`limit` is the cap. A finite number below 1 is treated as 1, because the worker count is `Math.max(1, limit)`. Do not pass `NaN`. `Math.max(1, NaN)` is `NaN`, and then no worker runs. This is not corrected here.

`fn` receives the item and its original index. It returns a promise.

## What you get

A new array, same length, same order. A later item that finishes first does not move earlier in the result.

If `fn` throws, the promise rejects. You do not get a shorter array of the ones that succeeded.

The index passed to `fn` is the index in `items`, not "the nth call to finish".

## Do not

- Do not sort the result. Order is already the input order.
- Do not catch inside this function. Let the caller see the failure.
- Do not pass `NaN` or `Infinity` and expect a sensible cap. `Infinity` is capped by the list length. `NaN` is not.

## Wrong readings

- "A limit of 0 means run nothing." No. It means one at a time.
- "A failure of item 2 still returns item 1." No. The whole call rejects.

## Where it came from

GilbApp `src/lib/base/heldTypes.ts` — `mapWithConcurrency`. The term fetch stayed in the app.
