// Inline pure copies of the held-note helpers the paged find and the list code need (the source is in the app's held-notes module, which is in no unit).
/** The two spellings a person's record IRI is stored under (`/base/e/` and `/vault/e/`): the platform's
 *  find matches the stored value EXACTLY, so both are asked. */
export function subjectSpellings(subject: string): string[] {
  const out = [subject];
  if (subject.includes("/base/e/")) out.push(subject.replace("/base/e/", "/vault/e/"));
  else if (subject.includes("/vault/e/")) out.push(subject.replace("/vault/e/", "/base/e/"));
  return out;
}

function hostOf(uri: string): string | null {
  try {
    return new URL(uri).host.toLowerCase();
  } catch {
    return null;
  }
}

/** Is this entity held in this vault? Under OwnNameOwnHost a vault is its host. */
export function inVault(entity: string, vaultId: string): boolean {
  const a = hostOf(entity);
  return a !== null && a === hostOf(vaultId);
}
