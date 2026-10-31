export {
  ANNOTATIONS_PATH,
  ANNOTATIONS_VAULT_PARAM,
  NOTES_VAULT_UNTIED_COPY,
  AnnotationError,
  AnnotationVaultMismatchError,
  annotationsFit,
  sameVault,
  loadHolderAnnotations,
  saveHolderAnnotations,
  __resetAnnotationCapability,
} from "./contactAnnotation";
export type { AnnotationLoad, AnnotationValue, HolderAnnotations, SaveAnnotationsInput } from "./contactAnnotation";
export { ANNOTATION_AUTOSAVE_MS, useAnnotationDraft } from "./useAnnotationDraft";
// The state's type and the line's component share a name in the source; the type is exported as `AnnotationSaveStateName`.
export type { AnnotationSurface, UseAnnotationDraftOptions, UseAnnotationDraft, AnnotationSaveState as AnnotationSaveStateName } from "./useAnnotationDraft";
export { HolderNoteGroup, growBox, HINT } from "./HolderNoteGroup";
export type { HolderField } from "./HolderNoteGroup";
export { AnnotationSaveState } from "./AnnotationSaveState";
export type { AnnotationSaveStateProps } from "./AnnotationSaveState";
export { PrivateMarker } from "./PrivateMarker";
