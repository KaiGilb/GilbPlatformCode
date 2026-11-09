# vault-access

Grants, revokes and reads who may use a whole vault, and shares that vault so a person can add records there.

## What this is

Grants, revokes and reads who may use a whole vault, and shares that vault so a person can add records there.

Creating a record in someone else's vault needs a whole-vault write grant. A per-record share (`lws-relations`) lets a person edit a record that already exists. It does not let them add one.

Only a holder of Control — the owner, or a person the owner delegated Control to — may grant or revoke. Anyone else gets 403, and the sentence is "You don't hold Control on this vault, so you can't change who can access it."

A write grant also gives read. The platform plants the read in the same act as the write. Revoking write leaves that read in place. Taking access away is `unshareVault`, which revokes write, then read, then append. A 200 that revoked nothing is ignored. Any other refusal throws, and a refusal on write stops the rest.

Every call goes to the vault's own host. Set the base origin to the apex, the platform origin, not to a vault host and not to the identity host. The address is the vault host from `vaultOriginOf` (`vault-origin-rule`) plus the path. The body, or the `vault` query on the access list, still names the vault.

- `grantVaultAccess(vaultId, grantee, mode)`: `POST /base/authz/grant-vault` with `{ vault, grantee, mode }`. `mode` is `read`, `write`, `append` or `control`. Returns nothing. A 401 drops the credential and says to re-authorize. Any other refusal uses the platform's sentence, not its machine token (`BadRequest` is not the sentence).
- `revokeVaultAccess(vaultId, grantee, mode)`: `POST /base/authz/revoke-vault`, same body and the same errors.
- `fetchVaultAcl(vaultId)`: `GET /base/consent/vault-acl?vault=`. 200 is `{ controlled: true, note, acl, edges }`. 404 is `{ controlled: false }`. Each entry keeps `principal`, `levels`, `label`, `webId` and `kind`; a missing label or WebID is null, and a kind other than `owner-inferred` is `grant`. `labelSource`, `registered` and `viewer` are on the type and are not copied onto the entry (the source normalizer leaves them out).
- `shareVault(vaultId, grantee, level)`: `level` is `"view"` or `"edit"`. View grants read. Edit grants write, then reads the access list and requires the grantee the grant echoes — the platform resolves a short WebID to an opaque principal and returns that principal as `grantee` — to hold both read and write. If either is missing, it throws `VaultAccessError` and the message names the missing level (`view` or `edit`).
- `unshareVault(vaultId, grantee)`: revoke write, then read, then append. It does not revoke control.
- `VaultAccessError` (status and message), `VAULT_GRANT_MODES`, and the types `VaultGrantMode`, `VaultShareLevel`, `VaultAclEntry`, `VaultReachAclEntry`, `VaultAclResult`, `PrincipalLabelSource`, `PrincipalViewerRelation`.

The credential is the DPoP write pair for a grant or revoke, and the DPoP read pair for the access list, both from `lws-session-bridge`. The seam sends no credential to a host outside the platform's family.

## What this is not

- Not a per-record share. That is `lws-relations`. This unit does not grant `directReader` or `directWriter`.
- Not vault-to-vault reach, not binding an agent, not vault creation, not the per-entity access list, and not the rendered principal row.
- Not a sign-in, and not the decision of who holds Control. The platform decides. A 404 on the access list means this caller does not.

## How to take it

Package: `@kaigilb/gilbplatformcode-vault-access`

From a clone of this repository, install the unit's folder; `npm install` takes its peers first, in the order `node scripts/peers.mjs units/vault-access` prints:

```sh
npm install react@^19.0.0 <path-to-the-library>/units/base-origin <path-to-the-library>/units/server-error <path-to-the-library>/units/signin <path-to-the-library>/units/vault-origin-rule <path-to-the-library>/units/lws-session-bridge <path-to-the-library>/units/vault-access
```

Put this line in your app's own `.npmrc` so the units are installed as copies and not links:

```
install-links=true
```

The package ships TypeScript source (`src/`); your bundler compiles it. This unit's own code does not import React. `signin`, which the auth seam needs, declares React as a peer, so the install line above carries it. The closure is 6 units.

