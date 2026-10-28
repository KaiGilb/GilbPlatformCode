// A program's own identity on GilbPlatform: register its key as a machine client, take the first token, check, get.
//
// Run (Node >= 22.7; the units' TypeScript needs --experimental-transform-types and the resolve hook):
//   node --experimental-transform-types --no-warnings --import ./scripts/lib/ts-resolve.mjs \
//     scripts/agent-identity/identity.mjs <init|check|get> --key-file <path> [flags]
//
// Exit codes: 0 ok / clean dry run · 1 called wrong · 2 refused, nothing sent · 4 the platform answered an error.
// All network goes through one injectable transport (deps.transport). Never prints the private key, a token or an assertion.
import nodeFs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { importMachineKey, MachineCredential, MachineTokenError } from "../../units/signin/src/machine.ts";
import { fetchTransport } from "../../units/signin/src/transport.ts";

const DEFAULT_ID_ORIGIN = "https://id.gilb.com";
const TIMEOUT_MS = 15000;

class Refused extends Error {}   // exit 2
class Wrong extends Error {}     // exit 1
class PlatformError extends Error {} // exit 4

function defaultGit(dir) {
  try {
    return execFileSync("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim() === "true";
  } catch { return false; }
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const flags = {};
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (!a.startsWith("--")) throw new Wrong(`unexpected argument: ${a}`);
    const k = a.slice(2);
    if (k === "write") { flags.write = true; continue; }
    const v = rest[++i];
    if (v === undefined || v.startsWith("--")) throw new Wrong(`--${k} needs a value`);
    flags[k] = v;
  }
  return { command, flags };
}

function checkIdOrigin(value, say) {
  let u;
  try { u = new URL(value); } catch { throw new Refused(`--id-origin is not a URL: ${value}`); }
  if (u.protocol !== "https:" || !u.hostname || u.pathname !== "/" || u.search || u.hash || u.username || u.password) {
    throw new Refused(`--id-origin must be https:// plus a host and nothing else (got ${value}). Nothing was sent.`);
  }
  if (u.hostname === "gilb.com") say("warning: https://gilb.com is the apex, not the token host (the token host is https://id.gilb.com).");
  return u.origin;
}

const sidecarPath = (keyFile) => `${keyFile}.client.json`;
const modeOf = (fs, p) => fs.statSync(p).mode & 0o777;
const oct = (m) => "0" + m.toString(8);

async function loadKey(fs, keyFile) {
  if (modeOf(fs, keyFile) !== 0o600) throw new Refused(`key file ${keyFile} has mode ${oct(modeOf(fs, keyFile))}, not 0600. Nothing was sent.`);
  const key = await importMachineKey(fs.readFileSync(keyFile, "utf8"));
  if (!key) throw new Refused(`key file ${keyFile} is not a P-256 private JWK (kty, crv, x, y, d). Nothing was sent.`);
  return key;
}

function loadSidecar(fs, keyFile) {
  const p = sidecarPath(keyFile);
  if (!fs.existsSync(p)) throw new Refused(`no ${p}: run init --write first. Nothing was sent.`);
  let j;
  try { j = JSON.parse(fs.readFileSync(p, "utf8")); } catch { throw new Refused(`${p} is not JSON. Nothing was sent.`); }
  if (typeof j?.clientId !== "string" || !j.clientId) throw new Refused(`${p} has no clientId. Nothing was sent.`);
  return j;
}

/** Wraps a transport so a token answer's expires_in and scope can be read without exposing the token. */
function watchTokens(transport) {
  const seen = { expires_in: undefined, scope: undefined };
  const wrapped = async (url, req) => {
    const res = await transport(url, req);
    if (!url.endsWith("/base/oauth/token")) return res;
    let cached;
    return {
      status: res.status,
      headers: res.headers,
      async json() {
        cached ??= await res.json();
        if (cached && typeof cached === "object") {
          seen.expires_in = cached.expires_in;
          seen.scope = cached.scope;
        }
        return cached;
      },
    };
  };
  return { wrapped, seen };
}

async function mintOne({ key, clientId, idOrigin, scope, transport, now }) {
  const { wrapped, seen } = watchTokens(transport);
  const cred = new MachineCredential({ idOrigin, clientId, key, scope, transport: wrapped, now });
  // authHeaders mints the token; the URL below is only the DPoP htu of a proof that is discarded, never sent.
  await cred.authHeaders("GET", `${idOrigin}/base/oauth/token`);
  return { cred, expiresIn: seen.expires_in };
}

async function generateKeyJwk() {
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const j = await crypto.subtle.exportKey("jwk", pair.privateKey);
  return { kty: j.kty, crv: j.crv, x: j.x, y: j.y, d: j.d };
}

