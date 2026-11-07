import { setLwsAuth, type LwsAuthHost } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import type { Session } from "./types";

/**
 * An in-browser fake vault for dev:fake and the tests. It answers, on its own origin only:
 *   PUT   /lws/vault/<root>/files?name=&folder=   (the upload door; 201 {entity})
 *   PATCH /lws/r/<id>                              (JSON merge patch on a file record)
 *   GET   /files/<id>                              (the bytes)
 *   GET   /lws/vault/<root>/files                  (the list; this route is the APP'S own assumption, no unit names one)
 * Any request to another host is recorded in `violations` and fails.
 */
export interface FakeFile {
  id: string;
  entity: string;
  name: string;
  type: string;
  size: number;
  bytes: Uint8Array;
  record: Record<string, unknown>;
}

export interface FakeVaultOptions {
  origin: string;
  root: string;
}

export class FakeVault {
  readonly origin: string;
  readonly root: string;
  files: FakeFile[] = [];
  uploads: string[] = []; // file names of every PUT, in order
  patches: { id: string; body: Record<string, unknown> }[] = [];
  requests: string[] = [];
  violations: string[] = [];
  /** Make the next n uploads answer this status (503 busy, 403 refused, ...). */
  failUploads: { status: number; times: number; skip?: number; body?: string } | null = null;
  /** Make the list answer 403 with the server's own sentence. */
  refuseList: string | null = null;
  private n = 0;

  constructor(opts: FakeVaultOptions) {
    this.origin = opts.origin;
    this.root = opts.root;
  }

  session(principal = "fake-person"): Session {
    return { principal, vaultOrigin: this.origin, vaultRoot: this.root };
  }

  /** Put a stored picture into the vault without a request (a master with its small copy). */
  seed(name: string, master: Uint8Array, thumb: Uint8Array): { master: FakeFile; thumb: FakeFile } {
    const m = this.store(`${name}.jpg`, "image/jpeg", master);
    const t = this.store(`${name}-320.jpg`, "image/jpeg", thumb);
    t.record.transcodedFrom = { "@id": m.entity };
    return { master: m, thumb: t };
  }

  private store(name: string, type: string, bytes: Uint8Array): FakeFile {
    this.n += 1;
    const id = `file${String(this.n).padStart(4, "0")}`;
    const f: FakeFile = { id, entity: `${this.origin}/vault/e/${id}`, name, type, size: bytes.length, bytes, record: { fileByteSize: bytes.length, name } };
    this.files.unshift(f);
    return f;
  }

  fetch = async (input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init.method ?? "GET").toUpperCase();
    this.requests.push(`${method} ${url.pathname}${url.search}`);
    if (url.origin !== this.origin) {
      this.violations.push(`${method} ${url.href}`);
      throw new TypeError(`Failed to fetch (fake vault: ${url.origin} is not local)`);
    }
    const rootPath = `/lws/vault/${encodeURIComponent(this.root)}/files`;
    if (method === "PUT" && url.pathname === rootPath) {
      const body = init.body as Blob;
      this.uploads.push(url.searchParams.get("name") ?? "");
      if (this.failUploads && this.failUploads.skip) {
        this.failUploads.skip -= 1;
      } else if (this.failUploads && this.failUploads.times > 0) {
        this.failUploads.times -= 1;
        return new Response(this.failUploads.body ?? "{}", { status: this.failUploads.status, headers: { "content-type": "application/json" } });
      }
      const f = this.store(url.searchParams.get("name") ?? "file", body.type || "image/jpeg", await bytesOf(body));
      return json({ entity: f.entity }, 201);
    }
    if (method === "GET" && url.pathname === rootPath) {
      if (this.refuseList) return json({ error: this.refuseList, message: this.refuseList }, 403);
      return json({ files: this.files.map((f) => ({ entity: f.entity, body: f.record })) }, 200);
    }
    const rec = /^\/lws\/r\/([^/]+)$/.exec(url.pathname);
    if (method === "PATCH" && rec) {
      const id = decodeURIComponent(rec[1]!);
      const f = this.files.find((x) => x.id === id);
      if (!f) return json({ error: "not found" }, 404);
      const body = JSON.parse(String(init.body)) as Record<string, unknown>;
      this.patches.push({ id, body });
      for (const [k, v] of Object.entries(body)) {
        const key = k.replace(/^(a|t):/, "");
        if (v === null) delete f.record[key];
        else f.record[key] = v;
      }
      return json({ etag: '"v2"' }, 200, { etag: '"v2"' });
    }
    const get = /^\/files\/([^/]+)$/.exec(url.pathname);
    if (method === "GET" && get) {
      const f = this.files.find((x) => x.id === decodeURIComponent(get[1]!));
      if (!f) return json({ error: "not found" }, 404);
      return new Response(f.bytes as BlobPart, { status: 200, headers: { "content-type": f.type } });
    }
    return json({ error: `fake vault: no route ${method} ${url.pathname}` }, 404);
  };
}

function json(body: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}

async function bytesOf(blob: Blob): Promise<Uint8Array> {
  // jsdom's Blob has no arrayBuffer(); its size is all a test needs
  if (typeof blob.arrayBuffer === "function") return new Uint8Array(await blob.arrayBuffer());
  return new Uint8Array(blob.size);
}

/** A fake signed-in session: the host the lws-session-bridge README says setLwsAuth takes. */
export function installFakeAuth(principal: string, vaultRoot: string): void {
  const headers = async () => ({ authorization: "DPoP fake-token", dpop: "fake-proof" });
  const host: LwsAuthHost = {
    bearerHeaderFor: headers,
    dpopReadAuth: headers,
    dpopWriteAuth: headers,
    invalidateDpop: () => undefined,
    tokenManager: {
      invalidate: () => undefined,
      getSession: async () => ({ principal, vault: vaultRoot, vaults: [{ vaultId: vaultRoot, modes: ["read", "write"] }] }) as never,
    },
  } as LwsAuthHost;
  setLwsAuth(host);
}
