import type { ComponentProps } from "react";
import { PlanFunctionForm } from "@kaigilb/gilbplatformcode-plan-card";

export type ValueCardProps = ComponentProps<typeof PlanFunctionForm>;

/** The Value card: a record of type Value. The engine picks the lines from the record's type. */
export function ValueCard(props: ValueCardProps) {
  return <PlanFunctionForm {...props} />;
}
