import type { Plugin } from "vite";
export const BRIDGE_FILE_NAME: string;
export const BRIDGE_SOURCE: string;
/** The bridge source with DEFAULT_ALLOWED_ORIGINS set to the given origins. Throws on an invalid origin or if the line is not found exactly once. */
export function injectDefaultAllowedOrigins(source: string, origins?: readonly string[]): string;
export function claudeCodeBridgeFile(opts?: { defaultAllowedOrigins?: readonly string[] }): Plugin;
