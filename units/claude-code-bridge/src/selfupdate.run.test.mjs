// @vitest-environment node
// SU-2: the install pipeline with every effect faked, plus realFetch against a local server.
import { describe, expect, it } from "vitest";
import crypto from "node:crypto";
import http from "node:http";
import { fileMatchesManifest, realFetch, runUpdate, updateSignedText } from "../bridge/bridge.mjs";

const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
const KEYS = [{ id: "bu1", key: publicKey.export({ type: "spki", format: "der" }).subarray(-32).toString("base64") }];
const ORIGIN = "https://host.example.test";
const FILE = "/home/u/bridge.mjs";
const NEW_TEXT = 'export const BRIDGE_BUILD = "0.3.16";\n// new body\n';
const NEW = new TextEncoder().encode(NEW_TEXT);
const OLD = new TextEncoder().encode("old bridge bytes");
const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");
const enc = (o) => new TextEncoder().encode(JSON.stringify(o));

function signed(over = {}, key = privateKey) {
  const f = { version: "0.3.16", sha256: sha(NEW), size: NEW.length, signedAt: "2026-11-19T11:00:00Z", ...over };
  return { format: 1, ...f, keyId: "bu1", signature: crypto.sign(null, Buffer.from(updateSignedText(f), "utf8"), key).toString("base64") };
}

function rig(opts = {}) {
  const calls = [];
  const files = new Map([[FILE, OLD]]);
  const manifest = opts.manifest ?? signed();
  const fileBytes = opts.fileBytes ?? NEW;
  const deps = {
    origin: ORIGIN, keys: KEYS, running: "0.3.15", file: FILE, stateDir: "/home/u/state",
    now: () => new Date("2026-11-19T12:00:00Z"), random: () => "r1", log: () => {},
    fetch: async (url, o) => {
      calls.push(["fetch", url, o]);
      if (opts.fetch) { const r = opts.fetch(url, o); if (r) return r; }
      const bytes = url.endsWith(".json") ? enc(manifest) : fileBytes;
      return { status: 200, finalUrl: url, bytes };
    },
    fs: {
      writeFileExclusive: async (p, b, mode) => { calls.push(["write", p, mode]); if (opts.writeError) throw Object.assign(new Error("disk " + FILE), { code: "ENOSPC" }); files.set(p, b); },
      readFile: async (p) => { calls.push(["read", p]); return opts.tamperRead ? new Uint8Array([...files.get(p)].map((x, i) => (i === 3 ? x ^ 1 : x))) : files.get(p); },
      copyFile: async (s, d) => { calls.push(["copy", s, d]); files.set(d, files.get(s)); },
      rename: async (s, d) => { calls.push(["rename", s, d]); files.set(d, files.get(s)); files.delete(s); },
      unlink: async (p) => { calls.push(["unlink", p]); files.delete(p); },
      writeFile: async (p, t, mode) => { calls.push(["writeFile", p, mode]); files.set(p, t); },
      realpath: async (p) => (opts.symlink ? "/elsewhere/bridge.mjs" : p),
      lstat: async () => ({ isFile: () => true }),
    },
    selfTest: async (p) => { calls.push(["selftest", p]); return opts.selfTest ?? { code: 0, stdout: "build 0.3.16\n" }; },
    ...opts.deps,
  };
  return { deps, calls, files };
}
const kinds = (calls) => calls.map((c) => c[0]);
const writes = (calls) => calls.filter((c) => ["write", "copy", "rename", "unlink", "writeFile"].includes(c[0]));

