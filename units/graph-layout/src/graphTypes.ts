/** How a reconstructed edge is grounded. The host builds these; this unit only places them. */
export type GraphEdgeKind = "pair" | "member" | "pendant";

export interface AssembledEdge {
  id: string;
  source: string;
  target: string;
  kind: GraphEdgeKind;
  relationUri: string;
  role: string;
  oriented: boolean;
}

export interface RelationNodeSpec {
  id: string;
  relationUri: string;
  ref: string;
  memberCount: number;
}

export interface PendantNodeSpec {
  id: string;
  relationUri: string;
  ref: string;
  role: string;
  anchorRecordId: string;
}
