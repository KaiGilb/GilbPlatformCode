// ShellCore: the part of a shell's context every app has, whatever its sections are.
//
// An app's own shell context may hold many app-only fields (sections, tabs, vault selection). Only
// the frame part is shared. An app's context can `extend ShellCoreValue`: it keeps its own fields and
// gains these, so a component written against ShellCore works in every app.

import { createContext, useContext } from "react";
import type { SizeClass } from "@kaigilb/gilbplatformcode-size-class";
import type { ShellLayoutApi } from "./useShellLayout";

export interface ShellCoreValue {
  /** The window's size class: compact (< 600), medium (600–839), expanded (>= 840). */
  sizeClass: SizeClass;
  /** The three-pane layout (used at expanded width). */
  layout: ShellLayoutApi;
  /** Whether the detail (right) region is showing, at any width. */
  detailOpen: boolean;
  /** Show the detail region: widens the pane at expanded width, opens the sheet below it. */
  openDetail: () => void;
  /** Hide the detail region, at any width. */
  closeDetail: () => void;
}

export const ShellCoreContext = createContext<ShellCoreValue | null>(null);

/**
 * The shell core, from inside a {@link ShellFrame}.
 *
 * @throws {Error} when called outside a ShellFrame
 */
export function useShellCore(): ShellCoreValue {
  const v = useContext(ShellCoreContext);
  if (!v) throw new Error("useShellCore must be used inside a ShellFrame");
  return v;
}
