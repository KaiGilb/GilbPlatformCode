import type { PlanCardHost } from "@kaigilb/gilbplatformcode-plan-card";
import type { PlanSourceHost } from "@kaigilb/gilbplatformcode-plan-source";
import type { PlanImpactsHost } from "@kaigilb/gilbplatformcode-plan-impacts";
import type { PlanTagLinksHost } from "@kaigilb/gilbplatformcode-plan-tag-links";
import type { PlanTagPickerHost } from "@kaigilb/gilbplatformcode-plan-tag-picker";
import type { ProjectLevelsHost } from "@kaigilb/gilbplatformcode-project-levels";
import type { StakeholderLinesHost } from "@kaigilb/gilbplatformcode-plan-stakeholder-lines";
import type { DescriptionPartsHost } from "@kaigilb/gilbplatformcode-description-parts-view";
import type { ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import type { ValueWriteHost } from "@kaigilb/gilbplatformcode-value-card-write";
import type { UseRefLabel } from "@kaigilb/gilbplatformcode-entity-ref-value";
import type { UsePickerQuery } from "@kaigilb/gilbplatformcode-record-picker";
import type { TypePictureSource } from "@kaigilb/gilbplatformcode-type-picture";
import type { ReadTermDefinition } from "@kaigilb/gilbplatformcode-type-term-popover";
import type { HostEnv } from "../env";
import { createPlanCardHost } from "./planCardHost";
import { createPlanSourceHost } from "./planSourceHost";
import { createPlanImpactsHost } from "./planImpactsHost";
import { createPlanTagLinksHost } from "./planTagLinksHost";
import { createPlanTagPickerHost } from "./planTagPickerHost";
import { createProjectLevelsHost } from "./projectLevelsHost";
import { createStakeholderLinesHost } from "./stakeholderLinesHost";
import { createDescriptionPartsHost } from "./descriptionPartsHost";
import { createValueLinesHost } from "./valueLinesHost";
import { createValueWriteHost } from "./valueWriteHost";
import { createPickerQuery, createRefLabel, createTermDefinition, createTypePicture } from "./contextValues";

export {
  createPlanCardHost,
  createPlanSourceHost,
  createPlanImpactsHost,
  createPlanTagLinksHost,
  createPlanTagPickerHost,
  createProjectLevelsHost,
  createStakeholderLinesHost,
  createDescriptionPartsHost,
  createValueLinesHost,
  createValueWriteHost,
  createRefLabel,
  createPickerQuery,
  createTypePicture,
  createTermDefinition,
};

/** The value of each of the 14 contexts. */
export interface PlanCardHosts {
  planCard: PlanCardHost;
  planSource: PlanSourceHost;
  planImpacts: PlanImpactsHost;
  planTagLinks: PlanTagLinksHost;
  planTagPicker: PlanTagPickerHost;
  projectLevels: ProjectLevelsHost;
  stakeholderLines: StakeholderLinesHost;
  descriptionParts: DescriptionPartsHost;
  valueLines: ValueLinesHost;
  valueWrite: ValueWriteHost;
  refLabel: UseRefLabel;
  pickerQuery: UsePickerQuery;
  typePicture: TypePictureSource;
  termDefinition: ReadTermDefinition;
}

export function createPlanCardHosts(env: HostEnv): PlanCardHosts {
  return {
    planCard: createPlanCardHost(env),
    planSource: createPlanSourceHost(env),
    planImpacts: createPlanImpactsHost(env),
    planTagLinks: createPlanTagLinksHost(env),
    planTagPicker: createPlanTagPickerHost(env),
    projectLevels: createProjectLevelsHost(env),
    stakeholderLines: createStakeholderLinesHost(env),
    descriptionParts: createDescriptionPartsHost(env),
    valueLines: createValueLinesHost(env),
    valueWrite: createValueWriteHost(env),
    refLabel: createRefLabel(),
    pickerQuery: createPickerQuery(),
    typePicture: createTypePicture(env),
    termDefinition: createTermDefinition(),
  };
}
