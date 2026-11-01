// The speed panel: the milliseconds from the Entries page's mount to its first rendered row, and where those rows came from.
import { useSyncExternalStore } from "react";
import { getPaint, getStart, startLine, subscribePaint } from "../proof";

export function SpeedPanel() {
  const paint = useSyncExternalStore(subscribePaint, getPaint, getPaint);
  const start = useSyncExternalStore(subscribePaint, getStart, getStart);
  return (
    <aside data-testid="speed-panel" data-source={paint?.source ?? ""} data-ms={paint ? paint.ms.toFixed(1) : ""} style={{ position: "fixed", bottom: 0, left: 0, right: 0, padding: "4px 8px", background: "#eee", fontSize: 12 }}>
      {paint ? `Entries: first row after ${paint.ms.toFixed(1)} ms, from ${paint.source}` : "Entries: no reading yet"}
      {start && <div data-testid="start-line">{startLine(start)}</div>}
    </aside>
  );
}
