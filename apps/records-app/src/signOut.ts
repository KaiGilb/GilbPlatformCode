// End the session the way production GilbApp does (9a602ea7 src/lib/base/signOut.ts:16-24):
// POST {platform origin}/onboard/logout, credentials included, redirect manual (a 303 is fine);
// a failed call is not fatal; then drop the token and key, then clear every cached query.
import type { QueryClient } from "@tanstack/react-query";
import type { SessionCredential } from "@kaigilb/gilbplatformcode-signin/session";
import { PLATFORM_ORIGIN } from "./platform";

export async function signOut(queryClient: QueryClient, credential: Pick<SessionCredential, "invalidate">): Promise<void> {
  try {
    await fetch(`${PLATFORM_ORIGIN}/onboard/logout`, { method: "POST", credentials: "include", redirect: "manual" });
  } catch {
    // A network failure is not fatal: this tab still signs out.
  }
  credential.invalidate(true);
  queryClient.clear();
}
