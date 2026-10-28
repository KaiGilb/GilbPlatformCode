import type { ComponentProps } from "react";
import { PlanFunctionForm } from "@kaigilb/gilbplatformcode-plan-card";

export type SolutionCardProps = ComponentProps<typeof PlanFunctionForm>;

/** The Solution card: a record of type Solution or Solution Constraint (`DesignConstraint`). The engine picks the lines from the record's type. */
export function SolutionCard(props: SolutionCardProps) {
  return <PlanFunctionForm {...props} />;
}
