// One card look for every app, drawn from the editorial-tokens variables.
import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@kaigilb/gilbplatformcode-class-merge";

export function Card({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-[var(--r-lg)] bg-[var(--surface)] border border-[var(--line-2)] shadow-[var(--shadow-sm)]",
        className,
      )}
      {...rest}
    />
  );
}

export function CardHeader({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pb-2 flex flex-col gap-1", className)} {...rest} />;
}

export function CardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <h2 className={cn("font-[var(--serif)] text-[19px] font-semibold text-[var(--ink)] tracking-[0.2px]", className)}>
      {children}
    </h2>
  );
}

export function CardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-[13.5px] leading-relaxed text-[var(--ink-faint)]", className)}>{children}</p>;
}

export function CardContent({ className, ...rest }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-5 pt-3", className)} {...rest} />;
}
