// Which of the four whole cards draws a record. The test is the type key's own (`isTypeName` of `type-key`, the key every Plan unit
// compares types through, set by the provider), never a spelling of ours. A record that names no type (`typeSubstituted`) has none.
import type { ComponentType } from "react";
import { isTypeName } from "@kaigilb/gilbplatformcode-type-key";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { ValueCard, type ValueCardProps } from "@kaigilb/gilbplatformcode-value-card";
import { FunctionCard } from "@kaigilb/gilbplatformcode-function-card";
import { SolutionCard } from "@kaigilb/gilbplatformcode-solution-card";
import { ResourceCard } from "@kaigilb/gilbplatformcode-resource-card";

/** The four cards take the same props (`PlanFunctionForm`'s). */
export type PlanCardComponent = ComponentType<ValueCardProps>;

const CARDS: readonly { typeName: string; Card: PlanCardComponent }[] = [
  { typeName: "Value", Card: ValueCard },
  { typeName: "Function", Card: FunctionCard },
  { typeName: "Solution", Card: SolutionCard },
  { typeName: "Resource", Card: ResourceCard }, // a Development Resource is `t:Resource`
];

export function cardFor(record: BaseRecord): PlanCardComponent | null {
  if (record.typeSubstituted) return null;
  return CARDS.find((c) => isTypeName(record.typeUri, c.typeName))?.Card ?? null;
}
