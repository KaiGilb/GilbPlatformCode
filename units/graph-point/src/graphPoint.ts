export interface FlowPoint {
  x: number;
  y: number;
}

export interface FlowRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ViewportXY {
  x: number;
  y: number;
  zoom: number;
}

export interface SizedFlowNode {
  position: FlowPoint;
  measured?: { width?: number; height?: number };
  width?: number;
  height?: number;
}

export const RECORD_NODE_FALLBACK_SIZE = { width: 160, height: 48 } as const;

export function nodeFlowCenter(
  node: SizedFlowNode,
  fallback: { width: number; height: number } = RECORD_NODE_FALLBACK_SIZE,
): FlowPoint {
  const w = node.measured?.width ?? node.width ?? fallback.width;
  const h = node.measured?.height ?? node.height ?? fallback.height;
  return { x: node.position.x + w / 2, y: node.position.y + h / 2 };
}

export function nodeFlowBounds(
  node: SizedFlowNode,
  fallback: { width: number; height: number } = RECORD_NODE_FALLBACK_SIZE,
): FlowRect {
  const width = node.measured?.width ?? node.width ?? fallback.width;
  const height = node.measured?.height ?? node.height ?? fallback.height;
  return { x: node.position.x, y: node.position.y, width, height };
}

export function panDelta(a: Pick<ViewportXY, "x" | "y">, b: Pick<ViewportXY, "x" | "y">): number {
  return Math.hypot(b.x - a.x, b.y - a.y);
}

/** Screen pixel = flow × zoom + translate. */
export function flowToScreen(flow: FlowPoint, viewport: ViewportXY): FlowPoint {
  return { x: flow.x * viewport.zoom + viewport.x, y: flow.y * viewport.zoom + viewport.y };
}
