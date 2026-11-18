// WHICH ADDRESSES A PICTURE CALL MAY REACH: the public web only. Never loopback, the private LAN, carrier-grade NAT
// (a tailnet), cloud metadata or a dev rig. Lifted from Social shared/netGuard.ts (ipv4Global, ipv6Global, the local
// name endings, the host-changes test), so both apps hold one rule. Shape only, no lookup: a NAME that resolves to a
// private address is caught by the host app's own `hostCheck` where it can resolve (Node), or by its runtime (Workers).

/** IANA IPv4 Special-Purpose Address Registry entries that are NOT globally reachable, as [base, bits]. */
const V4_NOT_GLOBAL: Array<[string, number]> = [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16],
  ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.88.99.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24],
  ["203.0.113.0", 24], ["224.0.0.0", 4], ["240.0.0.0", 4]];
/** Name endings that are never the public web. */
const LOCAL_NAME = /(^|\.)(local(host)?|internal|home\.arpa|arpa|test|invalid|example)$/;

const v4num = (ip: string): number | null => {
  const p = ip.split(".");
  if (p.length !== 4 || p.some((x) => !/^\d{1,3}$/.test(x) || Number(x) > 255)) return null;
  return p.reduce((n, x) => n * 256 + Number(x), 0);
};

/**
 * Whether a dotted IPv4 address is globally reachable unicast.
 *
 * @param ip a dotted IPv4 address
 */
export function ipv4Global(ip: string): boolean {
  const n = v4num(ip);
  if (n === null) return false;
  return !V4_NOT_GLOBAL.some(([b, bits]) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(v4num(b)! / 2 ** (32 - bits)));
}

/** An IPv6 address (no brackets) as its eight 16-bit groups, or null. An embedded dotted IPv4 tail is read too. */
function v6groups(ip: string): number[] | null {
  let s = ip.toLowerCase();
  const tail = /(\d+\.\d+\.\d+\.\d+)$/.exec(s);
  if (tail) { const n = v4num(tail[1]!); if (n === null) return null; s = s.slice(0, -tail[1]!.length) + `${(n >>> 16).toString(16)}:${(n & 0xffff).toString(16)}`; }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const part = (h: string) => (h ? h.split(":") : []);
  const a = part(halves[0]!), b = halves.length === 2 ? part(halves[1]!) : [];
  const fill = halves.length === 2 ? 8 - a.length - b.length : 0;
  if (fill < 0 || (halves.length === 1 && a.length !== 8)) return null;
  const all = [...a, ...Array<string>(fill).fill("0"), ...b];
  if (all.length !== 8 || all.some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return null;
  return all.map((g) => parseInt(g, 16));
}

/**
 * Whether an IPv6 address is globally reachable unicast: inside 2000::/3, outside 2001::/23, 2001:db8::/32, 2002::/16
 * and 3fff::/20; an IPv4-mapped or well-known NAT64 address is judged by the IPv4 inside it; local-use NAT64 is never.
 *
 * @param ip an IPv6 address without brackets
 */
export function ipv6Global(ip: string): boolean {
  const g = v6groups(ip);
  if (!g) return false;
  const v4of = (hi: number, lo: number) => `${hi >>> 8}.${hi & 255}.${lo >>> 8}.${lo & 255}`;
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return ipv4Global(v4of(g[6]!, g[7]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return ipv4Global(v4of(g[6]!, g[7]!));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return false;
  if ((g[0]! & 0xe000) !== 0x2000) return false;
  if (g[0] === 0x3fff && (g[1]! & 0xf000) === 0) return false;
  if (g[0] === 0x2001 && g[1]! < 0x200) return false;
  if (g[0] === 0x2001 && g[1] === 0x0db8) return false;
  if (g[0] === 0x2002) return false;
  return true;
}

/**
 * Whether a resolved address (v4 dotted or v6) is globally reachable. For a host app's `hostCheck`.
 *
 * @param ip an address as a resolver returns it
 */
export const addressGlobal = (ip: string): boolean => (ip.includes(":") ? ipv6Global(ip) : ipv4Global(ip));

const PLAIN = /^[\x00-\x7f]*$/;
/**
 * Whether the URL parser's host is not the host as typed (look-alike or hidden characters that turn into another
 * host). An ASCII host must come back the same, lower-cased; a non-ASCII host must be NFC and NFKC, letters, marks or
 * digits only, and keep its labels.
 *
 * @param raw the address as given
 */
export function hostChanges(raw: string): boolean {
  const typed = /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/?#]*@)?(\[[^\]]*\]|[^:/?#]*)/i.exec(raw)?.[1];
  let parsed: string;
  try { parsed = new URL(raw).hostname; } catch { return false; }
  if (typed === undefined) return false;
  const low = typed.toLowerCase();
  if (PLAIN.test(typed)) return low !== parsed;
  if (typed.normalize("NFC") !== typed || typed.normalize("NFKC") !== typed) return true;
  for (const ch of typed) if (!PLAIN.test(ch) && (!/[\p{L}\p{M}\p{N}]/u.test(ch) || /\p{Default_Ignorable_Code_Point}/u.test(ch))) return true;
  const tl = low.split("."), pl = parsed.split(".");
  return tl.length !== pl.length || tl.some((l, i) => (PLAIN.test(l) ? l !== pl[i] : !pl[i]!.startsWith("xn--")));
}

/** The longest address a picture call takes. */
const URL_MAX = 8192;
/** A control, format or separator character, which no address may hold. */
const UNSEEN = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u;

/**
 * Why a picture call may never reach this address, or null. Shape only.
 *
 * @param raw the address as given
 * @param url the address as the URL parser reads it
 */
export function addressProblem(raw: string, url: URL): string | null {
  if (raw.length > URL_MAX) return `is longer than ${URL_MAX} characters`;
  if (UNSEEN.test(raw)) return "holds a control, format or separator character";
  if (hostChanges(raw.trim())) return "has a host the URL parser reads as another host";
  if (url.protocol !== "https:") return "is not https";
  if (url.username || url.password) return "carries a user name or password";
  if (url.port !== "" && url.port !== "443") return "is on a port off the web";
  const h = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (h.startsWith("[")) return ipv6Global(h.slice(1, -1)) ? "is an IP address, not a name" : "is not a public internet address";
  if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) return ipv4Global(h) ? "is an IP address, not a name" : "is not a public internet address";
  if (!h.includes(".") || LOCAL_NAME.test(h)) return "is not a name on the public internet";
  return null;
}
