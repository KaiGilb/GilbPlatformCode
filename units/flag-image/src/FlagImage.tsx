/**
 * A country's flag, or the neutral globe. The picture is READ once from the geo catalogue and kept on the device (`flag-source`);
 * when the country has none, or the read fails, or no country is given, this draws a neutral globe and nothing breaks. No flag is
 * held in this unit. It is an `<img>` of the SVG's data address, so a picture can run no script.
 */
import { useEffect, useState } from "react";
import { countryNameFromCode, flagDataUrl } from "@kaigilb/gilbplatformcode-flag-choice";
import { readFlag, type CountryFlag } from "@kaigilb/gilbplatformcode-flag-source";

/** The flag of a country (`undefined` while it is read, `null` when there is none). */
export function useFlag(country: string | null): CountryFlag | null | undefined {
  const [got, setGot] = useState<{ country: string | null; flag: CountryFlag | null } | null>(null);
  useEffect(() => {
    let live = true;
    void readFlag(country).then((flag) => {
      if (live) setGot({ country, flag });
    });
    return () => {
      live = false;
    };
  }, [country]);
  if (country === null || country === "") return null;
  return got && got.country === country ? got.flag : undefined;
}

/** The neutral globe: no country, no flag held, or a flag that could not be read. */
export function Globe({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={["size-5 shrink-0", className].filter(Boolean).join(" ")}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      // The globe is decoration, so a screen reader does not say "No flag" before
      // the country or language name beside it.
      aria-hidden="true"
      focusable="false"
      data-testid="flag-image"
      data-flag-state="globe"
    >
      <circle cx="12" cy="12" r="9" />
      <ellipse cx="12" cy="12" rx="4" ry="9" />
      <path d="M3 12h18M4.5 7.5h15M4.5 16.5h15" />
    </svg>
  );
}

export function FlagImage({ country, className = "" }: { country: string | null; className?: string }) {
  const flag = useFlag(country);
  if (!flag) return <Globe className={className} />;
  const name = countryNameFromCode(flag.code);
  return (
    <img
      src={flagDataUrl(flag.svg)}
      alt={name ? `Flag of ${name}` : "Flag"}
      className={["h-4 w-[22px] shrink-0 rounded-[2px] border border-[var(--line)] object-cover", className].filter(Boolean).join(" ")}
      data-testid="flag-image"
      data-flag-state="flag"
      data-flag-country={country ?? undefined}
    />
  );
}
