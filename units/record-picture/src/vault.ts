import { createRecord, deleteRecord, patchRecord, type RecordCreateFacts } from "@kaigilb/gilbplatformcode-lws-records";
import { signedSend } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { copiesOf, endPictureFiles, loadCopyMap, storePictureSet, type CopyMap, type Send, type StoredPicture } from "@kaigilb/gilbplatformcode-picture-set";
import type { PictureFlowDeps } from "./flow";
import { linkPicture, pictureLinkPatch, type RecordRef } from "./link";
import type { PreparedPicture } from "./types";

export interface VaultPictures {
  /** The vault's files, listed once, as a copy map (never throws: a failed listing is an empty map). */
  loadCopies(): Promise<CopyMap>;
  /** Stores the screen copy as the master and the small copy, linked; the small copy's link is tried once more. */
  upload(p: PreparedPicture): Promise<StoredPicture>;
  /** Ends the master and its copies; answers the addresses that could NOT be ended ([] when all were). */
  endFiles(master: string, copies: readonly string[]): Promise<string[]>;
}

/**
 * Binds picture-set's `loadCopyMap`, `storePictureSet` and `endPictureFiles` to one vault. Nothing more.
 *
 * @param c.vaultOrigin the origin that serves the vault; `vaultRoot` its id as the vault list gives it; `folder` where pictures are stored
 * @param c.send the signed sender; defaults to lws-session-bridge's `signedSend()`
 */
export function createVaultPictures(c: { vaultOrigin: string; vaultRoot: string; folder: string; send?: Send }): VaultPictures {
  const send: Send = c.send ?? signedSend();
  const target = { vaultOrigin: c.vaultOrigin, vaultRoot: c.vaultRoot, folder: c.folder };
  return {
    loadCopies: () => loadCopyMap(c.vaultRoot, { origin: c.vaultOrigin, send }),
    upload: (p) => storePictureSet({ screen: p.screen, thumb: p.thumb }, target),
    endFiles: async (master, copies) => (await endPictureFiles(master, copies, { origin: c.vaultOrigin, send })).map((f) => f.entity),
  };
}

/** What {@link vaultPictureService} is given. Nothing about a host or a fact name lives here: the caller supplies them. */
export interface VaultPictureServiceDeps {
  /** The origin that serves a vault, from the vault's id as the vault list gives it (an app takes `vaultOriginOf` of vault-origin-rule). */
  originOf(vaultRoot: string): string;
  /** Where pictures are stored in every vault. */
  folder: string;
  /** The signed sender; defaults to lws-session-bridge's `signedSend()` as in `createVaultPictures`. */
  send?: Send;
  /** Frees an object URL; defaults to `URL.revokeObjectURL`. */
  revoke?(url: string): void;
}

export interface VaultPictureService {
  /** The vault's binding, made once per vault (by `vaultRoot`) and kept until `fresh` or `forget`. */
  forVault(vaultRoot: string): VaultPictures;
  /** The vault's copy map, listed once and kept until a picture changes (`loadCopies` never throws, so a failed listing is an empty map). */
  copies(vaultRoot: string): Promise<CopyMap>;
  /** Drops this vault's cached binding and copy map; the next `forVault` makes a new binding and the next `copies` lists again. Tracked URLs stay. */
  fresh(vaultRoot: string): void;
  /** One vault's cached binding, copy map and tracked URLs (those tracked with this vault), or with no argument every vault's, and every tracked URL. */
  forget(vaultRoot?: string): void;
  /** Remembers an object URL so it can be released later; returns it. Give `vaultRoot` to have `forget(vaultRoot)` release it. Tracking one twice keeps it once. */
  track(url: string, vaultRoot?: string): string;
  /** Revokes a tracked URL, once. A URL that is not tracked (never, or already released) is left alone. */
  release(url: string): void;
  /** Revokes every tracked URL. */
  releaseAll(): void;
}

/**
 * One picture binding and one copy map per vault, made on first use, and a tracker for the object URLs a screen holds. It adds no
 * fetching of its own: it keeps what `createVaultPictures` makes and frees what it was told to track.
 */
