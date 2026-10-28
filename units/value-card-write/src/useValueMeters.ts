// A Value's Meters and Meter lines as records. A Meter is a t:Meter record, a:partOf the Value, with
// a:meterQualifier (its name) and tag `<ValueTag>.Meter[.<Name>]`. A Meter line is a t:MeterLine record, a:partOf its Meter,
// with a:meterAgentKind, a:meterMethod, a:lineSources, a:elementOrder and tag `<MeterTag>.<Kind>`.
// Same writes as the levels: one edit = one PATCH of one record, an add = one POST, a remove = one DELETE.

import { useEffect, useMemo, useRef, useState } from "react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import { recordTag } from "@kaigilb/gilbplatformcode-plan-links-model";
import {
  isMeterLineType,
  isPartOfParent,
  isMeterType,
  levelKey,
  meterCreateFacts,
  meterIsBlank,
  meterLineCreateFacts,
  meterLineIsBlank,
  meterLinePatch,
  meterLineTag,
  meterPatch,
  meterTag,
  METER_LINE_TYPE,
  METER_TYPE,
  readMeterRecords,
  setLevelKey,
  type ValueMeter,
  type ValueMeterLine,
} from "@kaigilb/gilbplatformcode-value-card-model";
import { useValueWriteHost } from "./host";
import { planFindRows, type PlanFind } from "./planFind";
import type { ChildListHost } from "./useValueChildren";
import { createChild, endChild, endMade, endRow, MoveStopped, patchChild, rowFor, rowLabel, type ChildEnv, type ChildKind, type ParentRef } from "./valueChildRecords";

