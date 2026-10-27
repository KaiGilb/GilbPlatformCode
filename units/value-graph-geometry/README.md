# value-graph-geometry

The math under the Value graph: the value axis, the date axis and its ticks, snapping, the coloured bands, the series paths and the label rows.

## What this is

The math under the Value card's graph (the Arrow and the Timeline), as plain functions: no DOM, no React. The graph itself is a later unit (`value-graph`); this one is what it asks for the numbers and the pixels.

- Qualifier sets: `groupLevels(data)` (the sets of a Value in order of first appearance: one for the Arrow rows, the Timeline series and the "+ New" menu), `groupKey`, `groupLabel`. A set is its qualifier (choices with defaults filled in, conditions and side), never the date of a level.
- The value axis: `buildAxis(values, direction, p0, p1, flip?)` (10% padding, a 1-2-5 tick step, `toPx` and `fromPx`; `lower` flips it), `niceStep`, `roundTo`, `allWhole`, `snapStep`, `snapValue`, `fmt`.
- The date axis: `parseDate` (`YYYY`, `YYYY-MM`, `YYYY-MM-DD`, years 1900 to 2200, as UTC midnight ms), `dateRange` (the Timeline's x range), `niceDateTicks` (ticks on calendar boundaries, UTC, labels like `27 Oct`, `Oct 2026`, `Q4 2026`, `2027`), `dateAxis`, `snapDate` (to the day; to a Monday above 2 years, `WEEK_SNAP_SPAN`), `isoDay`, `formatDay` (fixed English names, UTC), `DAY`.
- The year rule: `MIN_YEAR`, `MAX_YEAR`, `YEAR_RANGE_SENTENCE`, `yearOutOfRange`, re-exported from the `date-rules` unit so the library holds one copy of the rule.
- Series and bands: `seriesPath` (the line of one series: Past, Status, a Tolerable only when the Status is worse than it, Goals, Wishes), `isWorseThanTolerable`, `isLimitKind` (Fail and Survival are lines, not points), `arrowBands` (red, yellow and green bands behind an Arrow row; `BAND_RED`, `BAND_YELLOW`, `BAND_GREEN`), `currentValues` (the values of the latest-dated items of one kind).
- Marks and labels: `MARKER` (marker sizes), `markerHalf(kind)`, `staggerRows(items, gap?, maxRows?)` (label rows so labels do not overlap), `textWidth(text, size)`.
- The types: `Axis`, `LevelGroup`, `DateRange`, `DateTick`, `DateAxis`, `SeriesPath`, `ArrowBand`.

It reads from a Value card only `variables[].name` and `defaultOption` and `levels[].kind`, `value` and `qualifier` (`variables`, `conditions`, `side`, `when`). The model types come from the `value-card-model` peer as TYPES ONLY: the unit's source imports no code from it.

## What this is not

- Not the graph. No SVG, no drag, no popovers, no CSS: the `value-graph` unit draws.
- Not the model. Reading and writing a Value is `value-card-model`.
- Not a date picker. `parseDate` is the graph's own reading of a level's stored date, and the year rule is `date-rules`.
- Not locale-aware: `formatDay` and the tick labels use fixed English month names and UTC days.

## How to take it

Package: `@kaigilb/gilbplatformcode-value-graph-geometry`

Take it with its peers `date-rules` and `value-card-model` (and the peers of `value-card-model`: `plan-card-facts`, `qualifier-values`, `type-key`). Put this line in your app's own `.npmrc` so they are installed as copies and not links (one copy of each):

```
install-links=true
```

Then install them together:

```sh
npm install <path-to-the-library>/units/date-rules <path-to-the-library>/units/plan-card-facts <path-to-the-library>/units/qualifier-values <path-to-the-library>/units/type-key <path-to-the-library>/units/value-card-model <path-to-the-library>/units/value-graph-geometry
```

The package ships TypeScript source (`src/`); your bundler compiles it. This unit's own tests also use `value-card-model` at run time (one test builds levels with its reader); the unit's source needs it for types only.

## Examples

```ts
import { buildAxis, dateAxis, dateRange, niceDateTicks, parseDate, seriesPath, arrowBands, groupLevels } from "@kaigilb/gilbplatformcode-value-graph-geometry";

// The Arrow: one axis over the plot width, then the bands of one row.
const axis = buildAxis(data.levels.map((l) => l.value ?? NaN), data.scale.direction, 40, 760);
const bands = arrowBands(data.scale.direction, goalValues, tolerableValues, axis);

// The Timeline: the date range, its axis and its ticks.
const range = dateRange(data.levels.map((l) => parseDate(l.qualifier.when)).filter((t): t is number => t !== null), Date.now());
const x = dateAxis(range.min, range.max, 60, 560);
const ticks = niceDateTicks(range.min, range.max, Math.floor(500 / 110));

// One row per qualifier set.
const sets = groupLevels(data);
```

## What the host must supply

- A `ValueCardData` (from `value-card-model`) for the functions that take one (`groupLevels`, `groupKey`, `groupLabel`, `allWhole`), or plain numbers and `{ kind, t, v }` rows for the rest.
- The clock: `dateRange` takes `today` as ms (UTC midnight); nothing here reads the time.
- The pixel sizes: `buildAxis`, `dateAxis` and `staggerRows` take them.

## Do not

- Do not install a second copy of `date-rules`: the year rule must be one rule.
- Do not pass local-time ms where UTC-midnight ms is meant: `parseDate`, `isoDay`, `formatDay` and the ticks are all UTC.
- Do not read `Axis.min` and `Axis.max` as the data's range: they are padded and rounded outward to the tick step.
- Do not use `textWidth` as a measurement: it is `length * size * 0.58`, a rough guess.

## Wrong readings

- "The axis of `[0, 100]` ends at 100." It ends at 120: 10% is added on each side and the end is rounded up to the tick step of 20. The start stays at 0 because no value is negative.
- "`buildAxis([-10, -2])` ends at 0." It ends at negative zero (`-0`).
- "`parseDate` takes any year." Only 1900 to 2200; `0202` is no date. It trims its input, and a time of day (`2026-10-27 10:00`) is no date.
- "`snapDate` always snaps to the day." Above a visible span of 2 years (`WEEK_SNAP_SPAN`) it snaps to the nearest Monday.
- "`groupKey` holds the date." It does not: the same choices, conditions and side with two dates are one set. Conditions are compared trimmed, case-folded and sorted.
- "A Tolerable is always on the series line." It is on the line only when the Status (else the last Past) is worse than it.
- "`staggerRows` returns rows in sorted order." It returns one row per input, in INPUT order, though it places marks left to right.
- "`formatDay` follows the locale." It is fixed English, in UTC.

## Where it came from

GilbApp (private repo KaiGilb/GilbApp), commit `8a21f04ede18ee6cb1caeb91ce3adfdc0aea21dd`: `src/components/records/PlanValueGraph.geometry.ts` (whole, 584 lines) to `src/geometry.ts`. Comments made generic (tags of internal projects, review rounds and people removed). Code verbatim except:

- the one import, `import type { ScaleDirection, ValueCardData, ValueLevel } from "../../lib/base/planValueModel"`, is now `from "@kaigilb/gilbplatformcode-value-card-model"`;
- the block `MIN_YEAR`, `MAX_YEAR`, `YEAR_RANGE_SENTENCE`, `yearOutOfRange` (lines 184-195, with their doc comments) is replaced by `import { MAX_YEAR, MIN_YEAR, YEAR_RANGE_SENTENCE, yearOutOfRange } from "@kaigilb/gilbplatformcode-date-rules"` and `export { MAX_YEAR, MIN_YEAR, YEAR_RANGE_SENTENCE, yearOutOfRange };`, so the export list is the source's. The block was compared with `units/date-rules/src/dateRules.ts` (comments stripped) and is identical.

`src/index.ts` is new. This unit's `tsconfig.json` leaves `noUncheckedIndexedAccess` off: the source (`levels[i].kind`) and its tests index arrays without a check, and the `value-card-model` source it type-checks through its peer needs it off too.

The tests are ported from `src/components/records/PlanValueGraph.bands.vaultit.test.ts` and `PlanValueGraph.timeline.v26.test.ts` (all cases), and the geometry cases of `src/lib/base/planValue.qaFixes.vaultit.test.ts` (`buildAxis`) and `planValue.qualifierShape.v35.test.ts` (`groupLevels`), with person names made generic. `src/exports.test.ts` is new and pins every other export.
