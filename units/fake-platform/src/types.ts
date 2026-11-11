export type GrantMode = "read" | "write" | "append" | "control";

export interface Person {
  email: string;
  /** The opaque principal the platform knows the person by: `https://<id host>/base/p/<id>`. */
  principal: string;
  landingVaultId: string | null;
}
export interface Vault {
  /** The id `GET /lws/vaults` lists: `https://<host>/vault`. */
  id: string;
  name: string;
  host: string;
  owner: string;
  represents: string | null;
  partOf: string | null;
  /** The vault's own entity URI (the deed), the `@id` of its node in GET /lws/vaults and what create-named's `parentVault` must be. */
  entity: string;
  /**
   * The email of the person who minted this vault through create-named, else null. Only a vault minted that way may be a
   * `parentVault` for that person: the sign-up landing vault, a seeded vault and a vault another person minted are not
   * (GilbPlatform src/routes/vault.ts:522 and :738, "nest only under vaults you have minted").
   */
  mintedBy: string | null;
  /** A partial mint (create-named answered 202): the facts exist, the owner has no reach yet; re-issuing the same request completes it. */
  pending: boolean;
}
export interface FakeRecord {
  id: string;
  vaultId: string;
  /** The bare type name ("Sailboat"), or null for an untyped record. */
  type: string | null;
  typeUri: string | null;
  /** Bare fact keys (no `a:` prefix), as the platform serves them. */
  facts: Record<string, unknown>;
  /** Moves on every write, including `bump`: the ETag is a hash of the state plus this. */
  rev: number;
  /** Position of the last write. One counter for the whole fake. */
  seq: number;
  updatedAt: string;
  endedSeq: number | null;
  endedAt: string | null;
}
/** A file: a record (so PATCH and GET /lws/r/:id reach it) plus its bytes. Its describing facts are the platform's a:file* slugs, bare. */
export interface FakeFile extends FakeRecord {
  bytes: Uint8Array;
  /** The identity the platform hashes from the file facts: same value, same file (not served). */
  identity: string;
}
export interface Session {
  token: string;
  principal: string;
  email: string;
  /** RFC 7638 thumbprint of the key the token is bound to; null = unbound (no key check). */
  jkt: string | null;
  exp: number;
}
export interface FakeState {
  people: Map<string, Person>;
  vaults: Map<string, Vault>;
  /** vault id to principal to modes held. */
  grants: Map<string, Map<string, Set<GrantMode>>>;
  /** `<vault id>\n<principal>` of every access the owner took away. */
  revoked: Set<string>;
  records: Map<string, FakeRecord>;
  files: Map<string, FakeFile>;
  sessions: Map<string, Session>;
  /** email to the one-time code last issued. */
  codes: Map<string, { code: string; expiresAt: number; name?: string }>;
  /** normalised names held by someone else (takeName). */
  takenNames: Set<string>;
  usedProofs: Set<string>;
  /** The one position counter. */
  seq: number;
}

export type PersonRef = Person | string;
export interface FakeAuthHost {
  bearerHeaderFor(url: string, method?: string): Promise<Record<string, string>>;
  dpopReadAuth(method: string, url: string): Promise<Record<string, string>>;
  dpopWriteAuth(method: string, url: string): Promise<Record<string, string>>;
  invalidateDpop(): void;
  tokenManager: {
    getSession(): Promise<{ principal: string; vault: null; vaults: { vaultId: string; modes: ("read" | "write")[] }[] }>;
    invalidate(): void;
  };
}
export type VaultRef = Vault | string;
export type FileRef = FakeFile | string;
export type Method = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
export type Match = `${Method} ${string}` | RegExp;

export interface Call {
  n: number;
  method: string;
  url: string;
  host: string;
  path: string;
  query: Record<string, string[]>;
  headers: Record<string, string>;
  /** JSON body parsed; a body that is not JSON text is kept as it came. */
  body: unknown;
  as?: { principal: string; email: string };
  proof: { ok: boolean; reason?: string };
  status: number | "network-error";
  injected?: boolean;
  at: number;
}
export interface Calls {
  all: Call[];
  of(match: Match): Call[];
  last(match?: Match): Call | undefined;
  count(match?: Match): number;
  clear(): void;
}

