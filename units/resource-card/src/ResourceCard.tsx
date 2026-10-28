import type { ComponentProps } from "react";
import { PlanFunctionForm } from "@kaigilb/gilbplatformcode-plan-card";

export type ResourceCardProps = ComponentProps<typeof PlanFunctionForm>;

/** The Development Resource card: a record of type Resource. The engine picks the lines from the record's type. */
export function ResourceCard(props: ResourceCardProps) {
  return <PlanFunctionForm {...props} />;
}
