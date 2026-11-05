// @vitest-environment node
// A site that does not install TypeScript must still be able to build this component.
// `defineProps<ImportedType>()` makes Vue's compiler load that type, which needs the `typescript`
// package. An inline prop type does not. This test is that build: a temp Vite project whose
// node_modules cannot resolve `typescript`, then `vite build --ssr` on an entry that imports the component.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test } from "vitest";

const unit = fileURLToPath(new URL("..", import.meta.url));
const VUE = "3.5.44";
const VITE = "5.4.21";
const PLUGIN = "5.2.4";
const cache = join(tmpdir(), `vue-no-ts-host-${VUE}-${VITE}-${PLUGIN}`);

function installHost(): void {
  mkdirSync(cache, { recursive: true });
  writeFileSync(
    join(cache, "package.json"),
    JSON.stringify({
      name: "vue-no-ts-host",
      private: true,
      type: "module",
      dependencies: { vue: VUE, vite: VITE, "@vitejs/plugin-vue": PLUGIN },
    }),
  );
  if (existsSync(join(cache, "node_modules", "vite", "bin", "vite.js")) && existsSync(join(cache, "node_modules", "vue", "compiler-sfc", "register-ts.js"))) return;
  const installed = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
    cwd: cache,
    encoding: "utf8",
    env: { ...process.env, NODE_PATH: "" },
    timeout: 180_000,
  });
  if (installed.status !== 0) {
    throw new Error(`npm install failed\n${installed.stdout}\n${installed.stderr}`);
  }
}

test("vite build --ssr succeeds when the host cannot resolve typescript", () => {
  installHost();
  const dir = mkdtempSync(join(tmpdir(), "titled-section-build-"));
  try {
    symlinkSync(join(cache, "node_modules"), join(dir, "node_modules"), "dir");
    cpSync(join(unit, "src"), join(dir, "src"), { recursive: true });
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "host", private: true, type: "module" }));
    writeFileSync(join(dir, "entry.js"), `import TitledSection from "./src/TitledSection.vue";\nexport default TitledSection;\n`);
    writeFileSync(
      join(dir, "vite.config.js"),
      `import vue from "@vitejs/plugin-vue";\nimport { defineConfig } from "vite";\nexport default defineConfig({ plugins: [vue()] });\n`,
    );

    const requireFromCompiler = createRequire(join(dir, "node_modules/vue/compiler-sfc/register-ts.js"));
    expect(() => requireFromCompiler.resolve("typescript"), "this host must not resolve typescript").toThrow();

    const built = spawnSync(process.execPath, [join(dir, "node_modules/vite/bin/vite.js"), "build", "--ssr", "entry.js"], {
      cwd: dir,
      encoding: "utf8",
      env: { ...process.env, NODE_PATH: "" },
      timeout: 60_000,
    });
    expect(built.status, `${built.stdout}\n${built.stderr}`).toBe(0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}, 180_000);
