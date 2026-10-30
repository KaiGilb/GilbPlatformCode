import { vaultOriginOf } from "@kaigilb/gilbplatformcode-vault-origin-rule";
import { dpopWriteAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import {
  idFromResourceUrl,
  throwForCreateStatus,
  toWireFacts,
  type RecordCreateFacts,
  type WriteSource,
} from "@kaigilb/gilbplatformcode-lws-records";

/**
 * The door that ensures a vault's own self-card: `POST /lws/vault/<vaultId>/selfcard`. It mints at a derived address, answers 201
 * (created) or 200 (the card already existed and is returned untouched), and is asked at the node that holds the vault.
 */
const LWS_VAULT_SELFCARD_URL = (vaultId: string) =>
  `${vaultOriginOf(vaultId)}/lws/vault/${encodeURIComponent(vaultId)}/selfcard`;

/**
 * POST /lws/vault/:vaultId/selfcard — ENSURE the vault's own self-card exists, and return it.
 * Idempotent by CONSTRUCTION.
 *
 * 🔴 THE DUPLICATE FIX, CLIENT HALF. ⛔ Never use {@link createRecord} for a
 * self-card. Measured on production, 2026-09-16, in a signed-in test —
 * the vault `viviantesterstestvaultchild` held TWO records of the same name, with `Last changed`
 * 12:47 AM and 12:59 AM, i.e. two persisted entities rather than one rendered twice.
 *
 * `createRecord` posts to `/lws/vault/<vaultId>/c`, which is non-idempotent BY CONTRACT: Base's
 * `lwsCreate` stamps the minted URI into the fact set so two identical bodies cannot collide on
 * the identity hash. Guarding it with a read-then-write discovery cannot fix that, and the
 * guard this replaces did not even try to — a failed discovery read was caught and turned into
 * `profileId = null`, which is indistinguishable from "no card yet" and licensed another create.
 * Base measured the same failure shape from the other side: 14 excess self-cards across four
 * vaults on M1 2026-09-11, two of them minted 22 MICROSECONDS apart, which no read-then-write
 * guard can win.
 *
 * ⇒ idempotency lives in the ADDRESS, server-side. Base derives it as a pure function of the
 * vault id (`src/lws/self-card-address.ts`), so every caller converges on one entity.
 *
 * ⚠ 200 IS A SUCCESS, NOT A FAILURE. 201 = created; 200 = the card already existed and was
 * returned UNTOUCHED — Base deliberately does not overwrite it, because `ingestState` is a
 * full-state write and re-asserting a partial body would RETRACT the person's phone, skills and
 * employment. Treating 200 as a failure here would re-introduce the duplicate from the other
 * end: the caller would retry believing it had no card. The same reason is why this function
 * reports `adopted` rather than swallowing the distinction.
 *
 * @returns the card's id, its ETag, and whether it was adopted (200) rather than created (201)
 */
export async function ensureSelfCardRecord(
  vaultNamespace: string,
  typeUriValue: string,
  facts: RecordCreateFacts,
  /** Where these slugs came from; omit for app-authored facts. {@link WriteSource} */
  source?: WriteSource,
): Promise<{ id: string; etag: string | null; adopted: boolean }> {
  if (!vaultNamespace) {
    throw new Error(
      "Cannot ensure a self-card: no vault partition was named. " +
        "POST /lws/vault/<vaultId>/selfcard requires the vault namespace from GET /lws/vaults.",
    );
  }
  const url = LWS_VAULT_SELFCARD_URL(vaultNamespace);
  // ⛔ NO `Slug` header, and that is not an omission. This door mints at a DERIVED address, so a
  // Slug hint could not steer it — and Base's own module records that a client-chosen Slug was
  // the hole through which a planted `t:Note` was returned as the owner's card. A Slug is a
  // hint, never an identity claim.
  const res = await fetch(url, {
    method: "POST",
    headers: {
      ...(await dpopWriteAuth("POST", url)),
      "content-type": "application/json",
    },
    body: JSON.stringify({ type: typeUriValue, facts: await toWireFacts(facts, source) }),
    // Same unload survival as createRecord — a photo save races navigation the same way.
    keepalive: true,
  });
  // ⛔ 409 SelfCardIdentityUnknown is a REFUSAL and must reach the caller as one: Base returns it
  // when a vault holds an ambiguous pile of legacy cards and no pointer says which is the
  // owner's. Unknown authorises nothing — falling back to `createRecord` here would add to
  // exactly the pile the refusal is protecting.
  if (res.status !== 200 && res.status !== 201) await throwForCreateStatus(res);
  const location = res.headers.get("location");
  const etag = res.headers.get("etag");
  const id = location
    ? idFromResourceUrl(location)
    : idFromResourceUrl(String((await res.json().catch(() => ({})))["@id"] ?? ""));
  return { id, etag, adopted: res.status === 200 };
}
