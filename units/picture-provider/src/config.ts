// The picture service's configuration: the base address, the key, the output hosts and the listed price per model.
// Every value comes from the host app (its variables, its secret store); nothing here is a default.
//
// Off (with one sentence saying why, and never the key) when the base is empty or not a plain https address, the key
// is missing or unusable, no output host is listed, or the model has no listed price. No price, no call.
import { MIN_SECRET_LENGTH } from "./redact.js";

/** The configuration as the host app holds it, by the names Social's worker uses. */
export interface PictureEnv { WAVESPEED_API_BASE?: string; WAVESPEED_API_KEY?: string; PICTURE_OUTPUT_HOSTS?: string; PICTURE_PRICES?: string }

/** The listed price of one picture on one model: a decimal string and an ISO 4217 code. */
export interface PicturePrice { amount: string; currency: string }

/**
 * The base as ONE form: https, no user name, password, query or hash, no trailing slash. Null when it is not one.
 *
 * @param raw the configured base
 */
export function waveSpeedBaseOf(raw: string | undefined): string | null {
  try {
    const u = new URL((raw ?? "").trim());
    if (u.protocol !== "https:" || u.username || u.password || u.search || u.hash) return null;
    return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

/**
 * Why a key cannot be used, or null when it can. Never contains the key.
 *
 * @param key the configured key
 */
export function pictureKeyProblem(key: unknown): string | null {
  if (typeof key !== "string" || key.length === 0) return "is not set";
  if (key.length < MIN_SECRET_LENGTH) return `is shorter than ${MIN_SECRET_LENGTH} characters`;
  if (!/^[\x21-\x7e]+$/.test(key)) return "contains a space, a line break or a non-ASCII character";
  return null;
}
/** The key when it is usable, else undefined (so a redactor never throws on it). */
export const usablePictureKey = (key: string | undefined): string | undefined => (pictureKeyProblem(key) === null ? key : undefined);

const HOST = /^[a-z0-9]([a-z0-9.-]{0,251}[a-z0-9])?(:\d{1,5})?$/;
/**
 * The output hosts: lower-case host[:port] entries, comma separated. An entry that is not one is dropped and counted.
 *
 * @param raw the configured list
 */
export function parseOutputHosts(raw: string | undefined): { hosts: string[]; dropped: number } {
  const hosts: string[] = [];
  let dropped = 0;
  for (const part of (raw ?? "").split(",")) {
    const h = part.trim().toLowerCase().replace(/\.$/, "");
    if (!h) continue;
    if (HOST.test(h)) hosts.push(h);
    else dropped++;
  }
  return { hosts: [...new Set(hosts)], dropped };
}

const AMOUNT = /^\d{1,6}(\.\d{1,6})?$/;
const CURRENCY = /^[A-Z]{3}$/;
/**
 * The listed price of a model, or null (absent, not JSON, or not exactly {"amount": decimal string, "currency": "XXX"}).
 *
 * @param raw JSON `{"<modelId>": {"amount": "0.003", "currency": "USD"}}`
 * @param modelId the model asked for
 */
export function priceOf(raw: string | undefined, modelId: string): PicturePrice | null {
  try {
    const j = JSON.parse((raw ?? "").trim()) as unknown;
    if (!j || typeof j !== "object" || Array.isArray(j) || !Object.prototype.hasOwnProperty.call(j, modelId)) return null;
    const p = (j as Record<string, unknown>)[modelId] as { amount?: unknown; currency?: unknown } | null;
    if (!p || typeof p !== "object" || typeof p.amount !== "string" || !AMOUNT.test(p.amount) || typeof p.currency !== "string" || !CURRENCY.test(p.currency)) return null;
    return { amount: p.amount, currency: p.currency };
  } catch {
    return null;
  }
}

export type PictureConfig =
  | { on: true; apiBase: string; apiKey: string; outputHosts: string[]; price: PicturePrice }
  | { on: false; why: string };

/**
 * Whether the picture path is on for a model, and with what.
 *
 * @param env the host app's configuration
 * @param modelId the model asked for
 */
export function pictureConfig(env: PictureEnv, modelId: string): PictureConfig {
  const apiBase = waveSpeedBaseOf(env.WAVESPEED_API_BASE);
  if (!apiBase) return { on: false, why: "WAVESPEED_API_BASE is empty or not a plain https address: pictures are off" };
  const keyWhy = pictureKeyProblem(env.WAVESPEED_API_KEY);
  if (keyWhy) return { on: false, why: `WAVESPEED_API_KEY ${keyWhy}: pictures are off` };
  const { hosts } = parseOutputHosts(env.PICTURE_OUTPUT_HOSTS);
  if (!hosts.length) return { on: false, why: "PICTURE_OUTPUT_HOSTS names no host a picture may be fetched from: pictures are off" };
  const price = priceOf(env.PICTURE_PRICES, modelId);
  if (!price) return { on: false, why: "PICTURE_PRICES has no valid price for this model: no price, no call" };
  return { on: true, apiBase, apiKey: env.WAVESPEED_API_KEY as string, outputHosts: hosts, price };
}
