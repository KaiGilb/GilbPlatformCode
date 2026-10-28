// Shared set-up for the tests: the platform origin and the ontology (term) origin. Not shipped (the package files are `src` only).
import { resetBaseOrigin, resetOntologyApiOriginRaw, resetVocabTypeBatchRevisions, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { resetTermOrigin, setTermOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export const ORIGIN = "https://platform.example.test";
export const ONTOLOGY = "https://ontology.platform.example.test";

export function setUp(): void {
  setBaseOrigin(ORIGIN);
  setTermOrigin(ONTOLOGY);
}

export function tearDown(): void {
  resetBaseOrigin();
  resetTermOrigin();
  resetOntologyApiOriginRaw();
  resetVocabTypeBatchRevisions();
}
