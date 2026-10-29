// Test support: the REAL online card controller over a fake platform. `http` lists every request; `nonGet` every request that was not a GET.
import { createOnlineCardController, type ControllerDeps } from "@kaigilb/gilbplatformcode-online-card";
import type { LinkReading } from "@kaigilb/gilbplatformcode-online-card-link";

export const RECORD = "https://holder.example.test/vault/e/rec1";
export const HOLDER = "https://holder.example.test/vault";
export const ANN = "https://ann.example.test/vault";
export const GEO = "https://geo.example.test/base/e/";

export interface PublicField {
  principal: string;
  field: string;
  value: string;
  sourceEntity: string;
  claimVaultId: string;
  rung: string;
  kind?: string;
}

export const field = (name: string, value: string, extra: Partial<PublicField> = {}): PublicField => ({
  principal: ANN,
  field: name,
  value,
  sourceEntity: `${ANN}/e/${name}`,
  claimVaultId: ANN,
  rung: "public",
  ...extra,
});

export interface Rig {
  deps: ControllerDeps;
  http: string[];
  link: unknown[];
  nonGet: string[];
}

export function rig(opts: { link?: LinkReading; canWrite?: boolean; fields?: PublicField[]; cardStatus?: number } = {}): Rig {
  const r: Rig = { deps: undefined as never, http: [], link: [], nonGet: [] };
  const fields = opts.fields ?? [field("a:givenName", "Ann")];
  r.deps = {
    platform: {
      origin: "https://id.example.test",
      fetch: async (url, init) => {
        const u = new URL(url);
        if (init?.method && init.method !== "GET") r.nonGet.push(`${init.method} ${u.pathname}`);
        r.http.push(`${u.pathname}${u.search}`);
        if (u.pathname === "/base/connect/online-card-anchor") return new Response(JSON.stringify({ kind: "person", principal: ANN, entity: ANN }), { status: 200 });
        if (u.pathname === "/base/connect/public-card") {
          if (opts.cardStatus && opts.cardStatus !== 200) return new Response("{}", { status: opts.cardStatus });
          return new Response(JSON.stringify({ principal: ANN, fields, skills: [] }), { status: 200 });
        }
        return new Response("{}", { status: 404 });
      },
    },
    subject: { uri: RECORD, holder: HOLDER, link: opts.link ?? { state: "none" } },
    canWrite: opts.canWrite ?? true,
    writeLink: async (w) => void r.link.push(w),
  };
  return r;
}

export const controllerOf = (r: Rig) => createOnlineCardController(r.deps);
