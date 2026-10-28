import { termOrigin } from "@kaigilb/gilbplatformcode-term-origin";

export const defaultOntologyHost = (): string => new URL(termOrigin()).host;

export function defaultTermIri(name: string, host = defaultOntologyHost()): string {
  return `https://${host}/base/t/${encodeURIComponent(name)}`;
}

