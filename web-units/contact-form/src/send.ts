/**
 * Posts a JSON body to an address and resolves with the parsed answer (or undefined for an empty one).
 *
 * @param {string} url - The site's own address, for example `/api/contact`
 * @param {object} body - The JSON body to send
 * @returns {Promise<unknown>} The answer's JSON, its text if it is not JSON, or undefined if it is empty
 * @throws {Error} When the network fails or the address answers outside 2xx
 */
export async function postJson(url: string, body: unknown): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify(body),
  });
  // Same as Nuxt's $fetch, which the starter used: any status outside 2xx is a failure.
  if (!res.ok) throw new Error(`${url} answered ${res.status}`);
  const text = await res.text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
