import { thumbprint, mintToken, type Caller } from "./auth";
import { badRequest, failure, forbidden, json, parseBody, schemaRefusal, type Core, type Req } from "./http";
import type { Person, Vault } from "./types";
import { makeVault } from "./vaults";

const PERSON_TYPE = "https://veda.gilb.com/base/t/Person";
const SIGN_IN_ATTR = "a:signInVault";
const SIGN_IN_TYPE = "https://veda.gilb.com/base/t/SignInPod";
const CODE_TTL_MS = 10 * 60 * 1000;
const MIN_VAULT_NAME_LENGTH = 3;
/** src/auth/reserved-names.ts:59-69 (DEFAULT_RESERVED_NAMES). The RESERVED_NAMES environment override is not modelled. */
const RESERVED = ["kaizen", "veda", "geo", "id", "skills", "life", "connect", "books", "maintain", "support", "requirements", "base", "lws", "i", "me", "api", "auth", "login", "signup", "onboard", "app", "vault", "pod", "well-known", "www", "mail", "mx", "ns", "ns1", "ns2", "cdn", "static", "assets", "root", "status"];

// ── the platform's name rules (src/auth/reserved-names.ts, src/auth/name-registry.ts) ──────────

/** Lower case, keep only a-z and 0-9, empty becomes `user`. src/auth/reserved-names.ts:18-21. */
export const normalizeName = (raw: string): string => {
  const slug = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.length > 0 ? slug : "user";
};
const RESERVED_SET = new Set(RESERVED.map(normalizeName));
/** Reserved label, or shorter than 3 characters. src/auth/reserved-names.ts:159,169-171. */
export const isRefusedName = (name: string): boolean => RESERVED_SET.has(normalizeName(name)) || normalizeName(name).length < MIN_VAULT_NAME_LENGTH;

/** What a name check says about the caller's own spelling. src/auth/reserved-names.ts:30-39. */
function nameChangeReport(raw: string): { requested: string; normalized?: true; note?: string } {
  const requested = raw.trim();
  const name = normalizeName(raw);
  if (name === requested) return { requested };
  return { requested, normalized: true, note: `'${requested}' is saved as '${name}': a vault name keeps only a–z and 0–9.` };
}

