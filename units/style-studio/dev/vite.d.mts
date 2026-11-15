import type { IncomingMessage, ServerResponse } from "node:http";

/** A Vite plugin, written out so this unit needs no `vite` dependency: it is accepted wherever Vite takes a plugin. */
export interface StyleStudioSavePlugin {
  name: string;
  apply: "serve";
  configResolved(config: { root: string }): Promise<void>;
  configureServer(server: { middlewares: { use(route: string, handler: (req: IncomingMessage, res: ServerResponse) => void): unknown } }): void;
}

export const DEFAULT_SAVE_ROUTE: "/__studio/save";
export const DEFAULT_MAX_LOGO_BYTES: number;
export const DEFAULT_MAX_BODY_BYTES: number;
export interface StyleStudioSaveOptions {
  /** Where the style sheet is written, relative to Vite's project root. Must stay inside it. */
  tokensPath: string;
  /** Where the logo is written (`.png` or `.svg`), relative to the project root. Must stay inside it. Without it a logo is refused. */
  logoPath?: string;
  /** Default `/__studio/save`: the path `makeDevServerSave()` posts to. */
  route?: string;
  /** Default 1,000,000 bytes (decoded). */
  maxLogoBytes?: number;
  /** Default 4,000,000 bytes. */
  maxBodyBytes?: number;
}
export function styleStudioSave(options: StyleStudioSaveOptions): StyleStudioSavePlugin;
