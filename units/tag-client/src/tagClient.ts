// Reads the main tag of many records of one vault from the platform's batch route, and says plainly when the platform has no tag routes.
//
// The tag of a record is the platform's: it makes one when the record is created, and this unit only reads it.
//   POST /base/tag/masters  { vault, targetEntities: [≤ 50] } -> { masterTags: [{ targetEntity, tagString|null, tagKnown, tagUnknownReason? }] }
// The route is requested on the platform client's origin. A platform that has not shipped the routes answers Fastify's own 404
// (`Route … not found`); that is a `NoTagRoutesError`, never a silent fall back to another way of working a tag out.
import { expectStatus, PlatformError, request, routeUrl, type PlatformAnswer, type PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

/** The words of a platform that does not have the tag routes. */
export const NO_TAG_ROUTES_SENTENCE = "This platform does not make tags yet";
/** The platform's cap on one batch master read. */
export const MASTERS_BATCH_MAX = 50;

/** The platform has none of the tag routes this package needs (Fastify's own 404 for an unregistered route). */
export class NoTagRoutesError extends PlatformError {
  /** Set by `createRecord` when the record WAS created and the platform then turned out to have no tag routes: what exists. */
  created?: { record: string; written: string[]; vaultId: string };
  constructor(answer: { url: string; status: number; text: string }) {
    super(NO_TAG_ROUTES_SENTENCE, answer.status, answer.url, answer.text);
    this.name = "NoTagRoutesError";
  }
}

/** Fastify's own 404 for a route that is not registered, as against an entity 404 (`NotFound` / "No resource at"). */
export function isRouteMissing(answer: Pick<PlatformAnswer, "status" | "json" | "text">): boolean {
  if (answer.status !== 404) return false;
  const message = answer.json && typeof answer.json.message === "string" ? answer.json.message : answer.text;
  return /^Route\s+\S+\s+not found/.test(message.trim());
}

const asObject = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** One record's main tag as the batch read answers it. */
export type MainTagRead = { tag: string; known: true } | { tag: null; known: boolean; reason?: string };

/**
 * POST /base/tag/masters, in chunks of {@link MASTERS_BATCH_MAX}: the main tags of many records of ONE vault. 120 records are 3 calls.
 * @param vault the vault the records live in (its `vaultId`)
 */
export async function readMainTags(platform: PlatformClient, vault: string, records: readonly string[]): Promise<Map<string, MainTagRead>> {
  const out = new Map<string, MainTagRead>();
  const url = routeUrl(platform, "base/tag/masters");
  for (let i = 0; i < records.length; i += MASTERS_BATCH_MAX) {
    const chunk = records.slice(i, i + MASTERS_BATCH_MAX);
    const answer = await request(platform, "POST", url, { vault, targetEntities: chunk });
    if (isRouteMissing(answer)) throw new NoTagRoutesError(answer);
    expectStatus(answer, "POST", [200]);
    const rows = answer.json?.masterTags;
    if (!Array.isArray(rows)) throw new PlatformError(`POST ${url} served no masterTags`, answer.status, url, answer.text);
    for (const r of rows) {
      const o = asObject(r);
      if (typeof o.targetEntity !== "string") continue;
      const known = o.tagKnown === true;
      out.set(
        o.targetEntity,
        known && typeof o.tagString === "string" && o.tagString !== ""
          ? { tag: o.tagString, known: true }
          : { tag: null, known, ...(typeof o.tagUnknownReason === "string" ? { reason: o.tagUnknownReason } : {}) },
      );
    }
  }
  return out;
}
