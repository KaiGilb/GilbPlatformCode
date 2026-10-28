import type { ReactNode } from "react";

export function HelpLayout({
  contents,
  children,
}: {
  contents: { id: string; title: string }[];
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-6 md:flex-row md:gap-10">
      <nav aria-label="Contents" className="md:w-56 md:shrink-0 md:sticky md:top-0 md:self-start">
        <p className="text-[12px] uppercase tracking-wide text-[var(--ink-soft)]">Contents</p>
        <ul className="m-0 flex list-none flex-col p-0">
          {contents.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className="min-h-11 text-left text-[15px] text-[var(--accent)] hover:underline"
                onClick={() => document.getElementById(item.id)?.scrollIntoView({ block: "start", behavior: "smooth" })}
              >
                {item.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0 flex-1">
        <div className="max-w-[72ch]">{children}</div>
      </div>
    </div>
  );
}

export function HelpSection({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} aria-labelledby={id + "-h"} className="scroll-mt-4 flex flex-col gap-3 pb-8 text-[16px] leading-relaxed text-[var(--ink)]">
      <h2 id={id + "-h"} className="text-[20px] font-semibold text-[var(--ink)]">
        {title}
      </h2>
      {children}
    </section>
  );
}

export function HelpLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <button
      type="button"
      className="min-h-11 px-3 text-[15px] text-[var(--accent)] underline-offset-2 hover:underline"
      onClick={() => document.getElementById(to)?.scrollIntoView({ block: "start", behavior: "smooth" })}
    >
      {children}
    </button>
  );
}

export function HelpExample({ label, text }: { label: string; text: string }) {
  return (
    <figure>
      <figcaption className="text-[13px] font-semibold text-[var(--ink-soft)]">{label}</figcaption>
      <pre className="whitespace-pre-wrap rounded-[var(--r-md)] border border-[var(--line)] bg-[var(--sel)] p-4 font-mono text-[14px] leading-relaxed">{text}</pre>
    </figure>
  );
}

export function HelpSteps({ children }: { children: ReactNode }) {
  return <ol className="list-decimal pl-6 flex flex-col gap-1">{children}</ol>;
}

export function HelpList({ children }: { children: ReactNode }) {
  return <ul className="list-disc pl-6 flex flex-col gap-1">{children}</ul>;
}

export function HelpNote({ children }: { children: ReactNode }) {
  return (
    <div role="note" className="rounded-[var(--r-md)] border-l-4 border-[var(--accent)] bg-[var(--sel)] px-4 py-3">
      {children}
    </div>
  );
}

export function HelpKeys({ children }: { children: ReactNode }) {
  return <kbd className="rounded-[var(--r-sm)] border border-[var(--line)] px-1.5 font-mono text-[14px]">{children}</kbd>;
}
