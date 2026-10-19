/**
 * The website entry-after-paint unit: moves a page's entry script to after first paint and holds an early form
 * submit. No component: strings in, strings out, plus one browser helper for the form.
 */
export {
  ENTRY_TAG, FALLBACK_MS, TRIGGER_EVENTS, GUARD, LOADER_MARK,
  loaderScript, rewriteEntry, rewriteRenderParts, entryStatus, claimGuardedForm,
} from "./entryAfterPaint";
export type { RenderParts, EntryStatus, GuardedForm } from "./entryAfterPaint";
