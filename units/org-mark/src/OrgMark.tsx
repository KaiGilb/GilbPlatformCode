/**
 * An organization's logo as a small mark in a list (a unit, a chain entry): the logo
 * file when the record has one, else the organization's initial. Read only; the logo is a `t:ImageFile` in the
 * organization's own vault. A mark in a list is BOUNDED in size, SHARED per file and POOLED (`orgLogo.ts`).
 */
import { useEffect, useState } from "react";
import { loadOrgLogoBlob } from "./orgLogo";
import { useOrgMarkHost } from "./orgMarkHost";

export function OrgMark({ logo, vaultId, name, size = 32 }: { logo: string | null; vaultId: string | null; name: string; size?: number }) {
  const host = useOrgMarkHost();
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    let made: string | null = null;
    setUrl(null);
    if (!logo || !vaultId) return;
    void loadOrgLogoBlob(host, logo, vaultId).then((blob) => {
      if (!alive || !blob) return;
      made = URL.createObjectURL(blob);
      setUrl(made);
    });
    return () => {
      alive = false;
      if (made) URL.revokeObjectURL(made);
    };
  }, [logo, vaultId]);
  const initial = (name.trim().charAt(0) || "?").toUpperCase();
  return (
    <span
      className="relative grid shrink-0 place-items-center overflow-hidden rounded-md border border-[var(--line)] bg-[var(--surface-sunken)] text-[13px] font-semibold text-[var(--ink-soft)]"
      style={{ width: size, height: size }}
      data-testid="org-mark"
      data-has-logo={url ? "true" : "false"}
      aria-hidden
    >
      {url ? <img src={url} alt="" className="h-full w-full object-contain" /> : initial}
    </span>
  );
}
