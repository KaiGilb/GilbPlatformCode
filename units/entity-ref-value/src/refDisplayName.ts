// A name to show for a record that a stored reference points at. This is the app's own rule: it also reads the
// tag carriers and a file's own name, which the `entity-ref` unit's `refDisplayName` does not.
import { opaqueIdFromUri } from "@kaigilb/gilbplatformcode-id-tail";

/** Master-tag candidates for display when the label is empty: `unitTag` first, bare `tag` second. */
const MASTER_TAG_SLUGS = ["unitTag", "tag"] as const;

export function refDisplayName(
  facts: Record<string, string> | null | undefined,
  entityUri?: string | null,
  /** The record's MAIN tag (the platform's), the tag fallback of a record that holds no label, name or `unitTag`/`tag`. */
  mainTag?: string | null,
): string {
  if (facts) {
    for (const slug of ["label", "termLabel", "title", "name"] as const) {
      const v = facts[slug]?.trim();
      if (v) return v;
    }
    for (const slug of MASTER_TAG_SLUGS) {
      const v = facts[slug]?.trim();
      if (v) return v;
    }
    const main = mainTag?.trim();
    if (main) return main;
    // A file is named by its own file name (a source line says "from Customer contract.pdf", not the file's id).
    const fileName = facts.fileName?.trim();
    if (fileName) return fileName;
  }
  if (entityUri) {
    const tail = opaqueIdFromUri(entityUri);
    if (tail) return tail;
  }
  return "Untitled";
}
