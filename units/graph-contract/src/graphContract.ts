export type GraphNodeAction = "select" | "navigate" | "none";

export interface GraphInteractionContract {
  onNodeClick: GraphNodeAction;
  onNodeDoubleClick: GraphNodeAction;
}

export const DEFAULT_GRAPH_INTERACTION_CONTRACT: GraphInteractionContract = Object.freeze({
  onNodeClick: "select",
  onNodeDoubleClick: "navigate",
});

export type GraphExperienceId = "records" | "browse" | "openOnClick";

export const GRAPH_EXPERIENCE_CONTRACTS: Readonly<Record<GraphExperienceId, GraphInteractionContract>> = Object.freeze({
  records: DEFAULT_GRAPH_INTERACTION_CONTRACT,
  browse: Object.freeze({ onNodeClick: "select", onNodeDoubleClick: "none" }),
  openOnClick: Object.freeze({ onNodeClick: "navigate", onNodeDoubleClick: "none" }),
});

export function isGraphExperienceId(id: string): id is GraphExperienceId {
  return Object.prototype.hasOwnProperty.call(GRAPH_EXPERIENCE_CONTRACTS, id);
}

/** An unknown name uses the records contract. It does not throw. */
export function resolveGraphContract(
  experience: GraphExperienceId | GraphInteractionContract | string = "records",
): GraphInteractionContract {
  if (typeof experience === "string") {
    if (isGraphExperienceId(experience)) return GRAPH_EXPERIENCE_CONTRACTS[experience];
    return DEFAULT_GRAPH_INTERACTION_CONTRACT;
  }
  return experience;
}

export function isActiveGraphAction(action: GraphNodeAction): action is "select" | "navigate" {
  return action === "select" || action === "navigate";
}