/** The vault address a name will have: `https://<name>.<domain>/vault` (or `/base`, option). src/auth/name-registry.ts:190-225. */
const addressFor = (core: Core, name: string): string => `https://${name}.${core.o.domain}/${core.o.segment}`;
const slugifyLocal = (email: string): string => {
  const slug = (email.split("@")[0] ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  return slug.length > 0 ? slug : "user";
};

/** Held by a vault (a pending one included) or by takeName. */
function holderOf(core: Core, name: string): Vault | "other" | null {
  for (const v of core.s.vaults.values()) if (normalizeName(v.name) === name) return v;
  return core.s.takenNames.has(name) ? "other" : null;
}
const isFree = (core: Core, name: string): boolean => holderOf(core, name) === null;

/** First free name: the preferred one, else name2, name3 ... (a short name starts at a suffix that brings it to 3 characters). src/auth/name-registry.ts:260-278, reserved-names.ts:180-184. */
export function nextAvailableName(core: Core, base: string): string {
  const preferred = normalizeName(base);
  const free = (n: string): boolean => isFree(core, n) && !isRefusedName(n);
  if (free(preferred)) return preferred;
  const deficit = MIN_VAULT_NAME_LENGTH - preferred.length;
  const start = deficit <= 0 ? 2 : 10 ** (deficit - 1) === 1 ? 2 : 10 ** (deficit - 1);
  for (let n = start; ; n++) if (free(`${preferred}${n}`)) return `${preferred}${n}`;
}

const register = (core: Core): string => `https://${core.o.host}/base`;

// ── people ────────────────────────────────────────────────────────────────────────────────────

const normalizeEmail = (e: string): string => e.trim().toLowerCase();
export function ensurePerson(core: Core, email: string): Person {
  const key = normalizeEmail(email);
  let p = core.s.people.get(key);
  if (!p) {
    p = { email: key, principal: `https://${core.o.host}/base/p/${core.nextId()}`, landingVaultId: null };
    core.s.people.set(key, p);
  }
  return p;
}
const hasVault = (core: Core, p: Person): boolean => p.landingVaultId !== null && [...core.s.vaults.values()].some((v) => v.id === p.landingVaultId && !v.pending);

/** The person's first vault becomes the sign-in seat (the register commit declares it, src/auth/baseid-register.ts:540-555) and its own address becomes the acting principal (src/routes/email-auth.ts:510-517). */
function adoptFirstVault(core: Core, p: Person, v: Vault): void {
  if (p.landingVaultId !== null) return;
  p.landingVaultId = v.id;
  p.principal = v.id;
  v.owner = v.id;
}

function mintFor(core: Core, p: Person, v: { name: string; represents: string | null; partOf?: string | null; pending?: boolean }): Vault {
  const made = makeVault(core, { name: v.name, owner: p.principal, represents: v.represents, partOf: v.partOf ?? null, pending: v.pending });
  if (!made.pending) adoptFirstVault(core, p, made);
  return made;
}

// ── routes ────────────────────────────────────────────────────────────────────────────────────

/**
 * POST /base/auth/email/request-code — "a code was sent" and nothing else, whoever the email is.
 * Mirrors: src/routes/email-auth.ts:289-355 (answer `{ requested: true }` :353; a pending name is kept :350-351), schema :68-82; code TTL src/auth/email-otc.ts:64.
 * The fake keeps the code in `state.codes` (read it with `pendingCode`); the real one emails it. Not faked: the send guard and its caps, return_to branding, the WrongSignInHost refusal.
 */
export function requestCode(core: Core, req: Req): Response {
  const b = parseBody(req);
  if (!b.ok) return badRequest("Body is not valid JSON");
  const v = b.value;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return schemaRefusal("body must be object");
  const o = v as Record<string, unknown>;
  if (!("email" in o)) return schemaRefusal("body must have required property 'email'");
  if (Object.keys(o).some((k) => !["email", "return_to", "name"].includes(k))) return schemaRefusal("body must NOT have additional properties");
  if (typeof o.email !== "string" || o.email.length < 3) return schemaRefusal("body/email must NOT have fewer than 3 characters");
  for (const k of ["return_to", "name"]) if (k in o && typeof o[k] !== "string") return schemaRefusal(`body/${k} must be string`);
  const email = normalizeEmail(o.email);
  const code = typeof core.o.codeOption === "function" ? core.o.codeOption(email) : core.o.codeOption;
  const prev = core.s.codes.get(email)?.name;
  const name = typeof o.name === "string" && o.name.trim() !== "" ? o.name.trim() : prev;
  core.s.codes.set(email, { code, expiresAt: core.o.now() + CODE_TTL_MS, ...(name !== undefined ? { name } : {}) });
  return json(200, { requested: true });
}

/**
 * POST /base/auth/email/verify-code — spend the code, mint a DPoP-bound token (its cnf.jkt is the thumbprint of the sent `dpopJwk`).
 * Mirrors: src/routes/email-auth.ts:358-565 (schema :84-108; 401 :437; returning :478-483; named mint :487-534; collision / reserved never block :535-548; no name :551-564);
 * code single use and wrong/expired 401 src/auth/email-otc.ts:263-303; first vault `adoptFirstVault`.
 * Four 200 answers: returning `{ token, principal, needsVaultName:false }`; new, no name `{ token, principal, needsVaultName:true, suggestedName, webIdDomain }`;
 * new with a name that was minted `{ token, principal (the vault's address), needsVaultName:false, vaultName, vault, vaultId, aliasUri }`;
 * new with a name taken or reserved `{ token, principal, needsVaultName:true, suggestedName, nameOutcome }`.
 * Not faked: the failed-guess lockout (src/auth/email-otc.ts:67-71), review credentials, the session cookie.
 */
export function verifyCode(core: Core, req: Req): Response {
  const b = parseBody(req);
  if (!b.ok) return badRequest("Body is not valid JSON");
  const v = b.value;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return schemaRefusal("body must be object");
  const o = v as Record<string, unknown>;
  for (const k of ["email", "code", "dpopJwk"]) if (!(k in o)) return schemaRefusal(`body must have required property '${k}'`);
  if (Object.keys(o).some((k) => !["email", "code", "dpopJwk", "client", "name"].includes(k))) return schemaRefusal("body must NOT have additional properties");
  if (typeof o.email !== "string" || o.email.length < 3) return schemaRefusal("body/email must NOT have fewer than 3 characters");
  if (typeof o.code !== "string" || o.code.length < 1) return schemaRefusal("body/code must NOT have fewer than 1 characters");
  if (o.code.length > 32) return schemaRefusal("body/code must NOT have more than 32 characters");
  if (o.dpopJwk === null || typeof o.dpopJwk !== "object" || Array.isArray(o.dpopJwk)) return schemaRefusal("body/dpopJwk must be object");
  if ("client" in o && (typeof o.client !== "string" || o.client.length < 1 || o.client.length > 256)) return schemaRefusal("body/client must NOT have fewer than 1 characters");
  if ("name" in o && typeof o.name !== "string") return schemaRefusal("body/name must be string");
  const email = normalizeEmail(o.email);
  const jwk = o.dpopJwk as Record<string, unknown>;
  const bad = (): Response => failure(401, "Unauthorized", "Invalid or expired email one-time code");
  const entry = core.s.codes.get(email);
  if (!entry || entry.expiresAt < core.o.now()) {
    if (entry) core.s.codes.delete(email);
    return bad();
  }
  if (entry.code !== o.code) return bad();
  core.s.codes.delete(email);
  if (typeof jwk.kty !== "string" || typeof jwk.crv !== "string" || typeof jwk.x !== "string" || typeof jwk.y !== "string") return badRequest("dpopJwk is not a public EC key (fake-platform: kty, crv, x and y are needed)");

  const person = ensurePerson(core, email);
  const token = mintToken(core, { principal: person.principal, email }, thumbprint(jwk)).token;
  if (hasVault(core, person)) return json(200, { token, principal: person.principal, needsVaultName: false });

  const given = typeof o.name === "string" && o.name.trim() !== "" ? o.name : entry.name;
  if (given !== undefined) {
    const desired = normalizeName(given);
    if (isRefusedName(desired)) {
      return json(200, {
        token,
        principal: person.principal,
        needsVaultName: true,
        suggestedName: nextAvailableName(core, slugifyLocal(email)),
        nameOutcome: { status: "reserved", desired, message: `'${desired}' is a reserved name — please choose another.` },
      });
    }
    if (!isFree(core, desired)) {
      const suggestion = nextAvailableName(core, desired);
      return json(200, {
        token,
        principal: person.principal,
        needsVaultName: true,
        suggestedName: suggestion,
        nameOutcome: { status: "collision", desired, suggestion, message: `'${desired}' was just taken — we picked '${suggestion}'. Accept it or edit, then create.` },
      });
    }
    const vault = mintFor(core, person, { name: desired, represents: PERSON_TYPE });
    const vaultId = addressFor(core, desired);
    return json(200, { token, principal: person.principal, needsVaultName: false, vaultName: desired, vault: vault.entity, vaultId, aliasUri: vaultId });
  }
  return json(200, { token, principal: person.principal, needsVaultName: true, suggestedName: nextAvailableName(core, slugifyLocal(email)), webIdDomain: core.o.domain });
}

/**
 * POST /onboard/api/name-prep — is this email known, and what name to suggest.
 * Mirrors: src/routes/onboarding.ts:895-926 (400 :897-900; returning :910-913; new :914-925).
 */
export function namePrep(core: Core, req: Req): Response {
  const b = parseBody(req);
  const email = b.ok && b.value !== null && typeof b.value === "object" ? normalizeEmail(String((b.value as { email?: unknown }).email ?? "")) : "";
  if (!email || !email.includes("@")) return json(400, { error: "email_required", message: "A valid email is required." });
  const p = core.s.people.get(email);
  if (p && hasVault(core, p)) return json(200, { isReturning: true, webIdDomain: core.o.domain });
  const suggestedName = nextAvailableName(core, slugifyLocal(email));
  return json(200, { isReturning: false, suggestedName, webIdDomain: core.o.domain, address: addressFor(core, suggestedName) });
}

/**
 * POST /onboard/api/check-name — is the name free, and what it will be saved as. Never an error status for a taken or reserved name.
 * Mirrors: src/routes/onboarding.ts:929-972; normalisation src/auth/reserved-names.ts:18-39; reserved and the 3-character minimum :159,169; suffix src/auth/name-registry.ts:260-278;
 * address :190-225.
 */
export function checkName(core: Core, req: Req): Response {
  const b = parseBody(req);
  const raw = b.ok && b.value !== null && typeof b.value === "object" && typeof (b.value as { name?: unknown }).name === "string" ? (b.value as { name: string }).name : "";
  const name = normalizeName(raw);
  const changed = nameChangeReport(raw);
  const webIdDomain = core.o.domain;
  if (isRefusedName(name)) return json(200, { available: false, reserved: true, ...changed, name, webIdDomain, message: `'${name}' is a reserved name — please choose another.` });
  if (isFree(core, name)) return json(200, { available: true, reserved: false, ...changed, name, webIdDomain, address: addressFor(core, name) });
  const suggestion = nextAvailableName(core, name);
  return json(200, { available: false, reserved: false, ...changed, name, suggestion, webIdDomain, address: addressFor(core, suggestion), message: `'${name}' is taken — we suggest '${suggestion}'. Accept it or edit.` });
}

const REPRESENTS_MISSING =
  "represents is required: a vault must declare what kind of thing it is from the live shared type ontology, or the mint FAILS rather than defaulting. ⛔ Absence is not Person and is not undeclared-on-purpose at a creation path.";
const BODY_HINT = " The body is { name, represents, parentVault? }; represents is the full GilbVeda type IRI of what the vault holds (a person's own vault: https://veda.gilb.com/base/t/Person).";

/**
 * POST /base/vault/create-named — make a named vault for the signed-in person.
 * Mirrors: src/routes/vault.ts:376-417 (schema :104-115); src/auth/create-named-vault.ts: represents refusal :163-193, parent :281-296, 201 / 202 answers :466-520,
 * the vaultId of the answer :478 via src/auth/baseid-register.ts:469 and src/auth/name-registry.ts:224; src/auth/cross-store-mint.ts: claim refusals :461-475 (409 both),
 * partial :677-688; src/auth/vault-represents-decider.ts (the sentences). Parent entity: src/read/vault-represents-crossing.ts:443-455.
 * Order: schema 400, credential 401, represents 400, parent 400/403, name 409, mint.
 * `parentVault` is a vault ENTITY URI (the `@id` of a node in GET /lws/vaults), never a vault id.
 * Not faked: the first-day mint limit, the machine and AI credential refusals, nesting depth.
 */
export function createNamed(core: Core, req: Req, caller: Caller | null): Response {
  const b = parseBody(req);
  if (!b.ok) return badRequest("Body is not valid JSON");
  const v = b.value;
  if (v === null || typeof v !== "object" || Array.isArray(v)) return schemaRefusal("body must be object");
  const o = v as Record<string, unknown>;
  if (!("name" in o)) return schemaRefusal("body must have required property 'name'");
  if (Object.keys(o).some((k) => !["name", "parentVault", "represents"].includes(k))) return schemaRefusal("body must NOT have additional properties");
  if (typeof o.name !== "string" || o.name.length < 1) return schemaRefusal("body/name must NOT have fewer than 1 characters");
  if (o.name.length > 63) return schemaRefusal("body/name must NOT have more than 63 characters");
  for (const k of ["parentVault", "represents"]) if (k in o && (typeof o[k] !== "string" || (o[k] as string).length < 1)) return schemaRefusal(`body/${k} must NOT have fewer than 1 characters`);
  const person = core.s.people.get(caller!.email)!;
  const name = normalizeName(o.name);

  const requested = typeof o.represents === "string" ? o.represents.trim() : "";
  let refusal: string | null = null;
  if (requested === "") refusal = REPRESENTS_MISSING;
  else if (requested === SIGN_IN_ATTR || requested === SIGN_IN_TYPE) refusal = `represents ${JSON.stringify(requested)} is the sign-in seat designation, not a Type a person may assign. a:signInPod is stamped only at account registration.`;
  else if (!(core.o.knownTypes ? core.o.knownTypes.has(requested) : /^https:\/\/[^/\s]+\/base\/t\/[A-Za-z0-9_-]+$/.test(requested))) refusal = `represents ${JSON.stringify(requested)} does not currently resolve in the live shared type ontology, so it is not a declaration. ⛔ Nothing was minted.`;
  if (refusal !== null) {
    let also = "";
    if (isRefusedName(name)) also = ` Also: '${name}' is a reserved name.`;
    else if (!isFree(core, name)) also = ` Also: '${name}' is taken; we suggest '${nextAvailableName(core, name)}'.`;
    return badRequest(refusal + also + BODY_HINT);
  }

  let parent: Vault | null = null;
  if (typeof o.parentVault === "string") {
    parent = [...core.s.vaults.values()].find((x) => x.entity === o.parentVault && !x.pending) ?? null;
    if (!parent) return badRequest(`parentVault is not a known vault entity: ${o.parentVault}`);
    if (parent.owner !== person.principal) return forbidden(`You do not own parent vault ${o.parentVault} — nest only under vaults you have minted`);
  } else if (person.landingVaultId !== null) {
    parent = core.s.vaults.get(person.landingVaultId) ?? null;
  }

  let finalName = name;
  let completing: Vault | null = null;
  if (isRefusedName(name)) return failure(409, "VaultNameReserved", `REFUSED: '${name}' is a reserved label and the register '${register(core)}' will not issue it. Choose another name.`);
  const held = holderOf(core, name);
  if (held !== null) {
    if (held !== "other" && held.pending && held.owner === person.principal) completing = held;
    else if (core.o.nameCollision === "suffix") finalName = nextAvailableName(core, name);
    else {
      const suggestion = nextAvailableName(core, name);
      return failure(409, "VaultNameTaken", `REFUSED: the name '${name}' on '${core.o.host}' is already held. The register '${register(core)}' decided this — ⛔ not a per-database unique index, which cannot see across stores. Next free name: '${suggestion}'.`);
    }
  }

  const partial = completing === null && core.o.partialCreate.times > 0;
  if (partial) core.o.partialCreate.times -= 1;
  const represents = requested;
  let vault: Vault;
  if (completing) {
    vault = completing;
    vault.pending = false;
    adoptFirstVault(core, person, vault);
    vault.partOf = parent?.id ?? null;
    vault.represents = represents;
  } else {
    vault = mintFor(core, person, { name: finalName, represents, partOf: parent?.id ?? null, pending: partial });
  }
  const vaultId = addressFor(core, vault.name);
  if (partial) {
    return json(202, {
      vault: vault.entity,
      vaultId,
      name: vault.name,
      parent: null,
      represents: null,
      created: true,
      status: "partial",
      message:
        "The vault's facts are committed and correctly stamped, but the register commit did not complete (Error: fake-platform partial mint on purpose). The name is still claimed by you and cannot be taken; re-issue the identical request to finish it.",
    });
  }
  return json(201, { vault: vault.entity, vaultId, name: vault.name, parent: parent?.entity ?? null, represents, created: true, status: "live" });
}
