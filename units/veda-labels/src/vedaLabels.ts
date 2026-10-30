// Progressive BaseVeda label overlay. Wire types and slugs stay anchored in the record types table. This loads the live
// a:label from GET /base/t/:Type and GET /base/a/:slug when the platform origin can serve them.

import { baseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { bearerHeaderFor } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { termDocLabel } from "@kaigilb/gilbplatformcode-term-slots";

const typeCache = new Map<string, string>();
const attrCache = new Map<string, string>();
/** Each term's one answer for the session (or its request in flight), by bare name. */
const typeAnswers = new Map<string, Promise<string | null>>();
const attrAnswers = new Map<string, Promise<string | null>>();

async function authHeaders(url: string): Promise<Record<string, string>> {
  try {
    return { ...(await bearerHeaderFor(url)), accept: "application/ld+json, application/json" };
  } catch {
    return { accept: "application/ld+json, application/json" };
  }
}

/** ⚠ The label is read by `term-slots`' `termDocLabel`, the one rule for it. This file
 *  fetches the signed-in origin's document; `term-slots`' `attributeLabel` fetches the master's, beside the
 *  spelling — see there for why the two fetches stay separate. */
function pickLabel(doc: Record<string, unknown>): string | null {
  return termDocLabel(doc);
}

/** Best-effort type term label (`NoteDocument` → live a:label). */
export async function fetchTermLabel(typeName: string): Promise<string | null> {
  const key = typeName.replace(/^t:/, "").replace(/.*\//, "");
  if (typeCache.has(key)) return typeCache.get(key)!;
  return onceForSession(typeAnswers, key, `${baseOrigin()}/base/t/${encodeURIComponent(key)}`, typeCache);
}

/** Best-effort attribute term label (`taskStatus` → live a:label). */
export async function fetchAttributeLabel(slug: string): Promise<string | null> {
  const key = slug.replace(/^a:/, "");
  if (attrCache.has(key)) return attrCache.get(key)!;
  return onceForSession(attrAnswers, key, `${baseOrigin()}/base/a/${encodeURIComponent(key)}`, attrCache);
}

/**
 * A term's label is asked ONCE per session. Callers asking at the same time share the one request (the
 * rows of a list mount together; a grid of five rows of one type once sent `/base/t/Person` five times). A definite answer is kept: a
 * label, or a 4xx (the term has no label to give). A failure to ask (network error, 5xx) is not kept, so a later caller asks again.
 *
 * @param answers the kept answers and requests in flight, by key
 * @param key the bare term name
 * @param url where its document is read
 * @param labels the label cache the synchronous readers of this module use
 */
function onceForSession(answers: Map<string, Promise<string | null>>, key: string, url: string, labels: Map<string, string>): Promise<string | null> {
  const kept = answers.get(key);
  if (kept) return kept;
  const asked = (async (): Promise<string | null> => {
    const res = await fetch(url, { headers: await authHeaders(url) });
    if (res.status >= 400 && res.status < 500) return null;
    if (!res.ok) throw new Error(`term ${res.status}`);
    const label = pickLabel((await res.json()) as Record<string, unknown>);
    if (label) labels.set(key, label);
    return label;
  })();
  const answer = asked.catch(() => {
    answers.delete(key);
    return null;
  });
  answers.set(key, answer);
  return answer;
}

/**
 * Prefetch labels for a set of type names + attribute slugs (e.g. open detail).
 * Returns maps for callers that want to re-render with ontology phrases.
 */
export async function prefetchVedaLabels(opts: {
  types?: readonly string[];
  attrs?: readonly string[];
}): Promise<{ types: Map<string, string>; attrs: Map<string, string> }> {
  const types = new Map<string, string>();
  const attrs = new Map<string, string>();
  await Promise.all([
    ...(opts.types ?? []).map(async (t) => {
      const l = await fetchTermLabel(t);
      if (l) types.set(t, l);
    }),
    ...(opts.attrs ?? []).map(async (a) => {
      const l = await fetchAttributeLabel(a);
      if (l) attrs.set(a, l);
    }),
  ]);
  return { types, attrs };
}