describe("runUpdate", () => {
  it("R1 happy path: ordered calls, file changes only at the rename, .prev holds the old bytes", async () => {
    const { deps, calls, files } = rig();
    const r = await runUpdate(deps);
    expect(r).toEqual({ updated: true, from: "0.3.15", to: "0.3.16" });
    expect(kinds(calls)).toEqual(["fetch", "fetch", "write", "selftest", "read", "copy", "rename", "writeFile"]);
    expect(calls[0][1]).toBe(ORIGIN + "/app/claude-code-bridge.json");
    expect(calls[1][1]).toBe(ORIGIN + "/app/claude-code-bridge.mjs");
    expect(calls[1][2].maxBytes).toBe(NEW.length + 1);
    expect(calls[2][2]).toBe(0o600);
    expect(files.get(FILE)).toBe(NEW);
    expect(files.get(FILE + ".prev")).toBe(OLD);
    expect(JSON.parse(files.get("/home/u/state/update.json"))).toMatchObject({ from: "0.3.15", to: "0.3.16", sha256: sha(NEW) });
    expect([...files.keys()].some((k) => k.includes(".update-"))).toBe(false);
  });

  it("R2 UpdateCurrent: updated:false, one fetch, no write", async () => {
    const { deps, calls } = rig({ manifest: signed({ version: "0.3.15" }) });
    expect(await runUpdate(deps)).toEqual({ updated: false, reason: "current" });
    expect(calls.filter((c) => c[0] === "fetch")).toHaveLength(1);
    expect(writes(calls)).toEqual([]);
  });

  it("R3 an off-origin redirect on the manifest and on the file is UpdateNetwork", async () => {
    const m = rig({ fetch: (url) => (url.endsWith(".json") ? { status: 200, finalUrl: "https://evil.example.test/x.json", bytes: enc(signed()) } : null) });
    expect(await runUpdate(m.deps)).toMatchObject({ code: "UpdateNetwork" });
    expect(writes(m.calls)).toEqual([]);
    const f = rig({ fetch: (url) => (url.endsWith(".mjs") ? { status: 200, finalUrl: "https://evil.example.test/x.mjs", bytes: NEW } : null) });
    expect(await runUpdate(f.deps)).toMatchObject({ code: "UpdateNetwork" });
    expect(writes(f.calls)).toEqual([]);
  });

  it("R3b a non-200 status and a thrown fetch are UpdateNetwork", async () => {
    expect(await runUpdate(rig({ fetch: () => ({ status: 404, finalUrl: ORIGIN + "/x", bytes: new Uint8Array(0) }) }).deps)).toMatchObject({ code: "UpdateNetwork" });
    expect(await runUpdate(rig({ fetch: () => { throw new Error("timeout"); } }).deps)).toMatchObject({ code: "UpdateNetwork" });
  });

  it("R3c a manifest that is not JSON is UpdateBad", async () => {
    expect(await runUpdate(rig({ fetch: (u) => (u.endsWith(".json") ? { status: 200, finalUrl: u, bytes: new TextEncoder().encode("{nope") } : null) }).deps)).toMatchObject({ code: "UpdateBad" });
  });

  it("R4 a file one byte longer than size is UpdateMismatch and nothing is written", async () => {
    const { deps, calls } = rig({ fileBytes: new Uint8Array([...NEW, 10]) });
    expect(await runUpdate(deps)).toMatchObject({ code: "UpdateMismatch" });
    expect(writes(calls)).toEqual([]);
  });

  it("R5 a failed self-test (code 1, or wrong stdout) is UpdateSelfTest; temp removed, file and .prev untouched", async () => {
    for (const selfTest of [{ code: 1, stdout: "build 0.3.16" }, { code: 0, stdout: "build 0.3.99" }]) {
      const { deps, calls, files } = rig({ selfTest });
      expect(await runUpdate(deps)).toMatchObject({ code: "UpdateSelfTest" });
      expect(kinds(calls)).toContain("unlink");
      expect(files.get(FILE)).toBe(OLD);
      expect(files.has(FILE + ".prev")).toBe(false);
      expect([...files.keys()].some((k) => k.includes(".update-"))).toBe(false);
    }
  });

  it("R6 a re-hash from disk that differs is UpdateMismatch; temp removed, file untouched", async () => {
    const { deps, calls, files } = rig({ tamperRead: true });
    expect(await runUpdate(deps)).toMatchObject({ code: "UpdateMismatch" });
    expect(kinds(calls)).not.toContain("rename");
    expect(kinds(calls)).not.toContain("copy");
    expect(files.get(FILE)).toBe(OLD);
    expect([...files.keys()].some((k) => k.includes(".update-"))).toBe(false);
  });

  it("R7 a write error is UpdateDisk with no path in the message; file untouched", async () => {
    const { deps, files } = rig({ writeError: true });
    const r = await runUpdate(deps);
    expect(r).toMatchObject({ code: "UpdateDisk" });
    expect(r.message).toContain("ENOSPC");
    expect(r.message).not.toContain("/");
    expect(files.get(FILE)).toBe(OLD);
  });

  it("R8 a symlinked bridge file is UpdateCannotWrite before any fetch (the check needs no network, so it runs first)", async () => {
    const { deps, calls } = rig({ symlink: true });
    expect(await runUpdate(deps)).toMatchObject({ code: "UpdateCannotWrite" });
    expect(calls).toEqual([]);
  });

  it("R9 an empty or non-https origin is UpdateOff with no fetch", async () => {
    for (const origin of ["", "http://x.example.test"]) {
      const { deps, calls } = rig({ deps: { origin } });
      expect(await runUpdate(deps)).toMatchObject({ code: "UpdateOff" });
      expect(calls).toEqual([]);
    }
  });

  it("R10 a second concurrent run is UpdateRunning; a third after the first may run", async () => {
    let release;
    const gate = new Promise((r) => { release = r; });
    const slow = rig({ fetch: async () => { await gate; return null; } });
    const first = runUpdate(slow.deps);
    expect(await runUpdate(rig().deps)).toMatchObject({ code: "UpdateRunning" });
    release();
    await first;
    expect(await runUpdate(rig().deps)).toMatchObject({ updated: true });
  });

  it("R11 a bad signature is UpdateSignature and the file is never fetched", async () => {
    const other = crypto.generateKeyPairSync("ed25519").privateKey;
    const { deps, calls } = rig({ manifest: signed({}, other) });
    expect(await runUpdate(deps)).toMatchObject({ code: "UpdateSignature" });
    expect(calls.filter((c) => c[0] === "fetch")).toHaveLength(1);
    expect(writes(calls)).toEqual([]);
  });
});

