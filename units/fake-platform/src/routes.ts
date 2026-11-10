import type { Caller, RowAuth } from "./auth";
import type { Core, Req } from "./http";
import { checkName, createNamed, namePrep, requestCode, verifyCode } from "./signin";
import { grantVault, revokeVault, vaultAcl } from "./access";
import { endFileRoute, getFile, listFiles, uploadFile } from "./files";
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
 * and recorded in `violations` (the honesty rule, DESIGN.md section 5). Part 1: the vault list and the record routes. Part 2: files and grants. Part 3: sign-in, check-name, create-named.
 */
export const ROUTES: readonly Route[] = [
  { row: 1, method: "POST", path: "/base/auth/email/request-code", auth: "none", mirrors: ["src/routes/email-auth.ts:289-355", "src/routes/email-auth.ts:68-82"], handler: (c, r) => requestCode(c, r) },
  { row: 2, method: "POST", path: "/base/auth/email/verify-code", auth: "none", mirrors: ["src/routes/email-auth.ts:358-565", "src/routes/email-auth.ts:84-108"], handler: (c, r) => verifyCode(c, r) },
  { row: 3, method: "POST", path: "/onboard/api/name-prep", auth: "none", mirrors: ["src/routes/onboarding.ts:895-926"], handler: (c, r) => namePrep(c, r) },
  { row: 4, method: "POST", path: "/onboard/api/check-name", auth: "none", mirrors: ["src/routes/onboarding.ts:929-972", "src/auth/reserved-names.ts:18-39"], handler: (c, r) => checkName(c, r) },
  { row: 5, method: "GET", path: "/lws/vaults", auth: "floor", mirrors: ["src/lws/routes.ts:782", "src/lws/vaults.ts:563-717"], handler: listVaults },
  { row: 6, method: "POST", path: "/base/vault/create-named", auth: "strict", mirrors: ["src/routes/vault.ts:376-417", "src/auth/create-named-vault.ts:153-520"], handler: createNamed },
  { row: 7, method: "POST", path: "/lws/vault/:vault/c", auth: "floor", mirrors: ["src/lws/routes.ts:838-876", "src/lws/routes.ts:1156-1165", "src/authz/vault-target.ts:304-324"], handler: createRecord },
  { row: 8, method: "GET", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:585-593", "src/lws/routes.ts:152-215", "src/lws/resource-frame.ts:27-41"], handler: readRecord },
  { row: 9, method: "PATCH", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:1026-1073", "src/lws/crud.ts:459-524"], handler: patchRecord },
  { row: 10, method: "PUT", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:998-1024", "src/lws/crud.ts:300-395"], handler: replaceRecord },
  { row: 11, method: "DELETE", path: "/lws/r/:id", auth: "floor", mirrors: ["src/lws/routes.ts:1075-1140", "src/lws/crud.ts:632-733"], handler: deleteRecord },
  { row: 12, method: "GET", path: "/lws/vault/:vault/records", auth: "floor", mirrors: ["src/lws/routes.ts:712-727", "src/lws/records.ts:205-1059"], handler: listRecords },
  { row: 13, method: "PUT", path: "/lws/vault/:vault/files", auth: "floor", mirrors: ["src/routes/files.ts:1354-1363", "src/routes/files.ts:695-716", "src/routes/files.ts:363-597"], handler: uploadFile },
  { row: 13, method: "POST", path: "/lws/vault/:vault/files", auth: "floor", mirrors: ["src/routes/files.ts:1354-1363", "src/routes/files.ts:695-716", "src/routes/files.ts:363-597"], handler: uploadFile },
  { row: 14, method: "GET", path: "/lws/vault/:vault/files", auth: "floor", mirrors: ["src/routes/file-browse.ts:73-100", "src/routes/file-browse.ts:208-250", "src/read/file-browse.ts:283-499"], handler: listFiles },
  { row: 15, method: "GET", path: "/files/:id", auth: "floor", mirrors: ["src/routes/files.ts:1321-1325", "src/routes/files.ts:870-986"], handler: getFile },
  { row: 16, method: "DELETE", path: "/files/:id", auth: "floor", mirrors: ["src/routes/files.ts:1385-1389", "src/routes/files.ts:749-809"], handler: endFileRoute },
  // Row 17 (PATCH /lws/r/<file id>, the transcodedFrom link) is row 9's route: a file is an entity (src/lws/routes.ts:1026-1073).
  { row: 18, method: "POST", path: "/base/authz/grant-vault", auth: "strict", mirrors: ["src/routes/authz.ts:1457-1550", "src/routes/authz.ts:638-693"], handler: grantVault },
  { row: 19, method: "POST", path: "/base/authz/revoke-vault", auth: "strict", mirrors: ["src/routes/authz.ts:1581-1616", "src/authz/vault-grant.ts:635-653"], handler: revokeVault },
  { row: 20, method: "GET", path: "/base/consent/vault-acl", auth: "strict", mirrors: ["src/routes/consent.ts:119-135", "src/authz/entity-acl.ts:452-576"], handler: vaultAcl },
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
