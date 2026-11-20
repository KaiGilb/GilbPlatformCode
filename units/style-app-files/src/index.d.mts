import type { IncomingMessage, ServerResponse } from "node:http";
import type { StyleSheet } from "@kaigilb/gilbplatformcode-style-runtime";

/** The OLD in-folder marker ".style-app-files". No longer written; read once and deleted when found (migration). */
export const MARKER: string;
/** "style-app-files.manifest.json", at the app root: the record of the folders and files this tool made. Never under public/. */
export const MANIFEST: string;

/** The @fontsource package name of a family: lower case, spaces to hyphens, other characters dropped. */
export function fontsourceSlug(family: string): string;

/** Keeps only the woff2 source of an @fontsource stylesheet and points it at `<urlBase>/<slug>/` (default urlBase "/fonts"). */
export function rewriteFontCss(css: string, slug: string, urlBase?: string): { css: string; files: string[] };

export interface ExportFontsOptions {
  /** The app's folder; @fontsource packages are resolved from its package.json. */
  appRoot: string;
  /** Default "public", relative to appRoot. */
  publicDir?: string;
  /** Default "/fonts". */
  urlBase?: string;
  /** Default "fonts.css", written in publicDir. */
  cssFile?: string;
  /** Default [400, 600]. */
  weights?: number[];
}
export function exportFonts(sheet: StyleSheet | { fonts?: unknown }, o: ExportFontsOptions): Promise<{ families: string[]; warnings: string[] }>;

export interface StyleFilesResult {
  status: number;
  message: string;
  fontsWarning?: string;
}
export function writeStyleFiles(body: { sheet: unknown; logoPng?: unknown }, o: { appRoot: string }): Promise<StyleFilesResult>;

/** Connect-style handler: `server.middlewares.use("/__studio/save", createStudioSaveMiddleware({ appRoot }))`. `maxBytes` defaults to 8 MB. */
export function createStudioSaveMiddleware(o: { appRoot: string; maxBytes?: number }): (req: IncomingMessage, res: ServerResponse) => void;