describe("realFetch", () => {
  it("R12 stops reading a body that passes the cap", async () => {
    let sent = 0;
    const server = http.createServer((req, res) => {
      res.writeHead(200);
      const chunk = Buffer.alloc(1024, 65);
      const tick = () => {
        if (res.destroyed || sent > 50 * 1024 * 1024) return;
        sent += chunk.length;
        if (res.write(chunk)) setImmediate(tick); else res.once("drain", tick);
      };
      tick();
    });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const url = `http://127.0.0.1:${server.address().port}/x`;
      const cap = 4096;
      const r = await realFetch(url, { timeoutMs: 5000, maxBytes: cap });
      expect(r.truncated).toBe(true);
      expect(r.bytes.length).toBe(cap);
      expect(fileMatchesManifest(r.bytes, { version: "0.3.16", sha256: sha(NEW), size: cap - 1 })).toMatchObject({ ok: false, code: "UpdateMismatch" });
      await new Promise((r2) => setTimeout(r2, 100));
      expect(sent).toBeLessThan(5 * 1024 * 1024); // the server was cut off, not drained
    } finally {
      server.closeAllConnections?.();
      await new Promise((r) => server.close(r));
    }
  });

  it("R12b a redirect to another origin is not followed", async () => {
    const server = http.createServer((req, res) => { res.writeHead(302, { location: "http://127.0.0.2:1/x" }); res.end(); });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    try {
      const r = await realFetch(`http://127.0.0.1:${server.address().port}/x`, { timeoutMs: 5000, maxBytes: 100 });
      expect(r.status).toBe(302);
    } finally {
      await new Promise((r) => server.close(r));
    }
  });
});
