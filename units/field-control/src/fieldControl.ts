export type FieldKind = "text" | "textarea" | "email" | "url" | "date" | "select";

export function fieldControlKind(kind: FieldKind): "textarea" | "select" | "input" {
  if (kind === "textarea") return "textarea";
  if (kind === "select") return "select";
  return "input";
}

export function fieldInputType(kind: FieldKind): "text" | "email" | "url" | "date" {
  if (kind === "email" || kind === "url" || kind === "date") return kind;
  return "text";
}
