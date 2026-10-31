export {
  CHIP_PENDING_LABEL,
  CHIP_UNREADABLE_LABEL,
  DEFAULT_TIE_MISSING_SAYS,
  NOT_OWN_VAULT_SAYS,
  NO_VAULT_TIE_SAYS,
  useContactLabels,
} from "./useContactLabels";
export type { ContactLabelsState } from "./useContactLabels";
export {
  ContactLabelError,
  ContactLabelVocabUnavailableError,
  PRIVATE_TIER,
  __resetContactLabelVocab,
  addContactLabel,
  assertNeutralLabelFacts,
  contactLabelsOf,
  hasAnnotationRecord,
  heldTypedClaims,
  isEndedClaimDoc,
  labelClaimFacts,
  ownContactLabels,
  removeContactLabel,
  resolveContactLabelReadVocab,
  resolveContactLabelVocab,
  resolveHeldClaimType,
} from "./heldContactLabel";
export type { ContactLabelClaim, ContactLabelReadVocab, ContactLabelVocab, ContactLabelWrite } from "./heldContactLabel";
