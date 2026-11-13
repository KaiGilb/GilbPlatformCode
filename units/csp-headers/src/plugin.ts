import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, resolve } from "node:path";
import { headersFileText, mergeHeadersFile, metaPolicy, readPolicy, withMetaPolicy } from "./csp";

export interface CspHeadersOptions {
  /** The policy file, one directive per line, `#` comments. Relative to the project root. Default `security/csp.txt`. */
  policyFile?: string;
  /** The policy itself, in the same format; when given, the file is not read. */
  policy?: string;
  /** Other headers for the dev and preview responses and the `_headers` file. */
  extraHeaders?: Record<string, string>;
  /** The file written into the build folder (Cloudflare Pages `_headers`), or `false` for none. Default `_headers`. */
  headersFile?: string | false;
  /** True for a request or page path that must carry no policy (a dev-only page). Applies to the response header and the meta tag. */
  exclude?: (path: string) => boolean;
  /** Changes the policy for one place: `"dev"` for the dev server (header and meta), `"build"` for the build and the preview server. */
  transformPolicy?: (policy: string, mode: "dev" | "build") => string;
}

type Next = () => void;
type Req = { url?: string | undefined };
type Res = { setHeader(name: string, value: string): unknown };
type Middlewares = { use(fn: (req: Req, res: Res, next: Next) => void): unknown };

/** The part of a Vite plugin this one uses, written out so the unit needs no `vite` package; it is assignable to Vite's `Plugin`. */
export interface CspHeadersPlugin {
  name: string;
  configResolved(config: { command: string; root: string; build: { outDir: string } }): void;
  configureServer(server: { middlewares: Middlewares }): void;
  configurePreviewServer(server: { middlewares: Middlewares }): void;
  transformIndexHtml(html: string, ctx: { path?: string; filename?: string }): string;
  writeBundle(): void;
}

const pathOf = (url: string | undefined): string => (url ?? "").split("?")[0]!.split("#")[0]!;

/**
 * One policy, three places: the `<meta>` tag of every page (dev and build), the header on dev and preview responses, and the
 * `_headers` file in the build folder. Put it first in `plugins`.
 */
export function cspHeaders(options: CspHeadersOptions = {}): CspHeadersPlugin {
  const extra = options.extraHeaders ?? {};
  const headersFile = options.headersFile === undefined ? "_headers" : options.headersFile;
  let root = process.cwd();
  let outDir = "dist";
  let command = "build";

  /** Read each time, so an edit to the file shows on the next request in dev. */
  const policyFor = (mode: "dev" | "build"): string => {
    let text: string;
    if (options.policy !== undefined) text = options.policy;
    else {
      const file = resolve(root, options.policyFile ?? "security/csp.txt");
      if (!existsSync(file)) throw new Error(`The Content-Security-Policy file ${options.policyFile ?? "security/csp.txt"} was not found (looked for ${file}). Make it, or pass \`policy\`.`);
      text = readFileSync(file, "utf8");
    }
    const policy = readPolicy(text);
    return options.transformPolicy ? readPolicy(options.transformPolicy(policy, mode)) : policy;
  };
  const excluded = (path: string): boolean => options.exclude?.(path) === true;
  const middleware = (mode: "dev" | "build") => (req: Req, res: Res, next: Next): void => {
    if (!excluded(pathOf(req.url))) {
      res.setHeader("Content-Security-Policy", policyFor(mode));
      for (const [name, value] of Object.entries(extra)) if (name.toLowerCase() !== "content-security-policy") res.setHeader(name, value);
    }
    next();
  };

  return {
    name: "csp-headers",
    configResolved(config) {
      command = config.command;
      root = config.root;
      outDir = config.build.outDir;
    },
    configureServer(server) {
      server.middlewares.use(middleware("dev"));
    },
    configurePreviewServer(server) {
      server.middlewares.use(middleware("build"));
    },
    transformIndexHtml(html, ctx) {
      if (excluded(pathOf(ctx.path ?? ctx.filename))) return html;
      return withMetaPolicy(html, metaPolicy(policyFor(command === "serve" ? "dev" : "build")));
    },
    // After Vite has copied `public/`, so an `_headers` file the app already has is merged, not overwritten.
    writeBundle() {
      if (command !== "build" || headersFile === false) return;
      const target = resolve(isAbsolute(outDir) ? outDir : resolve(root, outDir), headersFile);
      const policy = policyFor("build");
      const text = existsSync(target) ? mergeHeadersFile(readFileSync(target, "utf8"), policy, extra) : headersFileText(policy, extra);
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, text);
    },
  };
}
