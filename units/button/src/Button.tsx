// One button look for every app.
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@kaigilb/gilbplatformcode-class-merge";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "icon";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

// Editorial-Calm button. Colour comes entirely from the editorial-tokens variables (no hex here),
// so a single anchor edit recolours every button. Every size is at least 44 px tall; `icon` is also 44 px wide.
const base =
  "inline-flex items-center justify-center gap-2 rounded-[var(--r-md)] font-medium " +
  "transition-[background,color,box-shadow,border-color] duration-150 " +
  "focus-visible:outline-2 focus-visible:outline-[var(--accent)] focus-visible:outline-offset-2 " +
  "disabled:opacity-50 disabled:pointer-events-none select-none";

const variants: Record<Variant, string> = {
  primary: "bg-[var(--accent)] text-[var(--on-accent)] shadow-[var(--shadow-sm)] hover:brightness-105 active:brightness-95",
  secondary: "bg-[var(--surface)] text-[var(--ink)] border border-[var(--line)] hover:border-[var(--focus)]",
  ghost: "bg-transparent text-[var(--ink-soft)] hover:bg-[var(--sel)] hover:text-[var(--ink)]",
  danger: "bg-transparent text-[var(--bad)] border border-[color-mix(in_srgb,var(--bad)_40%,transparent)] hover:bg-[color-mix(in_srgb,var(--bad)_10%,transparent)]",
};

const sizes: Record<Size, string> = {
  // Every size keeps a 44px height floor — "sm" only trims the padding and text scale, never the
  // height. Only `icon` also has a 44px width floor; the others are as wide as their label.
  sm: "min-h-[44px] px-3 text-[13px]",
  md: "min-h-[44px] px-4 text-[14px]",
  icon: "h-11 w-11 min-h-[44px] min-w-[44px] p-0 text-[15px]",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = "primary", size = "md", className, type, ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type ?? "button"}
      className={cn(base, variants[variant], sizes[size], className)}
      {...rest}
    />
  );
});
