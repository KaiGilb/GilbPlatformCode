// @vitest-environment node
// GitHubSync Step 1, D4b (Agent.Tester, D4 verify): git trusts an object file at the right path. An object the PARENT already holds
// (the blob of an unchanged file) replaced by a symlink or hard link to foreign bytes must never be carried into a new commit; and a
// pack entry whose content does not hash to its id must not be either.
import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { saveTurnToGit } from "../bridge/bridge.mjs";
import { fsckOk, plainGit } from "./gitTestKit.mjs";

const posix = process.platform !== "win32";
const temps = [];
afterEach(() => {
  for (const t of temps.splice(0)) fs.rmSync(t, { recursive: true, force: true });
});
const gitIn = (cwd, args, input) => execFileSync("git", ["-c", "gc.auto=0", "-c", "maintenance.auto=false", ...args], { cwd, input, encoding: input === undefined ? "utf8" : undefined, env: { PATH: process.env.PATH, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: process.platform === "win32" ? "NUL" : "/dev/null" } });

/** A saved repo with a.txt; the path of a.txt's blob (the parent holds it), and a place outside. */
async function primed() {
  const d = fs.realpathSync.native(fs.mkdtempSync(path.join(os.tmpdir(), "bridge-git-d4b-")));
  temps.push(d);
  const proj = path.join(d, "proj");
  const out = path.join(d, "outside");
  fs.mkdirSync(proj);
  fs.mkdirSync(out);
  const priv = path.join(d, "priv");
  fs.writeFileSync(path.join(proj, "a.txt"), "a\n");
  const r = await saveTurnToGit({ folder: proj, summary: "first", turnId: "t1", env: process.env, privateDir: priv });
  expect(r.ok && r.commit).toBeTruthy();
  const aId = plainGit(proj, ["rev-parse", "HEAD:a.txt"]).trim();
  return { d, proj, out, priv, aId, aPath: path.join(proj, ".git", "objects", aId.slice(0, 2), aId.slice(2)), tip: plainGit(proj, ["rev-parse", "HEAD"]).trim() };
}
function foreignObject(t) {
  const other = path.join(t.d, "otherrepo");
  fs.mkdirSync(other);
  gitIn(other, ["init", "-q", "--template="]);
  const fid = String(gitIn(other, ["hash-object", "-w", "--stdin"], "FOREIGN SECRET CONTENT\n")).trim();
  const copy = path.join(t.out, "foreign-obj");
  fs.copyFileSync(path.join(other, ".git", "objects", fid.slice(0, 2), fid.slice(2)), copy);
  return copy;
}
function plainOutside(t) {
  const p = path.join(t.out, "victim");
  fs.writeFileSync(p, "VICTIM\n");
  return p;
}
const outsideBytes = (t) => fs.readdirSync(t.out).map((n) => `${n}:${crypto.createHash("sha1").update(fs.readFileSync(path.join(t.out, n))).digest("hex")}`).join(",");

describe("D4b: an unchanged file's blob (held by the parent) replaced by a link to foreign bytes", () => {
  const cases = [
    ["a symlink", "another repo's object", (t) => fs.symlinkSync(foreignObject(t), t.aPath), posix],
    ["a symlink", "a plain outside file", (t) => fs.symlinkSync(plainOutside(t), t.aPath), posix],
    ["a hard link", "another repo's object", (t) => fs.linkSync(foreignObject(t), t.aPath), true],
    ["a hard link", "a plain outside file", (t) => fs.linkSync(plainOutside(t), t.aPath), true],
  ];
  for (const [kind, target, plant, runs] of cases) {
    it.skipIf(!runs)(`${kind} to ${target}: refused, the branch does not move, the blob is written back, the next save is clean`, async () => {
      const t = await primed();
      fs.rmSync(t.aPath, { force: true });
      plant(t);
      const before = outsideBytes(t);
      fs.writeFileSync(path.join(t.proj, "b.txt"), "bee\n"); // only b.txt changes; a.txt is unchanged
      const r = await saveTurnToGit({ folder: t.proj, summary: "second", turnId: "t2", env: process.env, privateDir: t.priv });
      expect(r.ok).toBe(false);
      expect(r.reason).toMatch(/is not a plain file|does not hash back|cannot be read|damaged header|a link in place of a git object/);
      expect(plainGit(t.proj, ["rev-parse", "HEAD"]).trim()).toBe(t.tip);
      expect(outsideBytes(t)).toBe(before); // nothing outside changed (only a planted name was removed)
      // Healed: a.txt's blob is a plain file again with its own bytes, the repo is valid, and the next save commits b.txt.
      expect(fs.lstatSync(t.aPath).isFile()).toBe(true);
      expect(fs.lstatSync(t.aPath).nlink).toBe(1);
      expect(fsckOk(t.proj)).toBe(true);
      const r3 = await saveTurnToGit({ folder: t.proj, summary: "third", turnId: "t3", env: process.env, privateDir: t.priv });
      expect(r3.ok && r3.commit).toBeTruthy();
      expect(plainGit(t.proj, ["show", "HEAD:a.txt"])).toBe("a\n");
      expect(plainGit(t.proj, ["show", "HEAD:b.txt"])).toBe("bee\n");
    });
  }

  it("a plain file copied over an old object (no link, link count 1) after the last save: its newer time gets it hashed, and refused", async () => {
    const t = await primed();
    const foreign = foreignObject(t);
    await new Promise((r) => setTimeout(r, 20));
    fs.rmSync(t.aPath, { force: true });
    fs.copyFileSync(foreign, t.aPath);
    fs.writeFileSync(path.join(t.proj, "b.txt"), "bee\n");
    const r = await saveTurnToGit({ folder: t.proj, summary: "second", turnId: "t2", env: process.env, privateDir: t.priv });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not hash back/);
    expect(plainGit(t.proj, ["rev-parse", "HEAD"]).trim()).toBe(t.tip);
    expect(fsckOk(t.proj)).toBe(true);
  });
});

