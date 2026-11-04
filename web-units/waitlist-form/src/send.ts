/**
 * Posts a JSON body and resolves `true` when the address answers 2xx. Any other status, or a network
 * failure, throws. A host that needs a falsy JSON body to count as "not sent" passes its own `send`.
 *
 * @param url - the site's own address, for example `/api/waitlist`
 * @param body - the JSON body
 * @returns `true` when the address answers 2xx
 * @throws {Error} when the network fails or the address answers outside 2xx
 */
export async function postJson(url: string, body: unknown): Promise<true> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  return true;
}
