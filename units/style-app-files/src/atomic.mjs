// Atomic file writes: write a temp file next to the target, then rename it over the target.
import { copyFile, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

let counter = 0;
const tempName = (target) => `${target}.${process.pid}-${Date.now()}-${++counter}.tmp`;

/** Writes `data` (string or bytes) to `target` so a reader never sees half a file. Makes the folder when needed. */
export async function writeAtomic(target, data) {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = tempName(target);
  try {
    await writeFile(tmp, data);
    await rename(tmp, target);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}

/** Copies `from` to `target` the same way. */
export async function copyAtomic(from, target) {
  await mkdir(path.dirname(target), { recursive: true });
  const tmp = tempName(target);
  try {
    await copyFile(from, tmp);
    await rename(tmp, target);
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
}
