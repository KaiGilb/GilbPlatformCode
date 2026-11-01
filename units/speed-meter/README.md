# speed-meter

## What this is

An in-memory meter of the requests an app received and answered, how long a page took to paint, and how long a write took.

Plain TypeScript, no React. Call `createSpeedMeter(options?)` once. It returns one reading object, and that object is the same object every time. A browser run reads it by reference.

The reading has these fields:

- `requests`: how many requests were received, by route name. Names in `routes` start at 0. A name seen later is created at 0 and then incremented, so the first count is 1.
- `answered`: how many requests were answered, by route name. Names in `answeredRoutes` start at 0. When `answeredRoutes` is omitted, it is `routes`.
- `log`: `{ route, method, url }`, newest last. At most `maxLog` entries (default 500). Past that, the oldest is dropped.
- `lastPaint`: `{ page, ms, source, fullMs? }` or `null`. `source` is `"memory"`, `"device"`, `"preview"` or `"network"`.
- `start`: `{ disk, hydrated, ms, entries, at }` or `null`.
- `writes`: `{ kind, ms, ok, at }`, newest last. At most `maxWrites` entries (default 200). Past that, the oldest is dropped.

`ms` on a paint and on a write is the clock difference rounded to the nearest 0.1.

Members:

- `countRequest(route, method, url)`: `requests[route] += 1`, and appends to `log`. Does not call listeners.
- `countAnswered(route)`: `answered[route] += 1`. Does not call listeners.
- `setPaint(p)` / `getPaint()`: set or read `lastPaint`. `setPaint` calls listeners.
- `setStart(s)` / `getStart()`: set or read `start`. `setStart` calls listeners.
- `timePage(page)`: starts a timer. `rows(source)` — the first call sets `lastPaint` to `{ page, ms, source }`. A later `rows` does nothing. `full()` — the first call after `rows` sets `fullMs` on that same paint. `full` before `rows`, a second `full`, or a `full` after another paint has replaced `lastPaint`: nothing. It never writes `fullMs` onto another page's paint.
- `timeWrite(kind)`: returns a stop function `(ok) => void`. The first call appends `{ kind, ms, ok, at }`. A later call does nothing.
- `subscribe(fn)`: called after `setPaint`, `setStart`, a `timePage` write (`rows` or `full` that stored something), a `timeWrite` stop and `reset`. Not after `countRequest` or `countAnswered`. Returns the unsubscribe function. A listener that throws does not stop the others, and does not stop the meter.
- `reset()`: puts the same reading object back to its initial state. The initial routes are 0 again, extra routes are removed, `log` and `writes` are emptied, `lastPaint` and `start` are `null`. Listeners are called.
- `startLine(start)`: `start: disk yes|no, hydrated yes|no, N entries, M ms`.
- `installProofHooks(search, target, hooks, globalKey?)`: when `search` carries `proofHooks=1`, sets `target[globalKey ?? "__speedMeterHooks"]` to the hooks object. Otherwise it sets nothing.

Options, all optional:

- `routes`: route names that start at 0. Default `[]`.
- `answeredRoutes`: names that start at 0 in `answered`. Default: `routes`.
- `globalKey`: the property the reading is placed on. Default `"__speedMeter"`. `null` places it nowhere.
- `target`: the object that property is set on. Default `globalThis`.
- `maxLog`: default 500. `maxWrites`: default 200.
- `now`: clock in milliseconds. Default `performance.now()`, or `Date.now()` when `performance` is absent.
- `isoNow`: wall clock for `at`. Default `() => new Date().toISOString()`.

Speed Lab's shape: `routes: ["records", "patch", "other"]`, `answeredRoutes: ["records", "patch"]`, `globalKey: "__speedProof"`. The exposed object then starts as Speed Lab's proof object plus `writes: []`.

A browser run reads `window.__speedMeter`, or `window[globalKey]` when you set a key. The fields are the reading's fields above. The last meter with a key wins: a second `createSpeedMeter` with the same key on the same target replaces the exposed reading. The first meter keeps its own reading. Two meters with different keys do not share state.

## What this is not

- Not a network client. It does not fetch, and it does not open a socket.
- Not storage. It does not read or write disk, and it does not touch `localStorage`.
- Not React. There is no hook and no component.
- Not a judge. It does not decide pass or fail. Speed Lab does that.

## How to take it

