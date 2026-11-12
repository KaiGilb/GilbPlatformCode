import { patchRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { entityIdTail } from "@kaigilb/gilbplatformcode-photo-ref";

/** The record a picture is linked to: its id, its own address (null when unknown) and the ETag it was read at (null sends no If-Match). */
export interface RecordRef {
  id: string;
  entity: string | null;
  etag: string | null;
}

/**
 * The merge patch that sets (`master`) or clears (`null`) the record's picture fact. It writes the `{"@id": master}` form only
 * (the same form picture-set writes for `transcodedFrom`). A `null` member deletes the fact (JSON merge patch). The fact's name is the
 * caller's: this unit holds no term.
 */
export function pictureLinkPatch(fact: string, master: string | null): Record<string, { "@id": string } | null> {
  return { [fact]: master ? { "@id": master } : null };
}

const addressOf = (v: unknown): string | null => {
  if (typeof v === "string") return v === "" ? null : v;
  if (v && typeof v === "object" && !Array.isArray(v)) {
    const id = (v as Record<string, unknown>)["@id"];
    return typeof id === "string" && id !== "" ? id : null;
  }
  return null;
};

/**
 * The picture address a record's facts hold under `fact`, in any form a vault serves: a plain string, `{"@id": x}`, or a list (the first
 * item that reads). Under the bare key `fact` or the `a:` spelling `a:<fact>`; the bare key wins when both are there. An empty string, a
 * non-string and a missing fact are null.
 */
export function pictureOfFacts(facts: Record<string, unknown> | undefined, fact: string): string | null {
  if (!facts) return null;
  const pick = (v: unknown): string | null => {
    if (Array.isArray(v)) {
      for (const item of v) {
        const a = addressOf(item);
        if (a !== null) return a;
      }
      return null;
    }
    return addressOf(v);
  };
  const bare = facts[fact];
  if (bare !== undefined) return pick(bare);
  return pick(facts[`a:${fact}`]);
}

/** The vault answered the write, but the record does not hold the picture link that was sent. The record itself is as it was read. */
export class PictureLinkNotKeptError extends Error {
  readonly record: RecordRef;
  constructor(record: RecordRef) {
    super("The vault did not keep the picture link. The picture was not attached to the record.");
    this.name = "PictureLinkNotKeptError";
    this.record = record;
  }
}

/** The two calls {@link linkPicture} makes, replaceable for a test or a host with its own transport. They default to lws-records'. */
export interface LinkCalls {
  patch?: typeof patchRecord;
  read?: typeof readRecord;
}

/**
 * Sets (`master`) or clears (`null`) the record's picture fact with PATCH (If-Match: `rec.etag` when it is not null), then reads the record
 * back and checks the link stuck: the address read back must be `master` (compared by file id tail, so `/base/e/` and `/vault/e/` spellings
 * of one file are equal), or none when clearing. Answers the ETag and picture address as read back.
 *
 * @throws RecordConflictError (lws-records', unchanged) when the ETag is stale, and every other error `patchRecord` throws, unchanged;
 * PictureLinkNotKeptError when the read-back does not hold the link.
 */
export async function linkPicture(
  rec: RecordRef,
  fact: string,
  master: string | null,
  o: LinkCalls = {},
): Promise<{ etag: string | null; picture: string | null }> {
  const patch = o.patch ?? patchRecord;
  const read = o.read ?? readRecord;
  await patch(rec.id, pictureLinkPatch(fact, master), rec.entity, undefined, { ifMatch: rec.etag });
  const back = await read(rec.id, rec.entity);
  const picture = back ? pictureOfFacts((back.served?.facts as Record<string, unknown> | undefined) ?? back.facts, fact) : null;
  const kept = master === null ? picture === null : picture !== null && entityIdTail(picture) === entityIdTail(master);
  if (!kept) throw new PictureLinkNotKeptError(rec);
  return { etag: back?.etag ?? null, picture };
}
