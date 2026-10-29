// What the person typed in the address field: a record's address (`<origin>/…/e/<id>`) or its id.
import { uriTail } from "@kaigilb/gilbplatformcode-id-tail";

export type Address = { ok: true; id: string; at: string | null } | { ok: false; problem: string };

export function parseAddress(text: string): Address {
  const t = text.trim();
  if (t === "") return { ok: false, problem: "Type a record's address or its id." };
  if (!t.includes("/")) return { ok: true, id: t, at: null };
  if (/^https?:\/\/[^/]+\/(?:[^?#]*\/)?e\/[^/?#]+\/?(?:[?#].*)?$/.test(t)) return { ok: true, id: uriTail(t), at: t };
  return { ok: false, problem: "That is not a record address. It looks like https://host/…/e/<id>." };
}
