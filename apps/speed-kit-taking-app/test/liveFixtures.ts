// Fixtures for the live-mode tests. Every answer carries the SHAPE of the real server's answer (RuleRigdevLwsReadWriteKeyShape); the file:line is
// in GilbPlatform at 3185a3b8 (src/...). The values are made up (example.test hosts, no person).
export const PLATFORM = "https://platform.example.test"; // the apex: no request may go here
export const ID_ORIGIN = "https://id.platform.example.test";
export const VAULT = "https://ann.platform.example.test/vault";
export const OTHER_VAULT = "https://zoe.platform.example.test/vault";
export const VAULT_ORIGIN = "https://ann.platform.example.test";
export const PRINCIPAL = "https://id.platform.example.test/base/p/ann"; // a server-authored principal URI
export const EMAIL = ["typed.person", "mail.example.test"].join("@"); // a made-up address on an example host

/** `GET /lws/vaults` node: src/lws/vaults.ts:128-176 (`ReachableVaultNode`). */
export const vaultNode = (vaultId: string, name: string) => ({
  "@id": `${vaultId.replace(/\/vault$/, "")}/base/e/pod-${name}`,
  vaultId,
  name,
  partOf: null,
  parentAmbiguous: false,
  modes: ["read", "write"],
  represents: null,
  isLandingVault: false,
});

/** `GET /lws/vaults` document: src/lws/vaults.ts:250-277 (`ReachableVaultsDocument`: total, vaults, complete, incompletePeers). */
export const reachBody = (vaults: ReturnType<typeof vaultNode>[], complete = true, incompletePeers = 0) => ({
  "@context": "https://platform.example.test/lws/context",
  "@id": `${ID_ORIGIN}/lws/vaults`,
  total: vaults.length,
  vaults,
  complete,
  incompletePeers,
});

const row = (n: number) => ({
  // src/lws/records.ts:134-176 (`RecordRefEntry` + the `?include=body` members `body` and `etag`)
  entity: `${VAULT_ORIGIN}/base/e/e${n}`,
  typeUri: "t:CatalogEntry",
  updatedAt: new Date(Date.UTC(2026, 9, 1, 0, 0, 10 - n)).toISOString(),
  label: `Entry ${n}`,
  vault: VAULT,
  vaultAmbiguous: false,
  body: { name: `Entry ${n}`, description: `Description ${n}` },
  etag: `"sha256:${String(n).repeat(8)}"`,
});

/** `GET …/records` page: src/lws/records.ts:1043-1060 (`total`, `totalItemsKind`, `returnedRecords`, `complete`, `pageSize`, `offset`, `nextOffset` with include=body, `nextCursor` in since mode, `records`, `types`, `vault`, `scannedVaults`). */
export const recordsBody = (rows: number, extra: Record<string, unknown> = {}) => ({
  "@context": "https://platform.example.test/lws/context",
  "@id": `${VAULT_ORIGIN}/lws/vault/${encodeURIComponent(VAULT)}/records`,
  total: rows,
  totalItemsKind: "exact",
  returnedRecords: rows,
  complete: true,
  pageSize: 200,
  offset: 0,
  records: Array.from({ length: rows }, (_, i) => row(i + 1)),
  types: [{ typeUri: "t:CatalogEntry", count: rows }],
  vault: VAULT,
  scannedVaults: [VAULT],
  ...extra,
});

/** The sign-in answer: src/routes/email-auth.ts:473 `{ token, principal, needsVaultName }`. */
export const verifyBody = { token: "access-token-value", principal: PRINCIPAL, needsVaultName: false };
