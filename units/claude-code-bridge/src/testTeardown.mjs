// Off Windows, the bridge's killChild sends SIGTERM and returns before the stand-in exits, so the
// stand-in can still write its log into the temp folder and fs.rm then fails with ENOTEMPTY.
// The stand-in records its pid on its first "boot" event (and again on "run") in FAKE_CLAUDE_LOG. Wait those pids out, then remove the folder.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process"; // Batch F diagnostic: removed before merge

const WAIT_MS = 5000;
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
  if (process.platform === "win32") console.error(`[SU5A] ${new Date().toISOString()} removeTestDir starts dir=${dir} pids to wait for=[${[...pids].join(",")}]`); // Batch F diagnostic: removed before merge
  if (pids.size > 0) await waitForExit(pids);
  try {
    if (typeof dir === "string" && dir) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 20, retryDelay: 100 });
  } catch (e) {
    // Batch F diagnostic: removed before merge. Which processes could hold this folder? Prints, then rethrows the same error.
    if (process.platform === "win32") {
      try {
        const alive = [...pids].map((p) => `${p}:${pidAlive(p)}`).join(" ");
        const ps = execFileSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", `Get-CimInstance Win32_Process | Where-Object { $_.Name -match 'node|claude|taskkill|conhost' } | ForEach-Object { "$($_.ProcessId) ppid=$($_.ParentProcessId) $($_.Name) $($_.CommandLine)" }`], { encoding: "utf8", timeout: 20000 });
        console.error(`[SU5A-EBUSY] ${e.code} on ${dir}; logged pids alive: [${alive}]\n${ps.slice(0, 3000)}`);
      } catch (e2) { console.error(`[SU5A-EBUSY] could not list processes: ${e2?.message}`); }
    }
    throw e;
  }
}
