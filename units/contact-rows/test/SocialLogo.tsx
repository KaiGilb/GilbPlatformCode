// A test double for the app's SocialLogo (src/components/mynet/SocialLogo.tsx): the same role, name and data attribute, with a plain mark instead of the
// logo table's drawings. `socialPlatformName` is the app's (src/lib/base/socialLogos.ts lines 66-73) over the platforms `platformOf` can name.
import { PLATFORM_LABELS } from "../src/onlineAccount";

/** The platforms the app's logo table holds: every name `platformOf` can return (the table is checked against that list in the app). */
const KNOWN = new Set<string>(PLATFORM_LABELS);

export function SocialLogo({ platform, className = "" }: { platform: string | null; className?: string }) {
  const known = platform !== null && KNOWN.has(platform);
  const name = known ? platform : "Web address";
  return <svg role="img" aria-label={`${name} logo`} className={className} data-social-logo={known ? platform : "web"} />;
}

export function socialPlatformName(platformOfValue: string | null, label: string): string | null {
  if (platformOfValue) return platformOfValue;
  const l = label.trim();
  return l && KNOWN.has(l) ? l : null;
}
