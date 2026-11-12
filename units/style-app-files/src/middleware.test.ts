// @vitest-environment node
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStudioSaveMiddleware, writeStyleFiles } from "./index.mjs";
import { PNG_URL, cleanup, installFont, makeApp, sheetWith } from "./fixtures";

let server: Server;
let url: string;
let app: string;
let maxBytes: number | undefined;
beforeEach(async () => {
  app = makeApp();
  maxBytes = undefined;
  // the limit is read per request so a test can set it after the server is up
  server = createServer((req, res) => createStudioSaveMiddleware({ appRoot: app, ...(maxBytes === undefined ? {} : { maxBytes }) })(req, res));
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/__studio/save`;
});
afterEach(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  server.closeAllConnections();
  cleanup();
});

const post = (body: unknown) => fetch(url, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });
const publicFiles = () => readdirSync(path.join(app, "public")).sort();
const sheet = sheetWith({ sans: { family: "Inter", source: "bundled" } });

describe("createStudioSaveMiddleware", () => {
  it("answers GET with 405 and Allow: POST", async () => {
    const r = await fetch(url);
    expect(r.status).toBe(405);
    expect(r.headers.get("allow")).toBe("POST");
    expect(r.headers.get("content-type")).toBe("application/json");
    expect(typeof (await r.json()).message).toBe("string");
    expect(publicFiles()).toEqual([]);
  });
  it("answers 413 when the body is bigger than maxBytes, and writes nothing", async () => {
    maxBytes = 200;
    const big = JSON.stringify({ sheet: { pad: "x".repeat(500) } });
    const r = await post(big);
    expect(r.status).toBe(413);
    expect((await r.json()).message).toBe("The body is too large.");
    expect(publicFiles()).toEqual([]);
  });
  it("a body of exactly maxBytes is accepted", async () => {
    const body = JSON.stringify({ sheet: {} });
    maxBytes = Buffer.byteLength(body);
    expect((await post(body)).status).toBe(200);
  });
  it("answers 400 for invalid JSON", async () => {
    const r = await post("{not json");
    expect(r.status).toBe(400);
    expect((await r.json()).message).toBe("The body is not valid JSON.");
    expect(publicFiles()).toEqual([]);
  });
  it("answers 400 when the body has no sheet object", async () => {
    for (const body of [[], null, 3, {}, { sheet: [] }, { sheet: "x" }]) {
      const r = await post(body);
      expect(r.status, JSON.stringify(body)).toBe(400);
      expect((await r.json()).message).toBe("The body needs a sheet object.");
    }
    expect(publicFiles()).toEqual([]);
  });
  it("answers 400 and writes NOTHING for a logo whose prefix is wrong", async () => {
    for (const logoPng of ["data:image/jpeg;base64," + Buffer.from([0xff, 0xd8, 0xff]).toString("base64"), "PNG", 7, "data:image/png,abc"]) {
      const r = await post({ sheet, logoPng });
      expect(r.status, String(logoPng)).toBe(400);
      expect((await r.json()).message).toMatch(/PNG/);
    }
    expect(publicFiles()).toEqual([]);
  });
  it("answers 400 and writes NOTHING for the right prefix but bytes that are not a PNG", async () => {
    const notPng = [
      "data:image/png;base64," + Buffer.from("GIF89a not a png").toString("base64"),
      "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"), // the signature cut short
      "data:image/png;base64," + Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0b, 1]).toString("base64"), // last signature byte wrong
      "data:image/png;base64,",
    ];
    for (const logoPng of notPng) {
      const r = await post({ sheet, logoPng });
      expect(r.status, logoPng).toBe(400);
    }
    expect(publicFiles()).toEqual([]);
  });
  it("on success writes the tokens (pretty JSON) and the logo, with status 200 and no path in the message", async () => {
    installFont(app, "inter");
    const r = await post({ sheet, logoPng: PNG_URL });
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("application/json");
    const answer = await r.json();
    expect(answer).toEqual({ message: "Saved style and logo." });
    expect(JSON.stringify(answer)).not.toContain(app);
    expect(readFileSync(path.join(app, "public/style.tokens.json"), "utf8")).toBe(JSON.stringify(sheet, null, 2) + "\n");
    const png = readFileSync(path.join(app, "public/brand-logo.png"));
    expect([...png.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(png.length).toBe(12);
    expect(existsSync(path.join(app, "public/fonts/inter/inter-latin-400-normal.woff2"))).toBe(true);
    expect(publicFiles()).toEqual(["brand-logo.png", "fonts", "fonts.css", "style.tokens.json"]); // no .tmp left behind
  });
  it("without a logo writes only the tokens and says so", async () => {
    const r = await post({ sheet: sheetWith({ sans: { family: "Arial", source: "system" } }) });
    expect(await r.json()).toEqual({ message: "Saved style." });
    expect(existsSync(path.join(app, "public/brand-logo.png"))).toBe(false);
  });
  it("a font problem is 200 with fontsWarning", async () => {
    const r = await post({ sheet: sheetWith({ sans: { family: "Fraunces", source: "bundled" } }) });
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ message: "Saved style.", fontsWarning: "Font package @fontsource/fraunces is not installed; skipped." });
    expect(existsSync(path.join(app, "public/style.tokens.json"))).toBe(true);
  });
});

describe("writeStyleFiles", () => {
  it("returns the status and message the middleware sends", async () => {
    expect(await writeStyleFiles({ sheet: {} }, { appRoot: app })).toEqual({ status: 200, message: "Saved style." });
    expect((await writeStyleFiles({ sheet: {}, logoPng: "nope" }, { appRoot: app })).status).toBe(400);
    expect((await writeStyleFiles(null as never, { appRoot: app })).status).toBe(400);
  });
});