Package: `@kaigilb/gilbplatformcode-speed-meter`

No runtime dependency and no peer dependency. The unit's folder is the package. Put this line in your app's own `.npmrc` so a unit installed from a path is a copy and not a link:

```
install-links=true
```

Then install the unit's folder:

```sh
npm install <path-to-the-library>/units/speed-meter
```

The package ships TypeScript source (`src/`); your bundler compiles it. Its `tsconfig.json` leaves out `noUncheckedIndexedAccess`, as the other units of this kind do.

## Examples

```ts
import { createSpeedMeter } from "@kaigilb/gilbplatformcode-speed-meter";

const meter = createSpeedMeter(); // once. A browser run reads window.__speedMeter
const page = meter.timePage("entries");
page.rows("memory"); // the first rows are on screen; pass where they came from
page.full(); // the list is complete
const stop = meter.timeWrite("save");
stop(await save()); // ok is true when the save succeeded

async function measuredFetch(route: string, method: string, url: string) {
  meter.countRequest(route, method, url); // in the app's fetch wrapper, before the request
  const response = await fetch(url, { method });
  meter.countAnswered(route); // when it has been answered
  return response;
}
```

Speed Lab compatibility, for a host that wants the same initial counters and the same global name:

```ts
const meter = createSpeedMeter({
  routes: ["records", "patch", "other"],
  answeredRoutes: ["records", "patch"],
  globalKey: "__speedProof",
});
// window.__speedProof is meter.reading: requests, answered, log, lastPaint, start, writes
```

## What the host must supply

- The calls. `countRequest` in the fetch wrapper, `countAnswered` when a request has been answered, `timePage` around a list (rows when the first rows are on screen, full when the list is complete), `timeWrite` around a save, and `setStart` when the host has a start reading.
- Nothing else. No platform client, no clock of your own unless you want a fake one in a test.

## Module state

None in the module. Each `createSpeedMeter` call has its own reading, its own log and its own listeners.

When `globalKey` is a string, the reading is also placed on `target[globalKey]` (`globalThis.__speedMeter` by default). The last meter with a key wins: a later call with the same key on the same target replaces that property. It does not copy counts into the first meter, and it does not clear the first meter's reading. Two meters with different keys do not share state.

`installProofHooks` does not keep a copy of the hooks. The target holds the object you passed.

Dynamic imports: none.

## Do not

- Do not call `rows` a second time to correct the source. The first call stands.
- Do not read a missing `fullMs` as zero. It means `full` has not been recorded on that paint.
- Do not decide from these numbers that a page passed or failed. Record them here. Speed Lab decides.
- Do not expect `countRequest` or `countAnswered` to wake a subscribed panel. They do not call listeners.

## Wrong readings

- "`countRequest` repaints a subscribed panel." It does not call listeners. `setPaint`, `setStart`, a `timePage` write, a `timeWrite` stop and `reset` do.
- "`full()` before `rows()` stores a paint." It does nothing.
- "`full()` fills in whichever paint is current." It writes `fullMs` only on the paint its own `rows()` stored. If that paint is no longer `lastPaint`, it does nothing.
- "A second `createSpeedMeter` with the same key shares the first meter's reading." It does not. The target property points at the new reading. The first meter keeps its own.
- "`globalKey: null` still publishes `__speedMeter`." It publishes nothing.
- "The meter says whether the app is fast enough." It records times. It does not decide pass or fail.

## Where it came from

`apps/speed-lab/src/proof.ts` lines 1-40, at commit `b53704e08e2c0cb01ae1787eb8f5c927e905e98d` in `KaiGilb/GilbPlatformCode`, copied to `src/speedMeter.ts`.

Named changes, and only these:

1. the module-level object becomes createSpeedMeter(options);
2. fixed request keys become routes;
3. the global key, target, clock and limits become options;
4. writes and timeWrite are new;
5. timePage is new;
6. subscribe replaces subscribePaint and also fires on setStart and writes;
7. reset is new;
8. a throwing listener no longer stops the others;
9. installProofHooks takes a hooks object and a key instead of one clearCache function.

`src/index.ts`, `src/speedMeter.test.ts`, `src/hostAgnostic.test.ts` and `scripts/check-host-agnostic.mjs` are new. `startLine` is the same string as in the source file.

Taken by: `apps/speed-lab` (Speed Lab), through `src/proof.ts`, with the options above.
