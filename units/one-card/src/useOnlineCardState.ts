/**
 * The online card controller's state as a React value; the controller is the store. A card open: one `load()`.
 * ⛔ Nothing is read before the card is opened: `load()` runs when the card mounts, never per list row; an unlinked record reads nothing.
 */
import { useEffect, useSyncExternalStore } from "react";
import type { OnlineCardController, OnlineCardState } from "@kaigilb/gilbplatformcode-online-card";

export function useOnlineCardState(controller: OnlineCardController | null): OnlineCardState | null {
  const state = useSyncExternalStore(
    (l) => (controller ? controller.subscribe(l) : () => {}),
    () => (controller ? controller.getState() : null),
    () => (controller ? controller.getState() : null),
  );
  // The card was OPENED: one resolve and one card read. (A StrictMode remount shares the load in flight.)
  useEffect(() => {
    void controller?.load();
  }, [controller]);
  return state;
}