async function cmdInit(flags, deps, say) {
  const { fs, git, transport, now } = deps;
  const name = flags.name, declaredOrigin = flags["declared-origin"], keyFile = path.resolve(flags["key-file"]);
  if (!name) throw new Wrong("init needs --name");
  if (!declaredOrigin) throw new Wrong("init needs --declared-origin");
  const idOrigin = checkIdOrigin(flags["id-origin"] ?? DEFAULT_ID_ORIGIN, say);
  const exists = fs.existsSync(keyFile);
  const registerUrl = `${idOrigin}/base/client/register`;

  if (!flags.write) {
    let pub = { kty: "EC", crv: "P-256", x: "<x>", y: "<y>" };
    if (exists) {
      const key = await importMachineKey(fs.readFileSync(keyFile, "utf8"));
      if (key) pub = key.publicJwk;
    }
    say(`DRY RUN: nothing is sent, nothing is written.`);
    say(`id origin: ${idOrigin}`);
    say(`key file: ${keyFile} (${exists ? "exists, would be reused" : "does not exist, would be created"})`);
    say(`would POST ${registerUrl}`);
    say(JSON.stringify({ clientPublicKey: pub, declaredOrigin, clientDisplayName: name }, null, 2));
    say(`then: 1. write ${sidecarPath(keyFile)} (clientId, idOrigin, name, declaredOrigin, registeredAt, created)`);
    say(`      2. mint one token at scope base.read`);
    say(`      3. send one signed GET ${idOrigin}/base/connect/skill-claims (the platform makes the client's principal at its first verified request)`);
    say(`add --write to do it.`);
    return 0;
  }

  // 1. the key
  let key;
  if (!exists) {
    const dir = path.dirname(keyFile);
    if (!fs.existsSync(dir)) throw new Refused(`parent directory ${dir} does not exist; make it with mode 0700. Nothing was sent.`);
    if (modeOf(fs, dir) !== 0o700) throw new Refused(`parent directory ${dir} has mode ${oct(modeOf(fs, dir))}, not 0700. Nothing was sent.`);
    if (git(dir)) throw new Refused(`parent directory ${dir} is inside a git work tree; keep the key outside every repository. Nothing was sent.`);
    const jwk = await generateKeyJwk();
    fs.writeFileSync(keyFile, JSON.stringify(jwk), { flag: "wx", mode: 0o600 });
    key = await importMachineKey(JSON.stringify(jwk));
    say(`key file created: ${keyFile} (mode 0600)`);
  } else {
    key = await loadKey(fs, keyFile);
    say(`key file exists, reused: ${keyFile}`);
  }

  // 2. register
  const body = JSON.stringify({ clientPublicKey: { kty: key.publicJwk.kty, crv: key.publicJwk.crv, x: key.publicJwk.x, y: key.publicJwk.y }, declaredOrigin, clientDisplayName: name });
  let res, answer;
  try {
    res = await transport(registerUrl, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body, timeoutMs: TIMEOUT_MS });
    answer = res.status >= 200 && res.status <= 299 ? await res.json() : null;
  } catch {
    throw new PlatformError(`the register call got no usable answer. The key file ${keyFile} exists; the register did not succeed. Re-running init --write is safe.`);
  }
  if (!answer || typeof answer.clientId !== "string" || !answer.clientId) {
    throw new PlatformError(`the register answered HTTP ${res.status} with no clientId. The key file ${keyFile} exists; the register did not succeed. Re-running init --write is safe.`);
  }
  const clientId = answer.clientId;

  // 3. sidecar
  const side = sidecarPath(keyFile);
  fs.writeFileSync(side, JSON.stringify({ clientId, idOrigin, name, declaredOrigin, registeredAt: new Date(now()).toISOString(), created: answer.created === true }, null, 2) + "\n", { mode: 0o600 });
  fs.chmodSync(side, 0o600);

  // 4. first token
  let expiresIn, cred;
  try {
    ({ cred, expiresIn } = await mintOne({ key, clientId, idOrigin, scope: "base.read", transport, now }));
  } catch (e) {
    const st = e instanceof MachineTokenError ? ` (HTTP ${e.status})` : "";
    throw new PlatformError(`the client is registered (clientId ${clientId}, sidecar ${side}) but the first token failed${st}. Re-running init --write is safe.`);
  }

  // 5. the first verified request: the platform makes the client's principal here, not at the token call (bind needs it)
  const verifyUrl = `${idOrigin}/base/connect/skill-claims`;
  let vres;
  try {
    vres = await transport(verifyUrl, { method: "GET", headers: { ...(await cred.authHeaders("GET", verifyUrl)), Accept: "application/json" }, timeoutMs: TIMEOUT_MS });
  } catch {
    throw new PlatformError(`registered, first token ok, but the verified request that makes the principal got no answer; re-running init --write is safe.`);
  }
  if (vres.status < 200 || vres.status > 299) {
    throw new PlatformError(`registered, first token ok, but the verified request that makes the principal failed (HTTP ${vres.status}); re-running init --write is safe.`);
  }

  // 6. report
  say(`registered: created ${answer.created === true}`);
  say(`first token: ok (scope base.read, expires_in ${expiresIn})`);
  say(`principal: made (verified GET → ${vres.status})`);
  say(`clientId: ${clientId}`);
  return 0;
}

