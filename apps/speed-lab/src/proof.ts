// The meter comes from `units/speed-meter`, with Speed Lab's options (routes, answeredRoutes, globalKey "__speedProof").
// `maxLog` is unbounded on purpose: the old `proof.log` had no cap.
import { createSpeedMeter, installProofHooks as installHooks, startLine, type LastPaint, type PaintSource, type SpeedReading, type StartReading } from "@kaigilb/gilbplatformcode-speed-meter";
export type { LastPaint, PaintSource, StartReading };
export { startLine };
export const meter = createSpeedMeter({ routes: ["records", "patch", "other"], answeredRoutes: ["records", "patch"], globalKey: "__speedProof", maxLog: Number.POSITIVE_INFINITY });
export type SpeedProof = SpeedReading;
export const proof: SpeedProof = meter.reading;
export const subscribePaint = meter.subscribe;
export const getPaint = meter.getPaint;  export const setPaint = meter.setPaint;
export const getStart = meter.getStart;  export const setStart = meter.setStart;
export function installProofHooks(search: string, target: object, clearCache: () => void): void {
  installHooks(search, target, { clearCache }, "__speedProofHooks");
}