export interface FakePlatformOptions {
  /** The platform origin. Default "https://fake.test". Its host and every host under `domain` are this platform. */
  origin?: string;
  /** Vault hosts are `<name>.<domain>`. Default: the origin's host. */
  domain?: string;
  /** Extra hosts answered as this platform (a dev rig). Any other host is a violation. */
  hosts?: string[];
  /** "strict" (default): a call without `Authorization: DPoP <token>` and a `DPoP` header is 401 on every route. "platform": the platform's own postures. */
  dpop?: "strict" | "platform";
  /** Fact keys the vaults refuse with 409 UndefinedTermError (bare or `a:`-prefixed). Default: none. */
  undefinedTerms?: string[];
  /** Seconds a DPoP proof's `iat` may be from now. Default 60. */
  proofWindowSeconds?: number;
  /** Fixed one-time code, or a function of the email. Default "000000". The real code is random and emailed. */
  code?: string | ((email: string) => string);
  /** The segment of the vault address sign-in answers (check-name `address`, create-named `vaultId`, verify-code `vaultId`): "vault" (default) or "base". SOURCE-DERIVED, NOT MEASURED ON THE WIRE: see DESIGN section 14. */
  createNamedVaultSegment?: "base" | "vault";
  /** A taken vault name on create-named: "refuse" (default) = 409 VaultNameTaken, the cross-store mint production runs; "suffix" = the local mint's silent name2. */
  nameCollision?: "refuse" | "suffix";
  /** Type IRIs create-named accepts as `represents`. Default: any https `.../base/t/<Name>` IRI. */
  knownTypes?: string[];
  /** The file listing carries `transcodedFrom` on each file (GilbPlatform 78d1fb1d, #691, live 2026-11-10). Default true. */
  listingCarriesTranscodedFrom?: boolean;
  now?: () => number;
  latencyMs?: () => number;
}

export interface FakePlatform {
  fetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  /** A `{ origin, fetch }` for record-sync; the fetch is the fake's own, so a caller that signs wraps it. */
  client(origin?: string): { origin: string; fetch: (url: string, init?: RequestInit) => Promise<Response> };
  readonly state: FakeState;
  readonly calls: Calls;
  readonly violations: string[];
  readonly origin: string;
  offline: boolean;

  seedPerson(p: { email: string; vaultName?: string; represents?: string }): Person;
  seedVault(v: { name: string; owner: PersonRef; partOf?: VaultRef; represents?: string; host?: string }): Vault;
  seedRecord(v: VaultRef, r: { type?: string; facts: Record<string, unknown>; id?: string }): FakeRecord;
  grant(v: VaultRef, who: PersonRef, mode: GrantMode): void;
  /** Put a file in a vault with no request. `transcodedFrom` is a file or its entity URI. */
  seedFile(v: VaultRef, f: { name: string; bytes: Uint8Array; mediaType?: string; type?: string; folders?: string[]; tags?: string[]; storedWith?: string; transcodedFrom?: FileRef; uploader?: PersonRef }): FakeFile;
  /** A master `<name>.jpg` and its small copy `<name>-320.jpg` (as picture-set names them), the copy linked to the master by `transcodedFrom`. */
  seedPicture(v: VaultRef, p: { name: string; master: Uint8Array; thumb: Uint8Array }): { master: FakeFile; thumb: FakeFile };
  /** Someone else holds this name: check-name says taken, create-named is 409. */
  takeName(name: string): void;
  /** The one-time code last issued to this email by request-code (undefined when none or used). */
  pendingCode(email: string): string | undefined;
  /** The next `times` create-named answers are 202 (partial mint): the vault's facts exist, the name is claimed, the owner has no reach (it is not in /lws/vaults) until the identical request is sent again (then 201). */
  partialNextCreateNamed(opts?: { times?: number }): () => void;
  /** A `Transport` for the signin unit (its calls take `{ transport }`). */
  transport: (url: string, init: RequestInit & { timeoutMs?: number }) => Promise<Response>;
  /** A host for lws-session-bridge `setLwsAuth`: signs real-shaped proofs with a made-up key the token is bound to. No signature is made; the fake does not check one. */
  authHost(p: PersonRef): FakeAuthHost;
  /** A token the fake accepts for this person. With `jwk` the token is bound to that key (and a proof must carry it). */
  signInAs(p: PersonRef, opts?: { jwk?: { kty: string; crv: string; x: string; y: string } }): { token: string; principal: string };

  /** Another device changes a record: facts merged (null removes one), position and ETag move. */
  edit(id: string, facts: Record<string, unknown>): void;
  /** Another device ends a record. */
  remove(id: string): void;
  /** The ETag moves with no change to the facts: the app's next If-Match is stale. */
  bump(id: string): void;
  /** The owner takes the person's access to the vault away. */
  revokeAccess(p: PersonRef, v: VaultRef): void;

  failNext(match: Match, f: { status: number; body?: unknown; message?: string; times?: number; skip?: number }): () => void;
  dropNext(match: Match, opts?: { times?: number; skip?: number }): () => void;
  /** Matching requests wait until the returned function is called; `skip` lets the first n through (a list whose first pages answer and the rest wait). */
  hold(match: Match, opts?: { skip?: number }): () => void;

  /** Throws when a request reached no route or a foreign host. */
  assertClean(): void;
  reset(): void;
}