async function cmdCheck(flags, deps, say) {
  const { fs, transport, now } = deps;
  const keyFile = path.resolve(flags["key-file"]);
  const scope = flags.scope ?? "base.write";
  if (scope !== "base.read" && scope !== "base.write") throw new Wrong("--scope must be base.read or base.write");
  const side = loadSidecar(fs, keyFile);
  const key = await loadKey(fs, keyFile);
  const idOrigin = checkIdOrigin(flags["id-origin"] ?? side.idOrigin ?? DEFAULT_ID_ORIGIN, say);
  try {
    const { expiresIn } = await mintOne({ key, clientId: side.clientId, idOrigin, scope, transport, now });
    say(`token: ok (scope ${scope}, expires_in ${expiresIn})`);
    return 0;
  } catch (e) {
    if (e instanceof MachineTokenError) throw new PlatformError(`token refused: HTTP ${e.status} (scope ${scope}). Nothing was changed.`);
    throw e;
  }
}

async function cmdGet(flags, deps, say) {
  const { fs, transport, now } = deps;
  const keyFile = path.resolve(flags["key-file"]);
  const url = flags.url;
  if (!url) throw new Wrong("get needs --url");
  let u;
  try { u = new URL(url); } catch { throw new Refused(`--url is not a URL: ${url}`); }
  if (u.protocol !== "https:") throw new Refused(`--url must be https (got ${url}). Nothing was sent.`);
  const side = loadSidecar(fs, keyFile);
  const key = await loadKey(fs, keyFile);
  const idOrigin = checkIdOrigin(flags["id-origin"] ?? side.idOrigin ?? DEFAULT_ID_ORIGIN, say);
  let res;
  try {
    const cred = new MachineCredential({ idOrigin, clientId: side.clientId, key, scope: "base.read", transport, now });
    const headers = { ...(await cred.authHeaders("GET", url)), Accept: "application/ld+json" };
    res = await transport(url, { method: "GET", headers, timeoutMs: TIMEOUT_MS });
  } catch (e) {
    if (e instanceof MachineTokenError) throw new PlatformError(`token refused: HTTP ${e.status}. The GET was not sent.`);
    throw new PlatformError(`the GET got no answer (${e?.message ?? "error"}).`);
  }
  const ct = res.headers?.get?.("content-type") ?? "-";
  say(`GET ${url} → ${res.status} ${ct}`);
  return 0;
}

/**
 * @param {string[]} argv command then flags
 * @param {{transport?: Function, now?: () => number, fs?: object, git?: (dir: string) => boolean, out?: (s: string) => void, err?: (s: string) => void}} deps
 * @returns {Promise<number>} the exit code
 */
export async function run(argv, deps = {}) {
  const d = {
    transport: deps.transport ?? fetchTransport,
    now: deps.now ?? Date.now,
    fs: deps.fs ?? nodeFs,
    git: deps.git ?? defaultGit,
  };
  const out = deps.out ?? ((s) => console.log(s));
  const err = deps.err ?? ((s) => console.error(s));
  try {
    const { command, flags } = parseArgs(argv);
    if (!["init", "check", "get"].includes(command)) throw new Wrong(`command must be init, check or get (got ${command ?? "nothing"})`);
    if (!flags["key-file"]) throw new Wrong("--key-file is required");
    if (command === "init") return await cmdInit(flags, d, out);
    if (command === "check") return await cmdCheck(flags, d, out);
    return await cmdGet(flags, d, out);
  } catch (e) {
    if (e instanceof Wrong) { err(`called wrong: ${e.message}`); return 1; }
    if (e instanceof Refused) { err(`refused: ${e.message}`); return 2; }
    if (e instanceof PlatformError) { err(`platform error: ${e.message}`); return 4; }
    err(`error: ${e?.message ?? e}`);
    return 1;
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  process.exitCode = await run(process.argv.slice(2));
}
