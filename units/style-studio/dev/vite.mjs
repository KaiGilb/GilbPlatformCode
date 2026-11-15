// Vite plugin: the dev-server half of the Studio's save. It answers `POST /__studio/save` (what `makeDevServerSave()` sends) and writes the
// style sheet to `tokensPath` and the logo to `logoPath`. Plain JavaScript on purpose: Vite loads this before your config is compiled.
//
//   import { styleStudioSave } from "@kaigilb/gilbplatformcode-style-studio/vite";
//   export default defineConfig({ plugins: [react(), styleStudioSave({ tokensPath: "saved/style.tokens.json", logoPath: "saved/logo.png" })] });
//
// It writes to your disk, so it is fenced: the dev server only (`apply: "serve"`, never in a build), both paths must stay inside the project
// root (checked at start-up, symlinks followed), the request must be `application/json` (a page on another site cannot send one without a
// pre-flight that the dev server refuses), the logo is PNG or SVG and checked by its bytes, and the body and the logo have size limits.
import { mkdir, realpath, writeFile } from "node:fs/promises";
import path from "node:path";

export const DEFAULT_SAVE_ROUTE = "/__studio/save";
export const DEFAULT_MAX_LOGO_BYTES = 1_000_000;
export const DEFAULT_MAX_BODY_BYTES = 4_000_000;
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

class Refusal extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

/** The nearest ancestor of `p` that exists, resolved through symlinks, with the part below it put back. */
async function realFromExisting(p) {
  const tail = [];
  let cur = p;
  for (;;) {
    try {
      return path.join(await realpath(cur), ...tail.reverse());
    } catch (e) {
      const parent = path.dirname(cur);
      if (parent === cur) throw e;
      tail.push(path.basename(cur));
      cur = parent;
    }
  }
}
const inside = (root, p) => {
  const rel = path.relative(root, p);
  return rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
};

/**
 * @param {{ tokensPath: string, logoPath?: string, route?: string, maxLogoBytes?: number, maxBodyBytes?: number }} options
 *   Paths are relative to Vite's project root (or absolute, but then they must still be inside it). `logoPath` ends in `.png` or `.svg`;
 *   without it a request that carries a logo is refused.
 * @returns {import("vite").Plugin}
 */
export function styleStudioSave(options) {
  const { tokensPath, logoPath, route = DEFAULT_SAVE_ROUTE, maxLogoBytes = DEFAULT_MAX_LOGO_BYTES, maxBodyBytes = DEFAULT_MAX_BODY_BYTES } = options ?? {};
  if (typeof tokensPath !== "string" || tokensPath === "") throw new Error("styleStudioSave: tokensPath is required.");
  const logoKind = logoPath === undefined ? null : /\.png$/i.test(logoPath) ? "png" : /\.svg$/i.test(logoPath) ? "svg" : null;
  if (logoPath !== undefined && logoKind === null) throw new Error("styleStudioSave: logoPath must end in .png or .svg.");
  let tokensFile = "";
  let logoFile = "";
  let rootDir = "";

  async function handle(req, res) {
    const send = (code, body) => {
      res.statusCode = code;
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify(body));
    };
    try {
      if (req.method !== "POST") throw new Refusal(405, "POST only.");
      if (!/^application\/json\b/i.test(String(req.headers["content-type"] ?? ""))) throw new Refusal(415, "The save must be sent as application/json.");
      const chunks = [];
      let size = 0;
      for await (const c of req) {
        size += c.length;
        if (size > maxBodyBytes) throw new Refusal(413, "The save is too large.");
        chunks.push(c);
      }
      let body;
      try {
        body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
      } catch {
        throw new Refusal(400, "Body must be { sheet, logoPng? }.");
      }
      if (!body || typeof body.sheet !== "object" || body.sheet === null || Array.isArray(body.sheet)) throw new Refusal(400, "Body must be { sheet, logoPng? }.");

      // Check everything before the first write, so a refused request leaves no half save.
      let logoBytes = null;
      const logoField = body.logoPng !== undefined ? "logoPng" : body.logoSvg !== undefined ? "logoSvg" : null;
      if (logoField) {
        const want = logoField === "logoPng" ? "png" : "svg";
        if (logoKind === null) throw new Refusal(400, "This dev server was not set up to save a logo.");
        if (want !== logoKind) throw new Refusal(400, `The logo must be a ${logoKind.toUpperCase()} (the logo file is .${logoKind}).`);
        const value = body[logoField];
        const m = typeof value === "string" ? (want === "png" ? /^data:image\/png;base64,([A-Za-z0-9+/]+=*)$/ : /^data:image\/svg\+xml;base64,([A-Za-z0-9+/]+=*)$/).exec(value) : null;
        if (!m) throw new Refusal(400, want === "png" ? "logoPng must be a data:image/png;base64 URL." : "logoSvg must be a data:image/svg+xml;base64 URL.");
        logoBytes = Buffer.from(m[1], "base64");
        if (logoBytes.length > maxLogoBytes) throw new Refusal(413, `The logo is larger than ${maxLogoBytes} bytes.`);
        if (want === "png" && !logoBytes.subarray(0, 8).equals(PNG_MAGIC)) throw new Refusal(400, "The logo is not a PNG.");
        if (want === "svg") {
          const text = logoBytes.toString("utf8");
          if (!/^\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE[^>]*>\s*)?<svg[\s>]/i.test(text)) throw new Refusal(400, "The logo is not an SVG.");
          if (/<script[\s>]|\son[a-z]+\s*=|javascript:/i.test(text)) throw new Refusal(400, "An SVG logo with a script in it is refused.");
        }
      }

      const files = [];
      try {
        await mkdir(path.dirname(tokensFile), { recursive: true });
        await writeFile(tokensFile, JSON.stringify(body.sheet, null, 2) + "\n");
        files.push(path.relative(rootDir, tokensFile).split(path.sep).join("/"));
        if (logoBytes) {
          await mkdir(path.dirname(logoFile), { recursive: true });
          await writeFile(logoFile, logoBytes);
          files.push(path.relative(rootDir, logoFile).split(path.sep).join("/"));
        }
      } catch {
        throw new Refusal(500, "Save failed.");
      }
      send(200, { ok: true, files });
    } catch (e) {
      if (e instanceof Refusal) return send(e.status, { ok: false, message: e.message });
      send(500, { ok: false, message: "Save failed." });
    }
  }

  return {
    name: "style-studio-save",
    apply: "serve",
    async configResolved(config) {
      rootDir = await realpath(config.root);
      const resolve = async (p, what) => {
        const abs = path.resolve(rootDir, p);
        if (!inside(rootDir, abs) || !inside(rootDir, await realFromExisting(abs))) throw new Error(`styleStudioSave: ${what} is outside the project root.`);
        return abs;
      };
      tokensFile = await resolve(tokensPath, "tokensPath");
      logoFile = logoPath === undefined ? "" : await resolve(logoPath, "logoPath");
    },
    configureServer(server) {
      server.middlewares.use(route, (req, res) => {
        void handle(req, res);
      });
    },
  };
}
