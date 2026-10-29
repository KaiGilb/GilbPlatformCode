/**
 * The small "connected" marker a list row shows when the link the list already read is one reference. No request.
 */
import { WORDS as W } from "@kaigilb/gilbplatformcode-online-card";
import { GlobeIcon } from "./OneCardFind";

export function ConnectedMarker({ connected }: { connected: boolean }) {
  if (!connected) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full border px-1.5 py-[1px] text-[10.5px] font-medium"
      style={{ borderColor: "var(--accent,var(--color-primary,#a85c3b))", color: "var(--accent,var(--color-primary,#a85c3b))" }}
      title="Connected to their online card"
      data-testid="connected-marker"
    >
      <GlobeIcon />
      <span>{W.linkedMarker}</span>
    </span>
  );
}
