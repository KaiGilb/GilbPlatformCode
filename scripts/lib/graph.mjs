// The package graph of the units: who needs whom. Plain Node ESM, no dependencies.
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const LIB = /^@kaigilb\/(gilbplatformcode|gilbwebsitecode)-/;

/**
 * Load every unit's package.json. Returns { pkgs, byName }.
 * pkgs: key ("units/x" | "web-units/x") -> { name, libs, third, dev }
 *   libs  = library names from peerDependencies, plus those in dependencies whose spec starts with "file:"
 *   third = the other peerDependencies (name -> range)
 *   dev   = @kaigilb/... names in devDependencies whose spec starts with "file:" (see testEdges)
 * byName: package name -> key. Folders: units, and web-units when `web`.
 */
export function loadGraph(repo, { web = false } = {}) {
  const pkgs = new Map();
  for (const dir of web ? ["units", "web-units"] : ["units"]) {
    const root = join(repo, dir);
    if (!existsSync(root)) continue;
    for (const f of readdirSync(root).sort()) {
      const p = join(root, f, "package.json");
      if (!existsSync(p)) continue;
      const j = JSON.parse(readFileSync(p, "utf8"));
      const libs = [], third = {};
      for (const [n, r] of Object.entries(j.peerDependencies || {})) if (LIB.test(n)) libs.push(n); else third[n] = r;
      for (const [n, v] of Object.entries(j.dependencies || {})) if (LIB.test(n) && String(v).startsWith("file:")) libs.push(n);
      const dev = [];
      for (const [n, v] of Object.entries(j.devDependencies || {})) if (n.startsWith("@kaigilb/") && String(v).startsWith("file:")) dev.push(n);
      pkgs.set(`${dir}/${f}`, { name: j.name, libs: [...new Set(libs)], third, dev: [...new Set(dev)] });
    }
  }
  const byName = new Map([...pkgs].map(([k, v]) => [v.name, k]));
  return { pkgs, byName };
}

/** Names of @kaigilb/... packages a unit's tests install (devDependencies with a file: spec). */
export const testEdges = (pkg) => pkg.dev || [];

/** Sorted unit keys, not in `keys`, that reach any of `keys` through libs and test edges, transitively. */
export function dependents(graph, keys) {
  const { pkgs, byName } = graph;
  const rev = new Map();
  for (const [k, p] of pkgs) {
    for (const n of [...p.libs, ...testEdges(p)]) {
      const t = byName.get(n);
      if (!t) continue;
      if (!rev.has(t)) rev.set(t, new Set());
      rev.get(t).add(k);
    }
  }
  const start = new Set(keys), seen = new Set(), queue = [...start];
  while (queue.length) {
    for (const d of rev.get(queue.pop()) || []) if (!seen.has(d)) { seen.add(d); queue.push(d); }
  }
  return [...seen].filter((k) => !start.has(k)).sort();
}
