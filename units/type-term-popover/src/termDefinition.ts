import { createContext } from "react";
import type { TermDefinition } from "./types";

/** Reads one type's definition from the host that holds it. `typeName` is bare or with `t:`. */
export type ReadTermDefinition = (typeName: string) => Promise<TermDefinition>;

/** The host's reader, provided once above the app. With no provider the popover throws an error naming it. */
export const TermDefinitionContext = createContext<ReadTermDefinition | null>(null);

/**
 * A type's definition is read ONCE PER SESSION, not on every card open: a second card opened in one
 * session makes no second read. Only an answer that was actually READ is held ("defined" or
 * "none"); an unreachable read is not, so the next card asks again. A reload is a new session.
 */
// Held per reader: the app provides one reader per session, so a reload starts empty, and a test that
// makes its own reader starts empty too.
const definitionOnce = new WeakMap<ReadTermDefinition, Map<string, Promise<TermDefinition>>>();
export function typeDefinitionOnce(read: ReadTermDefinition, typeName: string): Promise<TermDefinition> {
  let held = definitionOnce.get(read);
  if (!held) definitionOnce.set(read, (held = new Map()));
  const hit = held.get(typeName);
  if (hit) return hit;
  const p = read(typeName);
  held.set(typeName, p);
  void p.then((d) => {
    if (d.state === "unreachable") held.delete(typeName);
  });
  return p;
}