export function vaultPictureService(deps: VaultPictureServiceDeps): VaultPictureService {
  const bindings = new Map<string, VaultPictures>();
  const maps = new Map<string, Promise<CopyMap>>();
  const tracked = new Map<string, string | undefined>(); // object URL -> the vault it was tracked with
  const revoke = (url: string): void => (deps.revoke ?? ((u: string) => URL.revokeObjectURL(u)))(url);

  const forVault = (vaultRoot: string): VaultPictures => {
    let b = bindings.get(vaultRoot);
    if (!b) {
      b = createVaultPictures({ vaultOrigin: deps.originOf(vaultRoot), vaultRoot, folder: deps.folder, ...(deps.send ? { send: deps.send } : {}) });
      bindings.set(vaultRoot, b);
    }
    return b;
  };
  const release = (url: string): void => {
    if (!tracked.has(url)) return;
    tracked.delete(url);
    revoke(url);
  };
  return {
    forVault,
    copies(vaultRoot) {
      let m = maps.get(vaultRoot);
      if (!m) {
        m = forVault(vaultRoot).loadCopies();
        maps.set(vaultRoot, m);
      }
      return m;
    },
    fresh(vaultRoot) {
      bindings.delete(vaultRoot);
      maps.delete(vaultRoot);
    },
    forget(vaultRoot) {
      if (vaultRoot === undefined) {
        bindings.clear();
        maps.clear();
        for (const url of [...tracked.keys()]) release(url);
        return;
      }
      bindings.delete(vaultRoot);
      maps.delete(vaultRoot);
      for (const [url, v] of [...tracked]) if (v === vaultRoot) release(url);
    },
    track(url, vaultRoot) {
      tracked.set(url, vaultRoot);
      return url;
    },
    release,
    releaseAll() {
      for (const url of [...tracked.keys()]) release(url);
    },
  };
}

/** What {@link vaultPictureFlowDeps} is given. Nothing here names a host, a fact or a type: the caller supplies them. */
export interface VaultPictureFlowOptions<R extends RecordRef & { picture: string | null }, F> {
  /** The vault the records live in, as the vault list gives it. */
  vaultId: string;
  /** The type the record is created with. */
  typeIri: string;
  /** The name of the record's picture fact (this unit holds none). */
  fact: string;
  /** The vault's picture binding (`createVaultPictures`, or `vaultPictureService(...).forVault(vaultId)`). */
  pictures: Pick<VaultPictures, "upload" | "endFiles">;
  /** The vault's copy map, read when a replace or delete needs the copies of a master; omit for none. */
  copies?: CopyMap | (() => CopyMap);
  /** The facts a new record is created with. */
  toFacts(form: F): RecordCreateFacts;
  /** The record as the host holds it, from what the create answered, the form, and the picture address it was created with (null for none). */
  fromRecord(made: RecordRef, form: F, picture: string | null): R;
  /** The name hint for the new record's address; omit for none. */
  nameHint?(form: F): string | undefined;
  /**
   * The signed-in principal's address. When it is given (a string, or a function answering one, or null for none), it is written as
   * `statedBy` on the create and on every picture link PATCH. When it is absent nothing is added.
   */
  stamp?: string | null | (() => string | null);
}

/**
 * The {@link PictureFlowDeps} an app writes by hand: create into the vault (with the picture link when the flow asks, picture-first), link
 * with `linkPicture`, end files with picture-set, and delete the record WITHOUT If-Match (the files are already ended, so a record that
 * moved on must still go). With `stamp`, `statedBy` is added to the create and to the link PATCH.
 */
export function vaultPictureFlowDeps<R extends RecordRef & { picture: string | null }, F>(o: VaultPictureFlowOptions<R, F>): PictureFlowDeps<R, F> {
  const stampFacts = (): Record<string, string> => {
    const who = typeof o.stamp === "function" ? o.stamp() : o.stamp;
    return who ? { statedBy: who } : {};
  };
  const map = (): CopyMap => (typeof o.copies === "function" ? o.copies() : (o.copies ?? new Map()));
  const stampedPatch: typeof patchRecord = (id, patch, at, source, precondition) => patchRecord(id, { ...patch, ...stampFacts() }, at, source, precondition);
  return {
    fact: o.fact,
    createRecord: async (form, pic) => {
      const facts: RecordCreateFacts = { ...o.toFacts(form), ...stampFacts(), ...(pic ? (pictureLinkPatch(o.fact, pic.master) as RecordCreateFacts) : {}) };
      const made = await createRecord(o.vaultId, o.typeIri, facts, o.nameHint?.(form));
      return o.fromRecord({ id: made.id, entity: made.entity ?? null, etag: made.etag }, form, pic?.master ?? null);
    },
    upload: (p) => o.pictures.upload(p),
    link: async (rec, master) => {
      const r = await linkPicture(rec, o.fact, master, { patch: stampedPatch });
      return { ...rec, etag: r.etag, picture: r.picture };
    },
    endFiles: (master, copies) => o.pictures.endFiles(master, copies),
    copiesOf: (master) => copiesOf(map(), master).map((c) => c.uri),
    deleteRecord: (rec) => deleteRecord(rec.id, rec.entity),
    pictureOf: (rec) => rec.picture,
  };
}
