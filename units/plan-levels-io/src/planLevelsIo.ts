// The reads and writes behind a project's level chooser: every level of a vault read page by page, the four default levels written once
// when the vault has none, and one level added. A level is a CauseEffectLevel record; the tree and its rules are `project-levels`.

import { useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import type { GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { createRecord, readRecord, recordFromServed, withTypeUri, type RecordCreateFacts } from "@kaigilb/gilbplatformcode-lws-records";
import { memberEntityUri } from "@kaigilb/gilbplatformcode-lws-relations";
import { listVaultRecordsPage, planReadLimit, type VaultRecordRef } from "@kaigilb/gilbplatformcode-lws-vault-sets";
import {
  DEFAULT_LEVELS,
  directChildren,
  levelTag,
  levelTree,
  nextPosition,
  pascalCase,
  tagOf,
  tokenOf,
  type LevelNode,
} from "@kaigilb/gilbplatformcode-project-levels";
import { recordsKey, type RecordsPage } from "@kaigilb/gilbplatformcode-record-cache-kit";
import { typeUriForVaultNamespace } from "@kaigilb/gilbplatformcode-record-types";

/** The ceiling of the app's list of records of a type. A vault that never says `complete` must not loop. */
const LEVEL_LIST_PAGE_CEILING = 50;

const LEVELS_UNREAD = "Could not read every level of this vault.";

export function planLevelsKey(vaultId: string): readonly ["base", "plan-levels", string] {
  return ["base", "plan-levels", vaultId];
}

function liveLevels(qc: QueryClient, vaultId: string): GridRecord[] {
  return qc.getQueryData<GridRecord[]>(planLevelsKey(vaultId)) ?? [];
}

export function readLevelTree(qc: QueryClient, vaultId: string): LevelNode[] {
  return levelTree(liveLevels(qc, vaultId));
}

/** The same GridRecord the grid builds from a listed row that carried its document (`recordHooks` hydrate).
 * A row with no body is one record read, through the Plan limiter when the caller has a client. */
async function gridFromListed(vaultId: string, ref: VaultRecordRef, qc?: QueryClient): Promise<GridRecord> {
  const read = () => readRecord(ref.id, ref.entityUri || vaultId);
  const served = ref.body
    ? recordFromServed(ref.id, ref.body, ref.etag ?? null)
    : await (qc ? planReadLimit(qc).run(read) : read());
  if (!served) throw new Error(LEVELS_UNREAD);
  return {
    ...withTypeUri(served, ref.typeUri || served.typeUri),
    entityUri: served.entityUri ?? ref.entityUri,
    hydrated: true,
    updatedAt: ref.updatedAt,
  };
}

/**
 * Every CauseEffectLevel in the vault, not the grid's recency page.
 * The page walk is the one the app's list of records of a type makes: follow `nextOffset`, stop on `complete`,
 * an empty page, or a next offset that does not advance. That helper does not throw and does not return a GridRecord,
 * so the walk lives here and the ceiling is a failure.
 */
export async function readAllLevels(vaultId: string, qc?: QueryClient): Promise<GridRecord[]> {
  const out: GridRecord[] = [];
  let offset = 0;
  let stop: "complete" | "end" | "ceiling" = "ceiling";
  for (let n = 0; n < LEVEL_LIST_PAGE_CEILING; n++) {
    const page = await listVaultRecordsPage(vaultId, ["CauseEffectLevel"], offset, {
      includePresentationState: true,
      includeBody: true,
    });
    for (const ref of page.records) out.push(await gridFromListed(vaultId, ref, qc));
    if (page.complete) {
      stop = "complete";
      break;
    }
    if (typeof page.nextOffset === "number") {
      if (page.nextOffset <= offset) {
        stop = "end";
        break;
      }
      offset = page.nextOffset;
      continue;
    }
    if (page.nextOffset === null && page.records.some((r) => !!r.body)) {
      stop = "end";
      break;
    }
    if (page.records.length === 0) {
      stop = "end";
      break;
    }
    offset += page.records.length;
  }
  if (stop === "ceiling") throw new Error(LEVELS_UNREAD);
  return out;
}

export function useAllLevels(vaultId: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: planLevelsKey(vaultId),
    queryFn: () => readAllLevels(vaultId, qc),
    enabled: vaultId.length > 0,
    retry: false,
  });
}

function factString(value: RecordCreateFacts[string]): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value && typeof value === "object" && !Array.isArray(value) && "@id" in value) {
    const id = (value as { "@id"?: unknown })["@id"];
    return typeof id === "string" ? id : "";
  }
  return "";
}

