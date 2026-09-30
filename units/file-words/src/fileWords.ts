export type FileFetchOutcome =
  | { kind: "ok"; blob: Blob; url: string }
  | { kind: "gone"; url: string }
  | { kind: "unaddressed"; url: string }
  | { kind: "forbidden"; status: number; url: string }
  | { kind: "failed"; status: number | null; url: string; detail: string | null };

/** Only `gone` may say the file left the vault. A refusal is not an absence. */
export function fileFetchMessage(outcome: FileFetchOutcome, name?: string | null): string {
  const subject = name ? `"${name}"` : "This file";
  switch (outcome.kind) {
    case "ok":
      return `${subject} downloaded.`;
    case "gone":
      return `${subject} is no longer in your vault.`;
    case "unaddressed":
      return `Couldn't tell which vault holds ${subject} — nothing was read, so its bytes may still be there.`;
    case "forbidden":
      return `You're not allowed to read ${subject} right now (${outcome.status}). Sign in, or ask the vault's owner for access.`;
    case "failed":
      return outcome.status === null
        ? `Couldn't reach the vault to download ${subject} — check your connection and try again.`
        : `Couldn't download ${subject} — the vault answered ${outcome.status}.`;
  }
}
