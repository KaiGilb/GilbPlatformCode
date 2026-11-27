// Off Windows, the bridge's killChild sends SIGTERM and returns before the stand-in exits, so the
// stand-in can still write its log into the temp folder and fs.rm then fails with ENOTEMPTY.
// The stand-in records its pid on its first "boot" event (and again on "run") in FAKE_CLAUDE_LOG. Wait those pids out, then remove the folder.
import fs from "node:fs";
import path from "node:path";

// How long to wait for a stand-in to exit; the wait ends the moment the last one is gone, so a larger bound costs nothing when they exit at once.
// Windows: a chat stand-in stopped by the bridge took 11.2 s to exit once, while the whole suite ran in parallel (run 46035653922, SU-5a), and the
// 5 s bound then removed the folder under it (EBUSY). Isolated, the same stop takes about 50 ms (40 runs, median 50 ms, max taskkill 99 ms), so the
// slowness is the loaded runner, not a stuck child; the SU-5a file's hooks have a 30 s limit (a file with the default 10 s hook limit ends at that limit instead).
const WAIT_MS = process.platform === "win32" ? 25000 : 5000;
const KILL_AFTER_MS = 3000;
const POLL_MS = 40;
const MAX_LOG_BYTES = 2_000_000;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// process.kill(pid, 0) throws ESRCH once the pid is gone. That is not a failure.
function pidAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    return err?.code === "EPERM";
  }
}

function takePids(text, into) {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.includes('"pid"')) continue;
    let row;
    try {
      row = JSON.parse(trimmed);
    } catch {
      continue;
    }
    const pid = row?.pid;
    if ((row?.event === "run" || row?.event === "boot") && Number.isInteger(pid) && pid > 1 && pid !== process.pid && pid !== process.ppid) into.add(pid);
  }
}

function readLogFile(file, into) {
  let st;
  try {
    st = fs.lstatSync(file);
  } catch {
    return;
  }
  if (!st.isFile() || st.size === 0 || st.size > MAX_LOG_BYTES) return;
  let text;
  try {
    text = fs.readFileSync(file, "utf8");
  } catch {
    return;
  }
  if (!text.includes('"event":"run"') && !text.includes('"event": "run"') && !text.includes('"event":"boot"')) return;
  takePids(text, into);
}

// Symlinks are skipped so a fixture that points outside the temp folder is not walked.
function walk(dir, into, seen) {
  let st;
  try {
    st = fs.lstatSync(dir);
  } catch {
    return;
  }
  if (st.isSymbolicLink()) return;
  if (st.isFile()) {
    readLogFile(dir, into);
    return;
  }
  if (!st.isDirectory()) return;
  const id = `${st.dev}:${st.ino}`;
  if (seen.has(id)) return;
  seen.add(id);
  let names;
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) walk(path.join(dir, name), into, seen);
}

function collectPids(dir, logPaths) {
  const pids = new Set();
  if (typeof dir === "string" && dir) walk(dir, pids, new Set());
  if (Array.isArray(logPaths)) {
    for (const file of logPaths) {
      if (typeof file === "string" && file) readLogFile(file, pids);
    }
  }
  return pids;
}

async function waitForExit(pids) {
  const start = Date.now();
  const signaled = new Set();
  while (pids.size > 0) {
    const elapsed = Date.now() - start;
    if (elapsed >= WAIT_MS) return;
    let live = false;
    for (const pid of [...pids]) {
      if (!pidAlive(pid)) {
        pids.delete(pid);
        continue;
      }
      live = true;
      // Windows reuses a pid within moments: a stale pid from a log may now be another process (even a test worker), so there it is only waited for, never killed.
      if (process.platform !== "win32" && elapsed >= KILL_AFTER_MS && !signaled.has(pid)) {
        signaled.add(pid);
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // already gone
        }
      }
    }
    if (!live) return;
    const left = WAIT_MS - (Date.now() - start);
    if (left <= 0) return;
    await delay(Math.min(POLL_MS, left));
  }
}

/**
 * Remove a bridge test folder once no stand-in started for it is still running.
 * `logPaths` are stand-in logs that live outside `dir` (logs inside `dir` are found by walking it).
 * A pid that is already gone does not throw.
 */
export async function removeTestDir(dir, logPaths) {
  const pids = collectPids(dir, logPaths);
  if (pids.size > 0) await waitForExit(pids);
  if (typeof dir === "string" && dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
}
