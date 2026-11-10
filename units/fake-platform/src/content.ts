/** The media type of an LWS answer (the platform negotiates between the two; src/lws/routes.ts:209 negotiateMediaType, the exact rule is unverified). */
export const LWS_CONTENT = "application/ld+json";
export function negotiate(accept: string | null): string {
  return accept !== null && accept.includes("application/ld+json") ? "application/ld+json" : "application/json";
}