function levelGrid(id: string, vaultId: string, facts: RecordCreateFacts, etag: string | null): GridRecord {
  const stringFacts: Record<string, string> = {};
  for (const [key, value] of Object.entries(facts)) stringFacts[key] = factString(value);
  return {
    id,
    entityUri: memberEntityUri(id, null, vaultId),
    typeUri: typeUriForVaultNamespace("CauseEffectLevel", vaultId),
    facts: stringFacts,
    servedKeys: Object.keys(facts),
    opaqueFacts: [],
    etag: etag ?? null,
    updatedAt: Date.now(),
    served: { facts: { ...facts }, context: undefined, etag: etag ?? null },
  };
}

export function rememberLevels(qc: QueryClient, vaultId: string, rows: readonly GridRecord[]): void {
  qc.setQueryData<GridRecord[]>(planLevelsKey(vaultId), (prev) => {
    const records = [...(prev ?? [])];
    for (const row of rows) {
      const at = records.findIndex((r) => r.id === row.id);
      if (at >= 0) records[at] = row;
      else records.push(row);
    }
    return records;
  });
  const prev = qc.getQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId));
  if (!prev || prev.pages.length === 0) return;
  const [first, ...rest] = prev.pages;
  if (!first) return;
  const records = [...first.records];
  for (const row of rows) {
    const at = records.findIndex((r) => r.id === row.id);
    if (at >= 0) records[at] = row;
    else records.push(row);
  }
  qc.setQueryData<InfiniteData<RecordsPage>>(recordsKey(vaultId), {
    ...prev,
    pages: [{ ...first, records, total: Math.max(first.total, records.length) }, ...rest],
  });
}

const inflight = new Map<string, Promise<GridRecord[]>>();

/** The four default level records, once, the first time a level is set or added and the vault has none. */
export async function ensureDefaultLevels(vaultId: string, qc: QueryClient): Promise<GridRecord[]> {
  const pending = inflight.get(vaultId);
  if (pending) return pending;
  const job = readThenMaybeWriteDefaults(vaultId, qc);
  inflight.set(vaultId, job);
  try {
    return await job;
  } finally {
    inflight.delete(vaultId);
  }
}

/** A fresh read, not the cache. Levels already stored are kept. A failed read writes nothing. */
async function readThenMaybeWriteDefaults(vaultId: string, qc: QueryClient): Promise<GridRecord[]> {
  const have = await readAllLevels(vaultId, qc);
  if (have.length) {
    qc.setQueryData(planLevelsKey(vaultId), have);
    return have;
  }
  return writeDefaults(vaultId, qc);
}

async function writeDefaults(vaultId: string, qc: QueryClient): Promise<GridRecord[]> {
  const made: GridRecord[] = [];
  for (const d of DEFAULT_LEVELS) {
    const facts: RecordCreateFacts = {
      unitTag: tagOf(d.token),
      label: d.label,
      levelPosition: d.position,
      ontologyTerm: d.ontologyTerm,
    };
    const { id, etag } = await createRecord(vaultId, typeUriForVaultNamespace("CauseEffectLevel", vaultId), facts, d.label);
    const row = levelGrid(id.trim() || `level-${d.token}`, vaultId, facts, etag);
    made.push(row);
    rememberLevels(qc, vaultId, [row]);
  }
  return made;
}

/** Creates one level under `parentToken` (null = a main level). Ensures defaults first. Returns the new token. */
export async function addProjectLevel(
  vaultId: string,
  qc: QueryClient,
  label: string,
  parentToken: string | null,
): Promise<string> {
  const trimmed = label.trim();
  const pascal = pascalCase(trimmed);
  if (!pascal) throw new Error("A level needs a label.");
  await ensureDefaultLevels(vaultId, qc);
  const tree = readLevelTree(qc, vaultId);
  const parent = parentToken ? tree.find((n) => n.token === parentToken) ?? null : null;
  if (parentToken && !parent) throw new Error("That parent level is not in this project.");
  const parentTag = parent ? levelTag(parent) : "";
  const tag = parentTag ? `${parentTag}.${pascal}` : tagOf(pascal);
  const token = tokenOf(tag);
  const position = nextPosition(tree, parent ? parent.token : null);
  const facts: RecordCreateFacts = {
    unitTag: tag,
    label: trimmed,
    levelPosition: position,
    ontologyTerm: "none",
  };
  if (parent?.record) {
    const uri = parent.record.entityUri || memberEntityUri(parent.record.id, null, vaultId);
    facts.partOf = { "@id": uri };
  }
  const { id, etag } = await createRecord(vaultId, typeUriForVaultNamespace("CauseEffectLevel", vaultId), facts, trimmed);
  rememberLevels(qc, vaultId, [levelGrid(id.trim() || `level-${token}`, vaultId, facts, etag)]);
  return token;
}

/**
 * The vault's level tree, or the four defaults when it has no level records.
 * Reading does not write. `ensure` / `add` write, and only when a level is set or added.
 */
export async function waitForLevels(qc: QueryClient, vaultId: string): Promise<void> {
  await qc.fetchQuery({
    queryKey: planLevelsKey(vaultId),
    queryFn: () => readAllLevels(vaultId, qc),
    retry: false,
  });
}
