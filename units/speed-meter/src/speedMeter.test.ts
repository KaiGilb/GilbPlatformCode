import { describe, expect, it } from "vitest";
import {
  createSpeedMeter,
  installProofHooks,
  startLine,
  type LastPaint,
  type PaintSource,
  type SpeedMeter,
  type SpeedMeterOptions,
  type SpeedReading,
  type StartReading,
  type WriteReading,
} from "./index";

function hidden(options: SpeedMeterOptions = {}): SpeedMeter {
  return createSpeedMeter({ target: {}, globalKey: null, ...options });
}

describe("createSpeedMeter", () => {
  it("exposes the Speed Lab proof shape plus writes, and reading is that object", () => {
    const target: Record<string, unknown> = {};
    const meter = createSpeedMeter({
      routes: ["records", "patch", "other"],
      answeredRoutes: ["records", "patch"],
      globalKey: "__speedProof",
      target,
    });
    // Literal initial object from apps/speed-lab/src/proof.ts, plus writes.
    const proofFromSpeedLab = { requests: { records: 0, patch: 0, other: 0 }, answered: { records: 0, patch: 0 }, log: [], lastPaint: null, start: null };
    const exposed = target.__speedProof as SpeedReading;
    expect(exposed).toEqual({ ...proofFromSpeedLab, writes: [] });
    expect(meter.reading).toBe(exposed);
    expect(Object.keys(exposed)).toEqual(["requests", "answered", "log", "lastPaint", "start", "writes"]);
    expect(Object.keys(exposed.requests)).toEqual(["records", "patch", "other"]);
    expect(Object.keys(exposed.answered)).toEqual(["records", "patch"]);
    meter.countRequest("records", "GET", "/r");
    expect(exposed.requests.records).toBe(1);
  });

  it("countRequest increments and logs, and maxLog drops the oldest", () => {
    const meter = hidden({ routes: ["records"], maxLog: 3 });
    expect(meter.reading.requests.records).toBe(0);
    meter.countRequest("records", "GET", "/1");
    meter.countRequest("records", "POST", "/2");
    meter.countRequest("fresh", "PUT", "/3");
    meter.countRequest("records", "GET", "/4");
    meter.countRequest("patch", "PATCH", "/5");
    expect(meter.reading.requests.records).toBe(3);
    expect(meter.reading.requests.fresh).toBe(1);
    expect(meter.reading.requests.patch).toBe(1);
    expect(meter.reading.log).toEqual([
      { route: "fresh", method: "PUT", url: "/3" },
      { route: "records", method: "GET", url: "/4" },
      { route: "patch", method: "PATCH", url: "/5" },
    ]);
  });

  it("countAnswered increments, and a new route appears at 1", () => {
    const meter = hidden({ routes: ["records"], answeredRoutes: ["records"] });
    expect(meter.reading.answered.records).toBe(0);
    meter.countAnswered("records");
    meter.countAnswered("records");
    meter.countAnswered("other");
    expect(meter.reading.answered.records).toBe(2);
    expect(meter.reading.answered.other).toBe(1);
    expect(meter.reading.log).toEqual([]);
  });

  it("answered routes default to the request routes", () => {
    const meter = hidden({ routes: ["records", "patch"] });
    expect(meter.reading.requests).toEqual({ records: 0, patch: 0 });
    expect(meter.reading.answered).toEqual({ records: 0, patch: 0 });
  });

  it("timePage records the first rows and the first full, rounded to 0.1", () => {
    let t = 1000;
    const meter = hidden({ now: () => t });
    const heard: string[] = [];
    meter.subscribe(() => heard.push("x"));
    const page = meter.timePage("entries");
    page.full();
    expect(meter.getPaint()).toBeNull();
    expect(heard).toEqual([]);

    t = 1123.46;
    const source: PaintSource = "memory";
    page.rows(source);
    const paint: LastPaint | null = meter.getPaint();
    expect(paint).toEqual({ page: "entries", ms: 123.5, source: "memory" });
    expect(heard).toEqual(["x"]);

    t = 1500;
    page.rows("device");
    expect(meter.getPaint()).toBe(paint);
    expect(paint).toEqual({ page: "entries", ms: 123.5, source: "memory" });
    expect(heard).toEqual(["x"]);

    t = 2000;
    page.full();
    expect(meter.getPaint()).toBe(paint);
    expect(paint).toEqual({ page: "entries", ms: 123.5, source: "memory", fullMs: 1000 });
    expect(heard).toEqual(["x", "x"]);

    t = 2400;
    page.full();
    expect(paint?.fullMs).toBe(1000);
    expect(heard).toEqual(["x", "x"]);

    t = 3000;
    const later = meter.timePage("list");
    t = 3100;
    later.rows("network");
    const own = meter.getPaint();
    expect(own).toEqual({ page: "list", ms: 100, source: "network" });
    meter.setPaint({ page: "other", ms: 4, source: "preview" });
    t = 3900;
    later.full();
    expect(meter.getPaint()).toEqual({ page: "other", ms: 4, source: "preview" });
    expect(own?.fullMs).toBeUndefined();
  });

  it("timeWrite records ms, at and ok once, and maxWrites drops the oldest", () => {
    let t = 1000;
    let at = "start";
    const meter = hidden({ now: () => t, isoNow: () => at, maxWrites: 2 });
    const stop = meter.timeWrite("save");
    t = 1123.46;
    at = "2026-11-01T00:00:00.000Z";
    stop(true);
    const first: WriteReading = { kind: "save", ms: 123.5, ok: true, at: "2026-11-01T00:00:00.000Z" };
    expect(meter.reading.writes).toEqual([first]);
    t = 1500;
    at = "later";
    stop(false);
    expect(meter.reading.writes).toEqual([first]);

    t = 2000;
    const second = meter.timeWrite("rename");
    t = 2010;
    at = "a";
    second(true);
    t = 3000;
    const third = meter.timeWrite("delete");
    t = 3030;
    at = "b";
    third(false);
    expect(meter.reading.writes).toEqual([
      { kind: "rename", ms: 10, ok: true, at: "a" },
      { kind: "delete", ms: 30, ok: false, at: "b" },
    ]);
  });

  it("keeps 500 log lines and 200 writes by default", () => {
    const meter = hidden({ now: () => 0, isoNow: () => "at" });
    for (let i = 0; i < 500; i++) meter.countRequest("r", "GET", String(i));
    expect(meter.reading.log).toHaveLength(500);
    expect(meter.reading.log[0]?.url).toBe("0");
    expect(meter.reading.log[499]?.url).toBe("499");
    meter.countRequest("r", "GET", "500");
    expect(meter.reading.log).toHaveLength(500);
    expect(meter.reading.log[0]?.url).toBe("1");
    expect(meter.reading.log[499]?.url).toBe("500");

    for (let i = 0; i < 200; i++) meter.timeWrite(`w${i}`)(true);
    expect(meter.reading.writes).toHaveLength(200);
    expect(meter.reading.writes[0]?.kind).toBe("w0");
    meter.timeWrite("w200")(false);
    expect(meter.reading.writes).toHaveLength(200);
    expect(meter.reading.writes[0]?.kind).toBe("w1");
    expect(meter.reading.writes[199]).toEqual({ kind: "w200", ms: 0, ok: false, at: "at" });
  });

  it("notifies on paint, start, page timing, writes and reset, and not on counts", () => {
    let t = 0;
    const meter = hidden({ now: () => t, isoNow: () => "at" });
    let label = "none";
    const heard: string[] = [];
    const off = meter.subscribe(() => heard.push(label));

    label = "request";
    meter.countRequest("records", "GET", "/r");
    label = "answered";
    meter.countAnswered("records");

    label = "setPaint";
    const paint: LastPaint = { page: "p", ms: 1, source: "memory" };
    meter.setPaint(paint);
    expect(meter.getPaint()).toBe(paint);
    label = "setStart";
    const start: StartReading = { disk: true, hydrated: false, ms: 1, entries: 1, at: "t" };
    meter.setStart(start);
    expect(meter.getStart()).toBe(start);

    label = "rows";
    t = 10;
    const page = meter.timePage("p");
    page.rows("preview");
    label = "rows-again";
    page.rows("network");
    label = "full";
    t = 20;
    page.full();
    label = "full-again";
    page.full();

    label = "write";
    const stop = meter.timeWrite("save");
    t = 30;
    stop(true);
    label = "write-again";
    stop(false);

    label = "reset";
    meter.reset();
    expect(heard).toEqual(["setPaint", "setStart", "rows", "full", "write", "reset"]);

    off();
    label = "after";
    meter.setPaint(null);
    meter.setStart(null);
    expect(heard).toEqual(["setPaint", "setStart", "rows", "full", "write", "reset"]);
    expect(meter.getPaint()).toBeNull();
    expect(meter.getStart()).toBeNull();
  });

  it("a throwing listener does not stop the next one or the meter", () => {
    const meter = hidden();
    const seen: string[] = [];
    meter.subscribe(() => { seen.push("a"); throw new Error("listener failed"); });
    meter.subscribe(() => { seen.push("b"); });
    const start: StartReading = { disk: true, hydrated: false, ms: 1, entries: 2, at: "t" };
    expect(() => meter.setStart(start)).not.toThrow();
    expect(seen).toEqual(["a", "b"]);
    expect(meter.getStart()).toBe(start);
  });

  it("reset keeps the same reading and restores the initial routes", () => {
    const meter = hidden({
      routes: ["records", "patch", "other"],
      answeredRoutes: ["records", "patch"],
      now: () => 1,
      isoNow: () => "at",
    });
    const reading = meter.reading;
    const requests = reading.requests;
    const answered = reading.answered;
    const log = reading.log;
    const writes = reading.writes;
    meter.countRequest("records", "GET", "/r");
    meter.countRequest("extra", "POST", "/e");
    meter.countAnswered("records");
    meter.countAnswered("extra");
    meter.setPaint({ page: "p", ms: 1, source: "network" });
    meter.setStart({ disk: true, hydrated: true, ms: 2, entries: 3, at: "t" });
    meter.timeWrite("save")(true);
    meter.reset();
    expect(meter.reading).toBe(reading);
    expect(meter.reading.requests).toBe(requests);
    expect(meter.reading.answered).toBe(answered);
    expect(meter.reading.log).toBe(log);
    expect(meter.reading.writes).toBe(writes);
    expect(meter.reading).toEqual({
      requests: { records: 0, patch: 0, other: 0 },
      answered: { records: 0, patch: 0 },
      log: [],
      lastPaint: null,
      start: null,
      writes: [],
    });
    expect(Object.keys(requests)).toEqual(["records", "patch", "other"]);
    expect(Object.keys(answered)).toEqual(["records", "patch"]);
  });

  it("globalKey null exposes nothing, and the default key is __speedMeter", () => {
    const quiet: Record<string, unknown> = { kept: 1 };
    const hiddenMeter = createSpeedMeter({ globalKey: null, target: quiet, routes: ["records"] });
    expect(quiet).toEqual({ kept: 1 });
    expect(hiddenMeter.reading.requests).toEqual({ records: 0 });
    expect(hiddenMeter.reading.answered).toEqual({ records: 0 });

    const target: Record<string, unknown> = {};
    const meter = createSpeedMeter({ target });
    expect(Object.keys(target)).toEqual(["__speedMeter"]);
    expect(target.__speedMeter).toBe(meter.reading);
    expect(meter.reading).toEqual({ requests: {}, answered: {}, log: [], lastPaint: null, start: null, writes: [] });

    const onGlobal = createSpeedMeter({ globalKey: "__speedMeterSpecDefaultTarget" });
    try {
      expect((globalThis as Record<string, unknown>).__speedMeterSpecDefaultTarget).toBe(onGlobal.reading);
    } finally {
      delete (globalThis as Record<string, unknown>).__speedMeterSpecDefaultTarget;
    }
  });

  it("two keys do not share state, and the same key replaces the exposed reading", () => {
    const target: Record<string, SpeedReading> = {};
    const a = createSpeedMeter({ globalKey: "a", target, routes: ["r"] });
    const b = createSpeedMeter({ globalKey: "b", target, routes: ["r"] });
    a.countRequest("r", "GET", "/a");
    expect(a.reading.requests.r).toBe(1);
    expect(b.reading.requests.r).toBe(0);
    expect(target.a).toBe(a.reading);
    expect(target.b).toBe(b.reading);

    const again = createSpeedMeter({ globalKey: "a", target, routes: ["r"] });
    expect(target.a).toBe(again.reading);
    expect(target.a).not.toBe(a.reading);
    again.countRequest("r", "GET", "/again");
    expect(again.reading.requests.r).toBe(1);
    expect(a.reading.requests.r).toBe(1);
    expect(target.a?.requests.r).toBe(1);
  });

  it("falls back to Date.now when performance.now is absent", () => {
    const saved = globalThis.performance;
    Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: undefined });
    try {
      const before = Date.now();
      const meter = hidden();
      meter.timePage("p").rows("memory");
      const ms = meter.getPaint()?.ms ?? -1;
      expect(ms).toBeGreaterThanOrEqual(0);
      expect(ms).toBeLessThanOrEqual(Date.now() - before + 50);
    } finally {
      Object.defineProperty(globalThis, "performance", { configurable: true, writable: true, value: saved });
    }
  });
});

