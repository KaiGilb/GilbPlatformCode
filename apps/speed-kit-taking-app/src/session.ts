// The app's own in-memory state that belongs to a person. Both are registered with the hub, so a change of person or a sign-out clears them.
import { hub } from "@kaigilb/gilbplatformcode-speed-kit";
import type { PlatformClient } from "@kaigilb/gilbplatformcode-record-sync";

/** The signed-in person's platform client (the stand-in's). */
export const session: { client: PlatformClient | null } = { client: null };
hub.registerCache("speedkittaking.vaultClient", () => { session.client = null; });

/** Where the rows under a cache key last came from: read back from the device, or loaded from the network. */
export const provenance = new Map<string, "device" | "network">();
hub.registerCache("speedkittaking.provenance", () => provenance.clear());