export function useValueMeters(args: {
  enabled: boolean;
  record: BaseRecord;
  vaultId: string;
  planVault: string;
  /** The Value's `a:partOf` find rows (all part types; Meter records are picked out here). */
  rows: readonly BaseRecord[];
  onNotice: (notice: string | null) => void;
  onTouched?: () => void;
}): ChildListHost<ValueMeter> & { lineRows: readonly BaseRecord[] } {
  const { enabled, record, vaultId, planVault, rows, onNotice } = args;
  const host = useValueWriteHost();
  const del = host.useDeleteRecord(vaultId);
  const meterRows = useMemo(
    () => (enabled ? rows.filter((r) => isMeterType(r.typeUri) && isPartOfParent(r, record.entityUri)) : []),
    [enabled, rows, record.entityUri],
  );
  // Each Meter's lines are the records that are a:partOf that Meter.
  const lineFinds = host.usePlanFinds(
    planVault,
    "a:partOf",
    meterRows.map((m) => ({ id: m.id, entityUri: m.entityUri, enabled: !!planVault && !!m.entityUri })),
  );
  const seen = useRef<{ rows: readonly BaseRecord[]; datas: unknown[]; value: ValueMeter[]; lines: BaseRecord[] } | null>(null);
  const datas = lineFinds.map((q) => q.data);
  let fromRows: ValueMeter[];
  let lineRows: BaseRecord[];
  const prevSeen = seen.current;
  if (prevSeen && prevSeen.rows === meterRows && prevSeen.datas.length === datas.length && prevSeen.datas.every((d, i) => d === datas[i])) {
    fromRows = prevSeen.value;
    lineRows = prevSeen.lines;
  } else {
    const byMeter = new Map<string, readonly BaseRecord[]>();
    meterRows.forEach((m, i) => byMeter.set(m.id, planFindRows(datas[i] as PlanFind | undefined)));
    fromRows = readMeterRecords(meterRows, (id) => byMeter.get(id) ?? [], record.entityUri ?? null);
    lineRows = meterRows.flatMap((m) => (byMeter.get(m.id) ?? []).filter((x) => isMeterLineType(x.typeUri) && isPartOfParent(x, m.entityUri)));
    seen.current = { rows: meterRows, datas, value: fromRows, lines: lineRows };
  }

  const [override, setOverride] = useState<ValueMeter[] | null>(null);
  const items = override ?? fromRows;
  const shown = useRef(items);
  shown.current = items;
  const ctx = useRef({ ...args });
  ctx.current = { ...args };
  const queue = useRef(Promise.resolve());
  const busy = useRef(0);
  const seq = useRef(0);
  const latest = useRef(new Map<string, ValueMeter>());
  const recs = useRef(new Map<string, BaseRecord>());

  const env = (): ChildEnv => ({ host, planVault, del, recs: recs.current, touched: () => ctx.current.onTouched?.() });
  const parent = (): ParentRef => {
    const uri = record.entityUri;
    if (!uri) throw new Error("This Value has no address yet, so a meter cannot be added.");
    return { id: record.id, uri };
  };
  const meterKind = (): ChildKind<ValueMeter> => ({
    noun: "meter",
    typeName: () => METER_TYPE,
    isType: isMeterType,
    tag: (m) => meterTag(recordTag(ctx.current.record.facts), m),
    createFacts: meterCreateFacts,
    patch: meterPatch,
  });
  const lineKind = (tagOfMeter: string): ChildKind<ValueMeterLine> => ({
    noun: "meter line",
    typeName: () => METER_LINE_TYPE,
    isType: isMeterLineType,
    tag: (l) => meterLineTag(tagOfMeter, l),
    createFacts: meterLineCreateFacts,
    patch: meterLinePatch,
  });
  const meterParent = (row: BaseRecord): ParentRef => {
    if (!row.entityUri) throw new Error("This meter has no address yet, so a line cannot be added.");
    return { id: row.id, uri: row.entityUri };
  };

  function run(job: () => Promise<void>) {
    busy.current += 1;
    queue.current = queue.current
      .then(job)
      .catch((e: unknown) => {
        onNotice(e instanceof Error && e.message ? e.message : "Couldn't save the meter. Your change was rolled back. Try again.");
        void host.invalidatePlanFind(planVault, "a:partOf", record.id).catch(() => {});
      })
      .then(() => {
        busy.current -= 1;
        if (busy.current === 0) setOverride(null);
      });
  }

  /** End every record that is a part of the Meter (found by `a:partOf`, readable or not), then the Meter. Stops at the first failure and says what remains. */
  async function endMeter(key: string, lineKeys: readonly string[]): Promise<void> {
    const row = rowFor(env(), record.id, key);
    if (!row) return;
    const mp = meterParent(row);
    const found = host.cachedPlanFind(planVault, "a:partOf", row.id);
    const children = new Map<string, BaseRecord>();
    for (const r of planFindRows(found)) children.set(r.id, r);
    for (const lk of lineKeys) {
      const r = rowFor(env(), mp.id, lk);
      if (r) children.set(r.id, r);
    }
    if (found && found.unread > 0) {
      throw new Error(
        `The meter was not removed. ${found.unread} of its records could not be read, so they could not be ended first. Nothing was deleted.`,
      );
    }
    const todo = [...children.values()];
    for (let i = 0; i < todo.length; i++) {
      try {
        await endRow(env(), mp.id, todo[i]!);
      } catch (e) {
        const remain = todo.slice(i).map(rowLabel);
        const why = e instanceof Error && e.message ? ` (${e.message})` : "";
        throw new Error(`The meter was not removed${why}. These records of it remain: ${remain.join(", ")}.`);
      }
    }
    await endChild(env(), parent(), key);
  }

  async function syncMeter(key: string, fallback: ValueMeter, prevLineKeys: readonly string[]): Promise<void> {
    const m = latest.current.get(key) ?? fallback;
    let row = rowFor(env(), record.id, key);
    if (row && meterIsBlank(m)) {
      await endMeter(key, [...new Set([...prevLineKeys, ...m.lines.map((l) => levelKey(l)!)])]);
      return;
    }
    if (!row) {
      if (meterIsBlank(m)) return;
      row = await createChild(env(), meterKind(), parent(), key, m);
    } else {
      await patchChild(env(), meterKind(), parent(), key, m);
      row = rowFor(env(), record.id, key) ?? row;
    }
    const mp = meterParent(row);
    const lk = lineKind(recordTag(row.facts));
    const now = new Set<string>();
    for (const line of m.lines) {
      const lkey = levelKey(line)!;
      now.add(lkey);
      const lrow = rowFor(env(), mp.id, lkey);
      if (!lrow) {
        if (!meterLineIsBlank(line)) await createChild(env(), lk, mp, lkey, line);
      } else if (meterLineIsBlank(line)) await endChild(env(), mp, lkey);
      else await patchChild(env(), lk, mp, lkey, line, { retag: true });
    }
    for (const gone of prevLineKeys) if (!now.has(gone)) await endChild(env(), mp, gone);
  }

  const lineKeysOf = (m: ValueMeter) => m.lines.map((l) => levelKey(l)).filter((k): k is string => !!k);

  function commit(next: ValueMeter[]) {
    const before = shown.current;
    const prevByKey = new Map<string, ValueMeter>();
    for (const m of before) {
      const k = levelKey(m);
      if (k) prevByKey.set(k, m);
    }
    const kept = new Set<string>();
    const out = next.map((m) => {
      if (!levelKey(m)) setLevelKey(m, `new:${++seq.current}`);
      for (const l of m.lines) if (!levelKey(l)) setLevelKey(l, `new:${++seq.current}`);
      return m;
    });
    for (const m of out) {
      const key = levelKey(m)!;
      kept.add(key);
      const prev = prevByKey.get(key);
      latest.current.set(key, m);
      if (prev === m) continue;
      const prevLineKeys = prev ? lineKeysOf(prev) : [];
      run(() => syncMeter(key, m, prevLineKeys));
    }
    for (const [key, prev] of prevByKey) {
      if (kept.has(key)) continue;
      run(() => endMeter(key, lineKeysOf(prev)));
    }
    setOverride(out);
    shown.current = out;
  }

  async function moveIn(old: readonly ValueMeter[]): Promise<{ undo: () => Promise<string[]> }> {
    await queue.current;
    let made: { parentId: string; row: BaseRecord }[] = [];
    const undo = async () => {
      const left: { parentId: string; row: BaseRecord }[] = [];
      for (const m of made.slice().reverse()) if (!(await endMade(env(), m.parentId, m.row))) left.push(m);
      made = left.reverse();
      return made.map((m) => rowLabel(m.row));
    };
    try {
      for (const m of old) {
        if (meterIsBlank(m)) continue;
        const key = `new:${++seq.current}`;
        setLevelKey(m, key);
        const row = await createChild(env(), meterKind(), parent(), key, m);
        made.push({ parentId: record.id, row });
        const mp = meterParent(row);
        const lk = lineKind(recordTag(row.facts));
        for (const line of m.lines) {
          if (meterLineIsBlank(line)) continue;
          const lkey = `new:${++seq.current}`;
          setLevelKey(line, lkey);
          made.push({ parentId: mp.id, row: await createChild(env(), lk, mp, lkey, line) });
        }
      }
    } catch (e) {
      throw new MoveStopped(e, undo);
    }
    return { undo };
  }

  useEffect(() => {
    latest.current.clear();
    recs.current.clear();
    setOverride(null);
  }, [record.id]);

  return { items, commit, moveIn, busy: override !== null, lineRows };
}
