// @vitest-environment node
// New. The Vite plugin `styleStudioSave` (`/vite`): a real temp project dir, a real HTTP server with the plugin's middleware mounted, and
// real requests. Writes, the refusals (path outside the root, size, kind, method, content type) and that a refusal writes nothing.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createServer, type Server } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { styleStudioSave, type StyleStudioSaveOptions } from "../dev/vite.mjs";

let dir = "";
let server: Server | null = null;
const dirs: string[] = [];

beforeEach(() => {
  dir = realpathSync(mkdtempSync(join(tmpdir(), "studio-save-")));
  dirs.push(dir);
});
afterEach(async () => {
  await new Promise<void>((r) => (server ? server.close(() => r()) : r()));
  server = null;
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

async function start(options: StyleStudioSaveOptions, root = dir): Promise<string> {
  const plugin = styleStudioSave(options);
  await plugin.configResolved({ root });
  let handler: ((req: never, res: never) => void) | null = null;
  plugin.configureServer({ middlewares: { use: (_route, h) => void (handler = h as never) } });
  server = createServer((req, res) => handler!(req as never, res as never));
  await new Promise<void>((r) => server!.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
}
const png = (extra = 0) => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(8 + extra, 1)]);
const dataUrl = (mime: string, b: Buffer) => `data:${mime};base64,${b.toString("base64")}`;
const post = (url: string, body: unknown, headers: Record<string, string> = { "content-type": "application/json" }) =>
  fetch(url, { method: "POST", headers, body: typeof body === "string" ? body : JSON.stringify(body) });
const SHEET = { version: 1, name: "n" };
const OPTS = { tokensPath: "saved/style.tokens.json", logoPath: "saved/logo.png" };

describe("styleStudioSave: what it writes", () => {
  it("writes the sheet and the PNG logo, makes the folder, and answers the files", async () => {
    const url = await start(OPTS);
    const logo = png();
    const res = await post(url, { sheet: SHEET, logoPng: dataUrl("image/png", logo) });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, files: ["saved/style.tokens.json", "saved/logo.png"] });
    expect(JSON.parse(readFileSync(join(dir, "saved/style.tokens.json"), "utf8"))).toEqual(SHEET);
    expect(readFileSync(join(dir, "saved/style.tokens.json"), "utf8").endsWith("\n")).toBe(true);
    expect(readFileSync(join(dir, "saved/logo.png")).equals(logo)).toBe(true);
  });

  it("a save with no logo writes only the sheet", async () => {
    const url = await start(OPTS);
    const res = await post(url, { sheet: SHEET });
    expect(await res.json()).toEqual({ ok: true, files: ["saved/style.tokens.json"] });
    expect(existsSync(join(dir, "saved/logo.png"))).toBe(false);
  });

  it("an SVG logo is written when logoPath is .svg", async () => {
    const url = await start({ tokensPath: "t.json", logoPath: "logo.svg" });
    const svg = Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>');
    const res = await post(url, { sheet: SHEET, logoSvg: dataUrl("image/svg+xml", svg) });
    expect(res.status).toBe(200);
    expect(readFileSync(join(dir, "logo.svg")).equals(svg)).toBe(true);
  });

  it("is a dev-server plugin only", () => {
    expect(styleStudioSave(OPTS).apply).toBe("serve");
  });
});

describe("styleStudioSave: the paths", () => {
  it.each([
    ["a path that climbs out with ..", { tokensPath: "../escape.json" }],
    ["an absolute path outside the root", { tokensPath: join(tmpdir(), "escape.json") }],
    ["a logo path that climbs out", { tokensPath: "t.json", logoPath: "../../logo.png" }],
    ["the root itself", { tokensPath: "." }],
  ])("refuses %s at start-up", async (_name, o) => {
    await expect(start(o as StyleStudioSaveOptions)).rejects.toThrow(/outside the project root/);
    expect(existsSync(join(dir, "..", "escape.json"))).toBe(false);
  });

  it("refuses a path that leaves the root through a symlink", async () => {
    const outside = realpathSync(mkdtempSync(join(tmpdir(), "studio-outside-")));
    dirs.push(outside);
    mkdirSync(join(dir, "saved"));
    symlinkSync(outside, join(dir, "saved", "link"));
    await expect(start({ tokensPath: "saved/link/style.tokens.json" })).rejects.toThrow(/outside the project root/);
    expect(existsSync(join(outside, "style.tokens.json"))).toBe(false);
  });

  it("refuses a logoPath that is not .png or .svg, and a missing tokensPath", () => {
    expect(() => styleStudioSave({ tokensPath: "t.json", logoPath: "logo.exe" })).toThrow(/\.png or \.svg/);
    expect(() => styleStudioSave({} as StyleStudioSaveOptions)).toThrow(/tokensPath is required/);
  });
});

describe("styleStudioSave: refusals write nothing", () => {
  const refused = async (body: unknown, status: number, headers?: Record<string, string>) => {
    const url = await start({ ...OPTS, maxLogoBytes: 100 });
    const res = await post(url, body, headers);
    expect(res.status).toBe(status);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(false);
    expect(existsSync(join(dir, "saved"))).toBe(false);
  };

  it("a logo over the size limit: 413, and the sheet is not written either", () => refused({ sheet: SHEET, logoPng: dataUrl("image/png", png(500)) }, 413));
  it("a logo that says PNG but is not: 400", () => refused({ sheet: SHEET, logoPng: dataUrl("image/png", Buffer.from("not a png at all")) }, 400));
  it("a JPEG (any other type) is refused", () => refused({ sheet: SHEET, logoPng: dataUrl("image/jpeg", png()) }, 400));
  it("an SVG with a script in it is refused", () => refused({ sheet: SHEET, logoSvg: dataUrl("image/svg+xml", Buffer.from("<svg><script>1</script></svg>")) }, 400));
  it("an SVG sent to a .png logo path is refused", () => refused({ sheet: SHEET, logoSvg: dataUrl("image/svg+xml", Buffer.from("<svg/>")) }, 400));
  it("a body that is not { sheet }: 400", () => refused({ nope: 1 }, 400));
  it("a body that is not JSON: 400", () => refused("{", 400));
  it("a request that is not application/json: 415", () => refused({ sheet: SHEET }, 415, { "content-type": "text/plain" }));

  it("a body over the body limit: 413", async () => {
    const url = await start({ ...OPTS, maxBodyBytes: 200 });
    const res = await post(url, { sheet: { ...SHEET, pad: "x".repeat(1000) } });
    expect(res.status).toBe(413);
    expect(existsSync(join(dir, "saved"))).toBe(false);
  });

  it("a GET: 405", async () => {
    const url = await start(OPTS);
    const res = await fetch(url);
    expect(res.status).toBe(405);
  });

  it("a logo when no logoPath was set: 400", async () => {
    const url = await start({ tokensPath: "t.json" });
    const res = await post(url, { sheet: SHEET, logoPng: dataUrl("image/png", png()) });
    expect(res.status).toBe(400);
    expect(existsSync(join(dir, "t.json"))).toBe(false);
  });
});
