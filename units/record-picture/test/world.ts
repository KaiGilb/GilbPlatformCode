// Test support, not shipped: the fake platform with one person (ann), her vault, the units' real clients pointed at it, and the picture flow
// wired the way an app wires it (lws-records for the record, picture-set for the files, linkPicture for the link).
import { resetBaseOrigin, setBaseOrigin } from "@kaigilb/gilbplatformcode-base-origin";
import { createFakePlatform, type FakePlatform, type Vault } from "@kaigilb/gilbplatformcode-fake-platform";
import { createRecord, deleteRecord, readRecord } from "@kaigilb/gilbplatformcode-lws-records";
import { resetLwsAuth, setLwsAuth } from "@kaigilb/gilbplatformcode-lws-session-bridge";
import { copiesOf, type CopyMap } from "@kaigilb/gilbplatformcode-picture-set";
import { vi } from "vitest";
import { linkPicture, pictureOfFacts, type PictureFlowDeps, type PreparedPicture, type RecordRef } from "../src";
import { createVaultPictures } from "../src/vault";

export const FACT = "image"; // the tests' own fixture value: the unit holds none
export const VAULT_ORIGIN = "https://ann.fake.test";

export interface Boat extends RecordRef {
  name: string;
  picture: string | null;
}
export interface BoatForm {
  name: string;
}

export const bytes = (n: number, seed = 1): Uint8Array<ArrayBuffer> => {
  const u = new Uint8Array(n);
  for (let i = 0; i < n; i++) u[i] = (i * 7 + seed) % 251;
  return u;
};
export const prepared = (seed = 1): PreparedPicture => ({
  screen: new Blob([bytes(300, seed)], { type: "image/jpeg" }),
  thumb: new Blob([bytes(40, seed + 1)], { type: "image/jpeg" }),
  previewUrl: "blob:test",
});

export interface World {
  fake: FakePlatform;
  vault: Vault;
  pics: ReturnType<typeof createVaultPictures>;
  /** The copy map the flow's `copiesOf` reads; reload it with `await w.reload()` after seeding files. */
  reload(): Promise<void>;
  boat(name: string, picture?: string): Promise<Boat>;
  read(id: string, entity: string | null): Promise<Boat>;
  deps(over?: Partial<PictureFlowDeps<Boat, BoatForm>>): PictureFlowDeps<Boat, BoatForm>;
  fileUrl(id: string): string;
  ended(id: string): boolean;
  /** Record PATCHes only (not the file links, which are PATCH /lws/r/<file id> too). */
  recordPatches(rec: { id: string }): ReturnType<FakePlatform["calls"]["of"]>;
  done(): void;
}

export function makeWorld(): World {
  const fake = createFakePlatform();
  const ann = fake.seedPerson({ email: "ann@example.test", vaultName: "ann" });
  const vault = fake.state.vaults.get(ann.landingVaultId!)!;
  setBaseOrigin(fake.origin);
  vi.stubGlobal("fetch", fake.fetch);
  setLwsAuth(fake.authHost(ann));
  const pics = createVaultPictures({ vaultOrigin: VAULT_ORIGIN, vaultRoot: vault.id, folder: "pics" });
  let map: CopyMap = new Map();
  const read = async (id: string, entity: string | null): Promise<Boat> => {
    const r = (await readRecord(id, entity))!;
    return { id, entity, etag: r.etag, name: r.facts.name ?? "", picture: pictureOfFacts(r.served!.facts as Record<string, unknown>, FACT) };
  };
  const make = async (name: string, picture?: { "@id": string }): Promise<Boat> => {
    const made = await createRecord(vault.id, "t:Sailboat", { name, ...(picture ? { [FACT]: picture } : {}) });
    return read(made.id, made.entity ?? null);
  };
  const fileUrl = (id: string) => `${VAULT_ORIGIN}/vault/e/${id}`;
  return {
    fake,
    vault,
    pics,
    reload: async () => void (map = await pics.loadCopies()),
    boat: (name, picture) => make(name, picture ? { "@id": picture } : undefined),
    read,
    fileUrl,
    ended: (id) => fake.state.files.get(id)!.endedSeq !== null,
    recordPatches: (rec) => fake.calls.of("PATCH /lws/r/:id").filter((c) => c.path.endsWith(`/${rec.id}`)),
    deps: (over = {}) => ({
      fact: FACT,
      createRecord: async (f, pic) => make(f.name, pic ? { "@id": pic.master } : undefined),
      upload: pics.upload,
      link: async (rec, master) => {
        await linkPicture(rec, FACT, master);
        return read(rec.id, rec.entity);
      },
      endFiles: pics.endFiles,
      copiesOf: (m) => copiesOf(map, m).map((c) => c.uri),
      deleteRecord: (rec) => deleteRecord(rec.id, rec.entity, { ifMatch: rec.etag }),
      pictureOf: (rec) => rec.picture,
      ...over,
    }),
    done: () => {
      vi.unstubAllGlobals();
      resetLwsAuth();
      resetBaseOrigin();
    },
  };
}
