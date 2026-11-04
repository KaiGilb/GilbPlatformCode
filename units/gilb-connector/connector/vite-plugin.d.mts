import type { Plugin } from "vite";
export const CONNECTOR_FILE_NAME: string;
export const CONNECTOR_SOURCE: string;
export function gilbConnectorFile(): Plugin;
export function connectorInstallCommands(fileUrl: string): { download: string; add: string };