## Examples

A share sheet that lets a person add records in the vault, not only edit the ones that exist:

```ts
import { shareVault, unshareVault } from "@kaigilb/gilbplatformcode-vault-access";

const vault = "https://anna.gilb.com/vault";

await shareVault(vault, "https://anna.gilb.com", "edit");
await unshareVault(vault, "https://anna.gilb.com");
```

`shareVault(vault, "https://anna.gilb.com", "view")` grants read only. The grant is sent to `https://anna.gilb.com/base/authz/grant-vault` when the base origin is the apex `https://gilb.com`.

## What the host must supply

Nothing as an object. The unit reads two settings that the app sets once at start-up:

- the base origin (`setBaseOrigin` of `base-origin`), which `vaultOriginOf` reads. Set it to the apex;
- the auth seam (`setLwsAuth` of `lws-session-bridge`), which forms the credential headers.

## Module state

None. The unit holds no cache of its own.

## Do not

- Do not build the grant, revoke or access-list address from the base origin. The vault's host is the host that holds it. Revoke in particular is not forwarded to another store: a revoke sent to the wrong host runs its check and its write there.
- Do not revoke only write and tell the person their access is gone. The read planted with that write is still there. Call `unshareVault`.
- Do not grant the public marker on this route. The platform refuses it. Making a vault public is a different act, and this unit does not wrap it.
- Do not treat a per-record share as permission to add a record.

## Wrong readings

- "Edit on one record lets them add another." It does not. Adding needs a whole-vault write grant.
- "A write grant is write only." The platform also plants read. `shareVault(..., "edit")` checks that both are on the access list, on the principal the grant echoed.
- "Revoking write removes the person." It leaves read.
- "Any signed-in person can share a vault." Only a Control holder can. Others get 403.
- "The access list shows a label's register, or whether the row is the viewer." The type allows those fields. The read copied here does not put them on the entry.

## Where it came from

GilbApp (private repo `KaiGilb/GilbApp`), commit `e7c83b7dea8c30a1b851a9f4ada46cce4431141d`, copied by hand:

- `src/lib/base/vaultAccess.ts` lines 34-185 (the mode type and the mode list, the access-list types, `VaultAccessError`, `readJson`, `fetchVaultAcl`, `postGrant`, `grantVaultAccess`) to `src/vaultAccess.ts`.
- `src/lib/base/vaultAccess.ts` lines 293-297 (`revokeVaultAccess`) to `src/vaultAccess.ts`.
- `src/lib/base/config.ts` lines 686-693 (`VAULT_ACL_URL`), 702-708 (`GRANT_VAULT_URL`) and 776-779 (`REVOKE_VAULT_URL`) to `vaultAclUrl`, `grantVaultUrl` and `revokeVaultUrl` in `src/vaultAccess.ts`.

Named changes, and only these:

1. The imports: `vaultOriginOf` from `@kaigilb/gilbplatformcode-vault-origin-rule`; `dpopReadAuth`, `dpopWriteAuth` and `invalidateDpop` from `@kaigilb/gilbplatformcode-lws-session-bridge`; `serverErrorText` from `@kaigilb/gilbplatformcode-server-error`. In the source these are `./config`, `./dpop` and `./serverError`. The three URL constants are functions in this file, built from `vaultOriginOf` at each call.
2. The short-WebID example on `VaultAclEntry` named a host. The example is removed. No code changed.
3. Comments: cycle, ticket and person tags are removed.
4. `postGrant` returns the parsed body, so a caller can read the principal the platform echoes. `grantVaultAccess` and `revokeVaultAccess` still return `Promise<void>`.
5. `shareVault` and `unshareVault` are new, and so is the type `VaultShareLevel`. View grants read. Edit grants write, reads the access list, and matches `grantee` from the grant's body. `unshareVault` revokes write, then read, then append, because revoking write leaves the planted read.

New file: `src/index.ts`.

Left out, as the source of those acts is not this unit: reach edges (`grantVaultReachEdge`, `revokeVaultReachEdge`), binding an agent, vault-creation grants, the per-entity access list, and the principal-row rendering (`principalRow` and the rest below `fetchEntityAcl`).
