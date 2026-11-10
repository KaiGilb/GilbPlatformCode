import { authenticate, mintToken, thumbprint } from "./auth";
import { opaqueId } from "./bytes";
import { failure, json, type Core, type Req, type Resolved } from "./http";
import { storeFile } from "./files";
import { endRecord, entityOf, makeRecord, normaliseFacts, stamp } from "./records";
import { matchRoute } from "./routes";
import type { Call, Calls, FakePlatform, FakePlatformOptions, FakeState, GrantMode, Match, Person, PersonRef, Vault, VaultRef } from "./types";

const VEDA_PERSON = "https://veda.gilb.com/base/t/Person";

function matcher(m: Match): (method: string, path: string) => boolean {
  if (m instanceof RegExp) return (method, path) => new RegExp(m.source, m.flags.replace(/[gy]/g, "")).test(`${method} ${path}`);
  const sp = m.indexOf(" ");
  const want = m.slice(0, sp);
  const re = new RegExp("^" + m.slice(sp + 1).split("/").map((s) => (s.startsWith(":") ? "[^/]+" : s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))).join("/") + "$");
  return (method, path) => method === want && re.test(path);
}

interface Rule {
  test: (method: string, path: string) => boolean;
  kind: "fail" | "drop";
  status: number;
  body?: unknown;
  message?: string;
  times: number;
  skip: number;
}

async function bodyBytesOf(body: unknown): Promise<Uint8Array | null> {
  if (body === undefined || body === null) return null;
  if (typeof body === "string") return new TextEncoder().encode(body);
  if (body instanceof URLSearchParams) return new TextEncoder().encode(body.toString());
  if (body instanceof ArrayBuffer) return new Uint8Array(body);
  if (ArrayBuffer.isView(body)) return new Uint8Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength));
  if (typeof Blob !== "undefined" && body instanceof Blob) return new Uint8Array(typeof body.arrayBuffer === "function" ? await body.arrayBuffer() : await new Response(body).arrayBuffer());
  return new TextEncoder().encode(String(body));
}

