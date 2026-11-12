import type { Plugin } from "vite";
export const CONNECTOR_FILE_NAME: string;
export const CONNECTOR_SOURCE: string;
export function gilbConnectorFile(): Plugin;
export function connectorInstallCommands(fileUrl: string): { download: string; add: string };
export function codexInstallCommands(
  url: string,
  opts: { shell: "posix" | "powershell"; name?: string },
): { download: string; add: string; start: string; configFile: string; configLines: string[]; server: string };
