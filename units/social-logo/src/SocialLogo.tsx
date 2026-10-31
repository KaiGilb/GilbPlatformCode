// A small platform logo for a Social (online account) row, drawn from local data (`socialLogos.ts`):
// no icon font, no image file, no network call. The same size (18 px) and the same place (in front of the row's
// platform name) wherever a Social row is drawn.
//
// The colour is the surrounding text colour (`currentColor`), so the logo is monochrome in either theme; the
// call site passes the colour class its app uses for a row's sub-label.
// Accessible: an image named "<Platform> logo" ("Web address logo" for the plain globe, which stands for a site
// that is not a known platform).
import { SOCIAL_LOGOS } from "./socialLogos";

export function SocialLogo({ platform, className = "" }: { platform: string | null; className?: string }) {
  const shape = platform ? SOCIAL_LOGOS[platform] : undefined;
  const name = shape && platform ? platform : "Web address";
  const cls = ["inline-block size-[18px] shrink-0", className].filter(Boolean).join(" ");
  const common = { role: "img", "aria-label": `${name} logo`, className: cls, "data-social-logo": shape && platform ? platform : "web" } as const;
  if (shape?.kind === "glyph") {
    return (
      <svg {...common} viewBox={shape.viewBox} fill="currentColor">
        <path transform="scale(1 -1)" d={shape.d} />
      </svg>
    );
  }
  if (shape?.kind === "mark") {
    return (
      <svg {...common} viewBox={shape.viewBox} fill="currentColor">
        <path d={shape.d} />
      </svg>
    );
  }
  if (shape?.kind === "monogram") {
    return (
      <svg {...common} viewBox="0 0 24 24">
        <rect x="2" y="2" width="20" height="20" rx="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <text x="12" y="15.4" textAnchor="middle" fontSize="9.5" fontWeight="700" fill="currentColor" fontFamily="system-ui, sans-serif">
          {shape.text}
        </text>
      </svg>
    );
  }
  return (
    <svg {...common} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18" />
    </svg>
  );
}