export function createFakePlatform(options: FakePlatformOptions = {}): FakePlatform {
  const origin = new URL(options.origin ?? "https://fake.test").origin;
  const host = new URL(origin).host;
  const o: Resolved = {
    origin,
    host,
    domain: options.domain ?? host,
    hosts: new Set(options.hosts ?? []),
    transcodedFromInListing: options.listingCarriesTranscodedFrom ?? true,
    dpop: options.dpop ?? "strict",
    undefinedTerms: new Set((options.undefinedTerms ?? []).map((k) => k.replace(/^a:/, ""))),
    proofWindowSeconds: options.proofWindowSeconds ?? 60,
    now: options.now ?? Date.now,
  };
  const s: FakeState = { people: new Map(), vaults: new Map(), grants: new Map(), revoked: new Set(), records: new Map(), files: new Map(), sessions: new Map(), usedProofs: new Set(), seq: 0 };
  let counter = 0;
  const core: Core = { o, s, nextId: () => opaqueId(++counter) };

  const calls: Call[] = [];
  const violations: string[] = [];
  let rules: Rule[] = [];
  let holds: { test: (m: string, p: string) => boolean; gate: Promise<void>; release: () => void }[] = [];
  let callNo = 0;

  const callsApi: Calls = {
    all: calls,
    of: (m) => {
      const t = matcher(m);
      return calls.filter((c) => t(c.method, c.path));
    },
    last: (m) => (m === undefined ? calls[calls.length - 1] : callsApi.of(m).at(-1)),
    count: (m) => (m === undefined ? calls.length : callsApi.of(m).length),
    clear: () => {
      calls.length = 0;
    },
  };

  const allowedHost = (h: string): boolean => h === o.host || o.hosts.has(h) || h.endsWith(`.${o.domain}`);

  const personOf = (p: PersonRef): Person => {
    if (typeof p !== "string") return p;
    for (const x of s.people.values()) if (x.principal === p || x.email === p) return x;
    throw new Error(`fake-platform: no seeded person for ${JSON.stringify(p)}`);
  };
  const vaultOf = (v: VaultRef): Vault => {
    if (typeof v !== "string") return v;
    const hit = s.vaults.get(v) ?? [...s.vaults.values()].find((x) => x.name === v || x.host === v);
    if (!hit) throw new Error(`fake-platform: no seeded vault for ${JSON.stringify(v)}`);
    return hit;
  };

  const api: FakePlatform = {
    origin,
    offline: false,
    state: s,
    calls: callsApi,
    violations,

    fetch: async (input, init = {}) => {
      const isReq = typeof Request !== "undefined" && input instanceof Request;
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : (input as Request).url);
      const method = (init.method ?? (isReq ? (input as Request).method : "GET")).toUpperCase();
      if (api.offline) throw new TypeError("Failed to fetch (fake platform: offline)");
      const headers = new Headers(init.headers ?? (isReq ? (input as Request).headers : undefined));
      const bodyBytes = await bodyBytesOf(init.body ?? (isReq ? new Uint8Array(await (input as Request).clone().arrayBuffer()) : undefined));
      const bodyText = bodyBytes === null ? null : new TextDecoder().decode(bodyBytes);
      const jsonish = (headers.get("content-type") ?? "json").toLowerCase().includes("json");
      const call: Call = {
        n: ++callNo,
        method,
        url: url.href,
        host: url.host,
        path: url.pathname,
        query: {},
        headers: Object.fromEntries(headers.entries()),
        body: undefined,
        proof: { ok: false, reason: "not checked" },
        status: "network-error",
        at: o.now(),
      };
      for (const [k, v] of url.searchParams) (call.query[k] ??= []).push(v);
      try {
        call.body = bodyText === null ? undefined : jsonish ? JSON.parse(bodyText) : bodyBytes;
      } catch {
        call.body = bodyBytes ?? undefined;
      }
      calls.push(call);

      if (!allowedHost(url.host)) {
        violations.push(`${method} ${url.href}`);
        throw new TypeError(`Failed to fetch (fake platform: ${url.host} is not this platform)`);
      }
      if (options.latencyMs) await new Promise<void>((r) => setTimeout(r, options.latencyMs!()));

      for (const rule of rules) {
        if (!rule.test(method, url.pathname)) continue;
        if (rule.skip > 0) {
          rule.skip -= 1;
          continue;
        }
        if (rule.times <= 0) continue;
        rule.times -= 1;
        call.injected = true;
        if (rule.kind === "drop") throw new TypeError("Failed to fetch (fake platform: dropped on purpose)");
        call.status = rule.status;
        return json(rule.status, rule.body ?? { error: "Injected", message: rule.message ?? `The fake answered ${rule.status} on purpose.` });
      }
      rules = rules.filter((r) => r.times > 0 || r.skip > 0);
      for (const h of holds) if (h.test(method, url.pathname)) await h.gate;

      const found = matchRoute(method, url.pathname);
      if (!found) {
        violations.push(`${method} ${url.pathname}`);
        call.status = 404;
        return failure(404, "fake_platform_no_such_route", `fake-platform answers no route ${method} ${url.pathname}; the platform route table has no such row.`);
      }
      const req: Req = { method, url, path: url.pathname, host: url.host, query: url.searchParams, headers, bodyText, bodyBytes, params: found.params };
      const auth = await authenticate(core, req, found.route.auth);
      call.proof = auth.proof;
      if (auth.caller) call.as = { principal: auth.caller.principal, email: auth.caller.email };
      const res = auth.response ?? (await found.route.handler(core, req, auth.caller));
      call.status = res.status;
      return res;
    },

    client: (to) => ({ origin: to ?? origin, fetch: (u, i) => api.fetch(u, i) }),

    seedPerson({ email, vaultName, represents }) {
      const key = email.trim().toLowerCase();
      if (s.people.has(key)) throw new Error(`fake-platform: ${key} is already seeded`);
      const person: Person = { email: key, principal: `https://${o.host}/base/p/${opaqueId(++counter)}`, landingVaultId: null };
      s.people.set(key, person);
      if (vaultName) api.seedVault({ name: vaultName, owner: person, represents: represents ?? VEDA_PERSON });
      return person;
    },
    seedVault({ name, owner, partOf, represents, host: h }) {
      const who = personOf(owner);
      const vhost = h ?? `${name}.${o.domain}`;
      const id = `https://${vhost}/vault`;
      if (s.vaults.has(id)) throw new Error(`fake-platform: vault ${id} is already seeded`);
      const v: Vault = { id, name, host: vhost, owner: who.principal, represents: represents ?? null, partOf: partOf ? vaultOf(partOf).id : null };
      s.vaults.set(id, v);
      if (who.landingVaultId === null) who.landingVaultId = id;
      return v;
    },
    seedRecord(v, r) {
      return makeRecord(core, vaultOf(v).id, r.type, r.facts, r.id);
    },
    seedFile(v, f) {
      const vault = vaultOf(v);
      const link = f.transcodedFrom === undefined ? undefined : typeof f.transcodedFrom === "string" ? f.transcodedFrom : entityOf(core, f.transcodedFrom);
      const { file } = storeFile(core, vault, {
        name: f.name,
        bytes: f.bytes,
        mediaType: (f.mediaType ?? "application/octet-stream").toLowerCase(),
        type: f.type,
        folders: [...(f.folders ?? [])].sort(),
        tags: [...(f.tags ?? [])].sort(),
        storedWith: f.storedWith,
        by: f.uploader ? personOf(f.uploader).principal : vault.owner,
        transcodedFrom: link,
      });
      return file;
    },
    seedPicture(v, p) {
      const master = api.seedFile(v, { name: `${p.name}.jpg`, bytes: p.master, mediaType: "image/jpeg", type: "ImageFile" });
      const thumb = api.seedFile(v, { name: `${p.name}-320.jpg`, bytes: p.thumb, mediaType: "image/jpeg", type: "ImageFile", transcodedFrom: master });
      return { master, thumb };
    },
    grant(v, who, mode: GrantMode) {
      const vault = vaultOf(v);
      const byWho = s.grants.get(vault.id) ?? new Map<string, Set<GrantMode>>();
      s.grants.set(vault.id, byWho);
      const held = byWho.get(personOf(who).principal) ?? new Set<GrantMode>();
      held.add(mode);
      if (mode === "write") held.add("read"); // the platform plants the read in the same act (src/routes/authz.ts:1537-1540)
      byWho.set(personOf(who).principal, held);
      s.revoked.delete(`${vault.id}\n${personOf(who).principal}`);
    },
    signInAs(p, opts) {
      const who = personOf(p);
      const jkt = opts?.jwk ? thumbprint(opts.jwk) : null;
      const session = mintToken(core, { principal: who.principal, email: who.email }, jkt);
      return { token: session.token, principal: who.principal };
    },

    edit(id, facts) {
      const r = s.records.get(id);
      if (!r) return;
      for (const [k, v] of Object.entries(facts)) {
        const bare = k.replace(/^a:/, "");
        if (v === null) delete r.facts[bare];
        else r.facts[bare] = normaliseFacts({ [bare]: v })[bare];
      }
      stamp(core, r);
    },
    remove(id) {
      const r = s.records.get(id);
      if (r && r.endedSeq === null) endRecord(core, r);
    },
    bump(id) {
      const r = s.records.get(id);
      if (r) stamp(core, r);
    },
    revokeAccess(p, v) {
      const who = personOf(p);
      const vault = vaultOf(v);
      s.grants.get(vault.id)?.delete(who.principal);
      s.revoked.add(`${vault.id}\n${who.principal}`);
    },

    failNext(match, f) {
      const rule: Rule = { test: matcher(match), kind: "fail", status: f.status, body: f.body, message: f.message, times: f.times ?? 1, skip: f.skip ?? 0 };
      rules.push(rule);
      return () => {
        rules = rules.filter((r) => r !== rule);
      };
    },
    dropNext(match, opts = {}) {
      const rule: Rule = { test: matcher(match), kind: "drop", status: 0, times: opts.times ?? 1, skip: opts.skip ?? 0 };
      rules.push(rule);
      return () => {
        rules = rules.filter((r) => r !== rule);
      };
    },
    hold(match) {
      let release: () => void = () => undefined;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      const h = { test: matcher(match), gate, release };
      holds.push(h);
      return () => {
        holds = holds.filter((x) => x !== h);
        release();
      };
    },

    assertClean() {
      if (violations.length > 0) throw new Error(`fake-platform: ${violations.length} request(s) no route answers:\n${violations.join("\n")}`);
    },
    reset() {
      for (const h of holds) h.release();
      holds = [];
      rules = [];
      s.people.clear();
      s.vaults.clear();
      s.grants.clear();
      s.revoked.clear();
      s.records.clear();
      s.files.clear();
      s.sessions.clear();
      s.usedProofs.clear();
      s.seq = 0;
      counter = 0;
      callNo = 0;
      calls.length = 0;
      violations.length = 0;
      api.offline = false;
    },
  };
  return api;
}
