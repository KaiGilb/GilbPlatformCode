/**
 * Which plan is picked, as the browser holds it. Moved from the Gilb Websites landing page
 * (composables/usePlanPick.ts `bindPlanPick`, without Nuxt's useState: the unit reports the pick as an event).
 */
import type { PlanPick } from "./types";

/**
 * Reads the checked radio of a group.
 *
 * @param group the element holding the radios
 * @param name the radios' name
 * @param featured the plan that is picked by default
 * @param already whether the visitor has already changed the pick
 * @param changedNow whether this read follows a change the visitor just made
 * @returns the pick; `byVisitor` stays true once true, and is true for a checked plan other than the default
 *   (a pick made before the script ran counts as the visitor's)
 */
export function readPick(group: HTMLElement, name: string, featured: string, already: boolean, changedNow: boolean): PlanPick {
  const checked = [...group.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((i) => i.name === name && i.checked);
  const plan = checked?.value ?? "";
  return { plan, byVisitor: already || changedNow || (plan !== "" && plan !== featured) };
}