describe("startLine", () => {
  it("formats disk, hydrated, entries and ms", () => {
    expect(startLine({ disk: true, hydrated: true, entries: 500, ms: 12, at: "t" })).toBe("start: disk yes, hydrated yes, 500 entries, 12 ms");
    expect(startLine({ disk: false, hydrated: false, entries: 0, ms: 3, at: "t" })).toBe("start: disk no, hydrated no, 0 entries, 3 ms");
    expect(startLine({ disk: true, hydrated: true, ms: 500, entries: 12, at: "t" })).toBe("start: disk yes, hydrated yes, 12 entries, 500 ms");
    expect(startLine({ disk: false, hydrated: false, ms: 0, entries: 3, at: "t" })).toBe("start: disk no, hydrated no, 3 entries, 0 ms");
  });
});

describe("installProofHooks", () => {
  it("sets hooks only when proofHooks=1, and a custom key works", () => {
    const hooks = { clearCache() { /* host hook */ } };
    const bare: Record<string, unknown> = {};
    installProofHooks("", bare, hooks);
    installProofHooks("?proofHooks=0", bare, hooks);
    installProofHooks("foo=1", bare, hooks);
    expect(bare).toEqual({});

    const kept: Record<string, unknown> = { __speedMeterHooks: "leave" };
    installProofHooks("no", kept, hooks);
    expect(kept.__speedMeterHooks).toBe("leave");

    const target: Record<string, unknown> = {};
    installProofHooks("?proofHooks=1", target, hooks);
    expect(target.__speedMeterHooks).toBe(hooks);

    const custom: Record<string, unknown> = {};
    installProofHooks("a=1&proofHooks=1", custom, hooks, "__myHooks");
    expect(custom.__myHooks).toBe(hooks);
    expect(custom.__speedMeterHooks).toBeUndefined();
  });
});
