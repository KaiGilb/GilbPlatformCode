import type { Caller, RowAuth } from "./auth";
import type { Core, Req } from "./http";
import { createRecord, deleteRecord, listRecords, patchRecord, readRecord, replaceRecord } from "./records";
import { listVaults } from "./vaults";
import type { Method } from "./types";

/** GilbPlatform commit the rows below were read at (src/ paths in `mirrors` are in that tree). */
export const PLATFORM_SHA = "619aca557597b1bc50dd6e1340ebc274039be9c2";

export interface Route {
  /** DESIGN.md section 2 row number. */
  row: number;
  method: Method;
  /** `:name` matches one path segment. */
  path: string;
  auth: RowAuth;
  /** Where in GilbPlatform this row's behaviour is read (path:line, at PLATFORM_SHA). */
  mirrors: string[];
  handler: (core: Core, req: Req, caller: Caller | null) => Response | Promise<Response>;
}

/**
 * THE dispatch table: the only source of routes. A request no row matches is answered 404 `fake_platform_no_such_route`
 * and recorded in `violations` (the honesty rule, DESIGN.md section 5). Part 1: the vault list and the record routes.
 */
export const ROUTES: readonly Route[] = [
  { row: 5, method: "GET", path: "/lws/vaults", auth: "floor", mirrors: ["src/lws/routes.ts:782", "src/lws/vaults.ts:563-717"], handler: listVaults },
  { row: 7, method: "POST", path: "/lws/vault/:vault/c", auth: "floor", mirrors: ["src/lws/routes.ts:838-876", "src/lws/routes.ts:1156-1165", "src/authz/vault-target.ts:304-324"], handler: createRecord },
  { row: 8, method: "GET", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:585-593", "src/lws/routes.ts:152-215", "src/lws/resource-frame.ts:27-41"], handler: readRecord },
  { row: 9, method: "PATCH", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:1026-1073", "src/lws/crud.ts:459-524"], handler: patchRecord },
  { row: 10, method: "PUT", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:998-1024", "src/lws/crud.ts:300-395"], handler: replaceRecord },
  { row: 11, method: "DELETE", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:1075-1140", "src/lws/crud.ts:632-733"], handler: deleteRecord },
  { row: 12, method: "GET", path: "/lws/vault/:vault/records", auth: "floor", mirrors: ["src/lws/routes.ts:712-727", "src/lws/records.ts:205-1059"], handler: listRecords },
];

/** The row a method and path belong to, with its decoded `:params`; null when no row answers. */
export function matchRoute(method: string, path: string): { route: Route; params: Record<string, string> } | null {
  const segs = path.split("/");
  for (const route of ROUTES) {
    if (route.method !== method) continue;
    const want = route.path.split("/");
    if (want.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < want.length; i++) {
      const w = want[i]!;
      if (w.startsWith(":")) {
        if (segs[i] === "") { ok = false; break; }
        try {
          params[w.slice(1)] = decodeURIComponent(segs[i]!);
        } catch {
          ok = false;
          break;
        }
      } else if (w !== segs[i]) {
        ok = false;
        break;
      }
    }
    if (ok) return { route, params };
  }
  return null;
}
