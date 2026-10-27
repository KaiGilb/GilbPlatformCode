// Test-only: the bridge unit ships its bridge as a plain .mjs file with no declarations. Only the end-to-end test imports it.
declare module "@kaigilb/gilbplatformcode-claude-code-bridge/bridge.mjs" {
  export function createBridge(opts?: Record<string, unknown>): {
    start(): Promise<number>;
    close(): Promise<void>;
    port: number;
    pairingCode: string;
  };
}
