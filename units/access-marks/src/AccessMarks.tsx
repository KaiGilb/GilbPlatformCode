import type { ReactNode } from "react";
import { vaultAccessShape, type GrantMode } from "./accessShape";

const ROOM =
  "M14.5 8 V6.5 Q14.5 4.5 12.5 4.5 H6 Q3.5 4.5 3.5 6.5 V17.5 Q3.5 19.5 6 19.5 H12.5 Q14.5 19.5 14.5 17.5 V16";

function Icon({ title, className, children }: { title: string; className?: string; children: ReactNode }) {
  const labelled = title !== "";
  return (
    <svg viewBox="0 0 24 24" className={className} role={labelled ? "img" : undefined} aria-label={labelled ? title : undefined} aria-hidden={labelled ? undefined : true}>
      {labelled ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

function iconProps(title: string, className: string | undefined): { title: string; className?: string } {
  return className === undefined ? { title } : { className, title };
}

export function AccessReadGlyph({ className, title = "Read" }: { className?: string; title?: string }) {
  return (
    <Icon {...iconProps(title, className)}>
      <path d={ROOM} fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M7 12 H18.8" fill="none" stroke="currentColor" strokeWidth={2.4} />
      <path d="M18.8 6.6 L22 12 L18.8 17.4 Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function AccessWriteGlyph({ className, title = "Read and write" }: { className?: string; title?: string }) {
  return (
    <Icon {...iconProps(title, className)}>
      <path d={ROOM} fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M10.2 12 H18.8" fill="none" stroke="currentColor" strokeWidth={2.4} />
      <path d="M10.2 6.6 L7 12 L10.2 17.4 Z" fill="currentColor" stroke="none" />
      <path d="M18.8 6.6 L22 12 L18.8 17.4 Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function AccessAppendGlyph({ className, title = "Append" }: { className?: string; title?: string }) {
  return (
    <Icon {...iconProps(title, className)}>
      <path d={ROOM} fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M10.2 12 H18.8" fill="none" stroke="currentColor" strokeWidth={2.4} />
      <path d="M10.2 6.6 L7 12 L10.2 17.4 Z" fill="currentColor" stroke="none" />
    </Icon>
  );
}

export function AccessControlGlyph({ className, title = "Control" }: { className?: string; title?: string }) {
  return (
    <Icon {...iconProps(title, className)}>
      <circle cx="9" cy="10" r="3.5" fill="none" stroke="currentColor" strokeWidth={2} />
      <path d="M12 11.5 L20 11.5" fill="none" stroke="currentColor" strokeWidth={2.2} />
      <path d="M17.5 11.5 V15.5 M19.5 11.5 V14" fill="none" stroke="currentColor" strokeWidth={2} />
    </Icon>
  );
}

const TITLES: Record<GrantMode, string> = { read: "Read", write: "Write", append: "Append", control: "Control" };

export function ModeGlyph({ mode, className, title }: { mode: GrantMode; className?: string; title?: string }) {
  const t = title === undefined ? TITLES[mode] : title;
  const props = className === undefined ? { title: t } : { className, title: t };
  if (mode === "write") return <AccessWriteGlyph {...props} />;
  if (mode === "append") return <AccessAppendGlyph {...props} />;
  if (mode === "control") return <AccessControlGlyph {...props} />;
  return <AccessReadGlyph {...props} />;
}

/** No icon when drawing one would claim a read the vault did not grant. */
export function VaultAccessGlyph({ modes, className }: { modes: readonly string[]; className?: string }) {
  const shape = vaultAccessShape(modes);
  const props = className === undefined ? { title: "" } : { className, title: "" };
  if (shape === "read-and-write") return <AccessWriteGlyph {...props} />;
  if (shape === "read") return <AccessReadGlyph {...props} />;
  return null;
}
