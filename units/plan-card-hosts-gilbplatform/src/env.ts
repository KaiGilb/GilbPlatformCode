// What the host factories share: the query client the provider holds, and the few values that come from the page
// (the session's vaults, the signed-in person as a source, and the optional actions and components the developer gives).
// Every host factory takes this object and builds its host from it once; the host is the same object for the provider's lifetime.

import type { ComponentType, ReactNode } from "react";
import type { QueryClient } from "@tanstack/react-query";
import type { TypeOption } from "@kaigilb/gilbplatformcode-type-chooser";

/** What a developer's create dialog is given, by whichever line opens it. The fields a line does not set are absent. */
export interface PlanCardsCreateDialogProps {
  open: boolean;
  /** True when the dialog is opened on the stakeholders create form. */
  stakeholders: boolean;
  source: null;
  /** The vaults whose records the dialog may offer. */
  drawnVaultIds: string[];
  /** Set by the person-creating lines: the dialog opens on this type. */
  initialTypeId?: "person";
  /** Set by the link lines: the dialog opens on this type option. */
  initialTypeOption?: TypeOption;
  onClose: () => void;
  /** Called with the new record's id, or its address. */
  onCreated: (id: string) => void;
}

/** Opens a record in the vault it lives in. */
export type OpenRecordInVault = (vaultId: string, recordId: string, opts?: { push?: boolean }) => void;

/** The vault the session reaches, as the Plan cards read it: the id and the modes held. The platform's list adds names the cards do not read. */
export interface SessionVault {
  vaultId: string;
  entity: string | null;
  name: string | null;
  parent: null;
  parentAmbiguous: false;
  modes: ("read" | "write")[];
  represents: null;
  isLandingVault: false;
  /** The vault's short name is decoration from the register, which this host does not read: never known. */
  shortName: null;
  shortNameKnown: false;
}

/** The shell as the cards read it: the vaults the session reaches and, when given, the action that opens a record in its vault. */
export interface SessionShell {
  vaults: readonly SessionVault[];
  openRecordInVault?: OpenRecordInVault;
}

export interface HostEnv {
  qc: QueryClient;
  /** A hook: the session's shell. The same object while the vaults do not change. */
  useShell(): SessionShell;
  /** A hook: the signed-in person's own card as a source, or null. */
  useSelfSource(): { "@id": string } | null;
  /** Present only when the developer gave `navigate.openRecordInVault`. */
  openRecordInVault?: OpenRecordInVault;
  /** Present only when the developer gave `navigate.openOntologyConcept`. */
  openOntologyConcept?: (typeName: string) => void;
  /** Present only when the developer gave a dialog. */
  createDialog?: ComponentType<PlanCardsCreateDialogProps>;
  /** Present only when the developer gave `renderTypeIcon`. */
  renderTypeIcon?: (option: TypeOption, className: string) => ReactNode;
  /** Present only when the developer gave a help button. */
  HelpButton?: ComponentType<{ label: string; title: string; startAt: string; children: ReactNode }>;
  /** The origin that serves the ontology's terms (the provider's `ontologyOrigin`). */
  ontologyOrigin: string;
}
