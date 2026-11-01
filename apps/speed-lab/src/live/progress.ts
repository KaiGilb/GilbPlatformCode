// "Added k of N": the progress of the running add job. Counts only; cleared with the person.
import { hub } from "@kaigilb/gilbplatformcode-speed-kit";

export interface SeedProgress { runId: string; k: number; n: number }
let current: SeedProgress | null = null;
const listeners = new Set<() => void>();
const tell = () => { for (const l of [...listeners]) l(); };
hub.registerCache("speedkittaking.seedProgress", () => { current = null; tell(); });

export const subscribeProgress = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
export const getProgress = (): SeedProgress | null => current;
export function setProgress(p: SeedProgress | null): void { current = p; tell(); }
