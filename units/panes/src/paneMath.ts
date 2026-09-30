export function dragWidth(side: "left" | "right", start: number, dx: number): number {
  return side === "left" ? start + dx : start - dx;
}

export function keyWidth(side: "left" | "right", current: number, key: "ArrowLeft" | "ArrowRight", shift: boolean): number {
  const step = shift ? 32 : 12;
  const dir = key === "ArrowRight" ? 1 : -1;
  return side === "left" ? current + dir * step : current - dir * step;
}