describe("a pack entry whose content does not hash to its id is never committed (the packed-object check)", () => {
  /** Puts two blobs into a pack, then swaps their offsets in the .idx (recomputing its checksum): id X now reads Y's bytes. */
  function swappedPack(proj, xContent, yContent) {
    const x = String(gitIn(proj, ["hash-object", "-w", "--stdin"], xContent)).trim();
    const y = String(gitIn(proj, ["hash-object", "-w", "--stdin"], yContent)).trim();
    const packBase = path.join(proj, ".git", "objects", "pack", "pack");
    const name = String(gitIn(proj, ["pack-objects", "-q", packBase], `${x}\n${y}\n`)).trim();
    for (const id of [x, y]) fs.rmSync(path.join(proj, ".git", "objects", id.slice(0, 2), id.slice(2)), { force: true });
    const idxPath = `${packBase}-${name}.idx`;
    const idx = Buffer.from(fs.readFileSync(idxPath));
    expect(idx.readUInt32BE(4)).toBe(2);
    const n = idx.readUInt32BE(8 + 255 * 4);
    const hl = x.length / 2;
    const names = 8 + 256 * 4;
    const ids = Array.from({ length: n }, (_, i) => idx.subarray(names + i * hl, names + (i + 1) * hl).toString("hex"));
    const ix = ids.indexOf(x);
    const iy = ids.indexOf(y);
    const offs = names + n * hl + n * 4;
    const ox = idx.readUInt32BE(offs + ix * 4);
    idx.writeUInt32BE(idx.readUInt32BE(offs + iy * 4), offs + ix * 4);
    idx.writeUInt32BE(ox, offs + iy * 4);
    const crcs = names + n * hl;
    const cx = idx.readUInt32BE(crcs + ix * 4);
    idx.writeUInt32BE(idx.readUInt32BE(crcs + iy * 4), crcs + ix * 4);
    idx.writeUInt32BE(cx, crcs + iy * 4);
    crypto.createHash(hl === 32 ? "sha256" : "sha1").update(idx.subarray(0, idx.length - hl)).digest().copy(idx, idx.length - hl);
    fs.chmodSync(idxPath, 0o644);
    fs.writeFileSync(idxPath, idx);
    return { x, y };
  }

  it("b.txt's blob is already in a pack, but its pack entry holds other bytes: refused, the branch does not move", async () => {
    const t = await primed();
    const { x } = swappedPack(t.proj, "bee\n", "FOREIGN SECRET CONTENT\n");
    expect(String(gitIn(t.proj, ["cat-file", "-p", x]))).toBe("FOREIGN SECRET CONTENT\n"); // the swap took effect
    fs.writeFileSync(path.join(t.proj, "b.txt"), "bee\n");
    const r = await saveTurnToGit({ folder: t.proj, summary: "second", turnId: "t2", env: process.env, privateDir: t.priv });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/does not hash back/);
    expect(plainGit(t.proj, ["rev-parse", "HEAD"]).trim()).toBe(t.tip);
  });
});

describe("a planted link at the path of the NEXT tree object (git refuses to write it, but leaves it)", () => {
  it.skipIf(!posix)("the planted name is removed, nothing is saved, and the next save writes the tree and commits", async () => {
    const t = await primed();
    fs.mkdirSync(path.join(t.proj, "sub"));
    fs.writeFileSync(path.join(t.proj, "sub", "x.txt"), "x\n");
    // The id of the tree "sub" the next save will write: tree entry "100644 x.txt\0<blob id bytes>".
    const blob = plainGit(t.proj, ["hash-object", path.join("sub", "x.txt")]).trim();
    const body = Buffer.concat([Buffer.from("100644 x.txt\0"), Buffer.from(blob, "hex")]);
    const treeId = crypto.createHash("sha1").update(`tree ${body.length}\0`).update(body).digest("hex");
    const treePath = path.join(t.proj, ".git", "objects", treeId.slice(0, 2), treeId.slice(2));
    fs.mkdirSync(path.dirname(treePath), { recursive: true });
    fs.symlinkSync(plainOutside(t), treePath);
    const r = await saveTurnToGit({ folder: t.proj, summary: "second", turnId: "t2", env: process.env, privateDir: t.priv });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/a link in place of a git object/);
    expect(fs.lstatSync(treePath, { throwIfNoEntry: false })).toBeUndefined();
    expect(fs.readFileSync(path.join(t.out, "victim"), "utf8")).toBe("VICTIM\n");
    const r3 = await saveTurnToGit({ folder: t.proj, summary: "third", turnId: "t3", env: process.env, privateDir: t.priv });
    expect(r3.ok && r3.commit).toBeTruthy();
    expect(plainGit(t.proj, ["rev-parse", "HEAD:sub"]).trim()).toBe(treeId);
    expect(fsckOk(t.proj)).toBe(true);
  });
});
