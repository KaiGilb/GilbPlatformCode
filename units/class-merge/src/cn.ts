import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Joins class names, and resolves Tailwind conflicts: when two classes set the same property, the
 * later one wins (`cn("p-4", "p-2")` is `"p-2"`). Falsy values are dropped; arrays and objects are
 * read as clsx reads them.
 *
 * @param inputs class names, conditional objects, arrays, or falsy values
 * @returns one class string
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type { ClassValue };
