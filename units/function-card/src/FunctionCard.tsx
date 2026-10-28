import type { ComponentProps } from "react";
import { PlanFunctionForm } from "@kaigilb/gilbplatformcode-plan-card";

export type FunctionCardProps = ComponentProps<typeof PlanFunctionForm>;

/** The Function card: a record of type Function or Function Constraint. The engine picks the lines from the record's type. */
export function FunctionCard(props: FunctionCardProps) {
  return <PlanFunctionForm {...props} />;
}
