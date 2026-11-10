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
  sessions: Map<string, Session>;
  usedProofs: Set<string>;
  /** The one position counter. */
  seq: number;
}

export type PersonRef = Person | string;
export type VaultRef = Vault | string;
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
  hold(match: Match): () => void;

  /** Throws when a request reached no route or a foreign host. */
  assertClean(): void;
  reset(): void;
}
