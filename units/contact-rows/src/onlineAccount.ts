/**
 * The online-account check (it is a web address) and the platform labels (about 30, like LinkedIn and X).
 *
 * ⚠ The platform table below is DATA typed into this file, against the rule of no hard coding for
 * fields — the ontology has no online-platform terms yet. It lives here, in ONE place, so it can move to
 * the master (e.g. a platform term carrying its host patterns and label) without touching callers.
 */

/** A web address: optional http(s) scheme, a host with at least one ".", no spaces. */
const URL_FORMAT = /^(https?:\/\/)?([^\s/?#@]+\.)+[^\s/?#@.]{2,}([/?#][^\s]*)?$/i;

export function isWebAddress(value: string): boolean {
  return URL_FORMAT.test(value.trim());
}

/** The stored form: a full link (https:// added when the person typed none). */
export function normalizeWebAddress(value: string): string {
  const t = value.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
}

export const WEB_ADDRESS_HINT = "That is not a web address. Use e.g. linkedin.com/in/name.";

/** host (without www.) → the platform's name. A host matches itself and its sub-domains. */
const PLATFORMS: readonly [host: string, label: string][] = [
  ["linkedin.com", "LinkedIn"],
  ["x.com", "X"],
  ["twitter.com", "X"],
  ["facebook.com", "Facebook"],
  ["fb.com", "Facebook"],
  ["instagram.com", "Instagram"],
  ["youtube.com", "YouTube"],
  ["youtu.be", "YouTube"],
  ["tiktok.com", "TikTok"],
  ["github.com", "GitHub"],
  ["gitlab.com", "GitLab"],
  ["threads.net", "Threads"],
  ["bsky.app", "Bluesky"],
  ["reddit.com", "Reddit"],
  ["pinterest.com", "Pinterest"],
  ["snapchat.com", "Snapchat"],
  ["t.me", "Telegram"],
  ["telegram.me", "Telegram"],
  ["wa.me", "WhatsApp"],
  ["discord.com", "Discord"],
  ["discord.gg", "Discord"],
  ["twitch.tv", "Twitch"],
  ["medium.com", "Medium"],
  ["substack.com", "Substack"],
  ["behance.net", "Behance"],
  ["dribbble.com", "Dribbble"],
  ["stackoverflow.com", "Stack Overflow"],
  ["vimeo.com", "Vimeo"],
  ["soundcloud.com", "SoundCloud"],
  ["spotify.com", "Spotify"],
  ["flickr.com", "Flickr"],
  ["tumblr.com", "Tumblr"],
  ["quora.com", "Quora"],
  ["researchgate.net", "ResearchGate"],
  ["orcid.org", "ORCID"],
  ["scholar.google.com", "Google Scholar"],
  ["xing.com", "XING"],
  ["vk.com", "VK"],
  ["weibo.com", "Weibo"],
  ["mastodon.social", "Mastodon"],
];

/** Every platform name `platformOf` can return, once each (the logo table in `socialLogos.ts` must hold them all). */
export const PLATFORM_LABELS: readonly string[] = [...new Set(PLATFORMS.map(([, label]) => label))];

/** The platform's name for a web address, or null when it is not a known platform. */
export function platformOf(value: string): string | null {
  const t = value.trim();
  if (!t) return null;
  let host: string;
  try {
    host = new URL(normalizeWebAddress(t)).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
  for (const [h, label] of PLATFORMS) if (host === h || host.endsWith(`.${h}`)) return label;
  return null;
}
