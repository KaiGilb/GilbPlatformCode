// The Description's part reads: one a:partOf find at every depth, the tree, and the notes
// when a level was cut or a record did not read. Writing stays in PlanDescriptionParts.

import { createElement, Fragment, useEffect, useMemo, useState, type ReactNode } from "react";
import { isValueCardType } from "@kaigilb/gilbplatformcode-plan-kinds";
import { planVaultOf } from "./planVault";
import { planCapSentence, planFindCapFor, planFindRows, planUnreadSentence, type PlanFind } from "./planFind";
import { asGrid, descriptionTree, isPartType, type DescriptionNode } from "@kaigilb/gilbplatformcode-description-parts-model";
import type { BaseRecord, GridRecord } from "@kaigilb/gilbplatformcode-base-record";
import { useDescriptionPartsHost } from "./host";

const quiet = "text-[12px] text-[var(--ink-soft)]";

export const PARTIAL_LEVEL = "Some parts at this level are not shown. Moves here read the whole level first.";

export type FindRead = "pending" | "error" | "success";

function idsInTree(nodes: readonly DescriptionNode<GridRecord>[]): Set<string> {
  const ids = new Set<string>();
  const walk = (list: readonly DescriptionNode<GridRecord>[]) => {
    for (const node of list) {
      ids.add(node.row.id);
      walk(node.children);
    }
  };
  walk(nodes);
  return ids;
}

function subRead(node: DescriptionNode<GridRecord>, findStatus: ReadonlyMap<string, FindRead>): FindRead {
  const own = findStatus.get(node.row.id) ?? "pending";
  if (own !== "success") return own;
  let pending = false;
  for (const child of node.children) {
    const deeper = subRead(child, findStatus);
    if (deeper === "error") return "error";
    if (deeper === "pending") pending = true;
  }
  return pending ? "pending" : "success";
}

/** True only when this part's own `a:partOf` find and every deeper one succeeded. */
function settled(node: DescriptionNode<GridRecord>, findStatus: ReadonlyMap<string, FindRead>): boolean {
  return subRead(node, findStatus) === "success";
}

export function PlanFindLimitNote({
  data,
  word,
  singular,
  onRetry,
  partialSentence = null,
}: {
  data: PlanFind | null | undefined;
  word: string;
  singular: string;
  onRetry: () => void;
  /** Description levels pass {@link PARTIAL_LEVEL}. Other lists pass none: their noun is their own. */
  partialSentence?: string | null;
}): ReactNode {
  if (!data || (data.unread <= 0 && !data.capped)) return null;
  // This file is .ts, so the note is built without JSX.
  // The cap or unread note, then the partial-level sentence when this list asked for one, then Try again.
  return createElement(
    Fragment,
    null,
    data.capped ? createElement("p", { className: quiet }, planCapSentence(data.total, word, data.cap)) : null,
    data.unread > 0
      ? createElement("button", { type: "button", className: quiet, onClick: onRetry }, planUnreadSentence(data.unread, singular))
      : null,
    partialSentence ? createElement("p", { className: quiet }, partialSentence) : null,
    createElement("button", { type: "button", className: quiet, onClick: onRetry }, "Try again"),
  );
}

export function usePlanParts(record: BaseRecord, vaultId: string) {
  const host = useDescriptionPartsHost();
  const planVault = planVaultOf(record, vaultId);
  // The tag pool is this record's vault. The screen vault would refuse a tag that is used only there.
  const list = host.useRecords(planVault);
  const tops = host.usePlanFind(planVault, "a:partOf", record.entityUri ? record : null, planFindCapFor(isValueCardType(record.typeUri)));
  const [deeperState, setDeeper] = useState<{ owner: string; items: { id: string; uri: string }[] }>({
    owner: record.id,
    items: [],
  });
  const deeper = deeperState.owner === record.id ? deeperState.items : [];
  const parents = useMemo(() => {
    const byId = new Map<string, { id: string; uri: string }>();
    for (const r of planFindRows(tops.data)) if (isPartType(r.typeUri) && r.entityUri) byId.set(r.id, { id: r.id, uri: r.entityUri });
    for (const d of deeper) byId.set(d.id, d);
    return [...byId.values()];
  }, [tops.data, deeper]);
  const subResults = host.useSubFinds(planVault, "a:partOf", parents);
  const found = useMemo(() => {
    const rows: GridRecord[] = [];
    const seen = new Set<string>();
    const add = (row: BaseRecord) => {
      if (seen.has(row.id)) return;
      seen.add(row.id);
      rows.push(asGrid(row));
    };
    for (const row of planFindRows(tops.data)) add(row);
    for (const q of subResults) for (const row of planFindRows(q.data)) add(row);
    return rows;
  }, [tops.data, subResults]);
  useEffect(() => {
    const live = idsInTree(descriptionTree(record, found));
    setDeeper((prev) => {
      const prior = prev.owner === record.id ? prev.items : [];
      const kept = prior.filter((item) => live.has(item.id));
      const have = new Set(parents.map((p) => p.id));
      const add = found.filter((r) => isPartType(r.typeUri) && !!r.entityUri && live.has(r.id) && !have.has(r.id));
      const items = [...kept, ...add.map((r) => ({ id: r.id, uri: r.entityUri! }))];
      if (
        prev.owner === record.id &&
        items.length === prior.length &&
        items.every((item, i) => item.id === prior[i]?.id && item.uri === prior[i]?.uri)
      ) {
        return prev;
      }
      return { owner: record.id, items };
    });
  }, [found, parents, record]);
  const tagPool = useMemo(() => {
    const rows = [...found];
    const seen = new Set(rows.map((r) => r.id));
    for (const row of list.data ?? []) {
      if (!seen.has(row.id)) rows.push(row);
    }
    return rows;
  }, [found, list.data]);
  const tree = descriptionTree(record, found);
  const findStatus = new Map<string, FindRead>();
  parents.forEach((p, i) => {
    const status = subResults[i]?.status;
    findStatus.set(p.id, status === "error" ? "error" : status === "success" ? "success" : "pending");
  });
  const pending = tops.isLoading || subResults.some((q) => q.isLoading);
  const failed = tops.isError || subResults.some((q) => q.isError);

  function findFor(id: string): PlanFind | undefined {
    return id === record.id ? tops.data : subResults[parents.findIndex((p) => p.id === id)]?.data;
  }

  function noteFor(id: string): PlanFind | null {
    const data = findFor(id);
    if (!data || (data.unread <= 0 && !data.capped)) return null;
    return data;
  }

  function findState(id: string): "pending" | "error" | "success" | "none" {
    if (id === record.id) {
      if (tops.isError) return "error";
      if (tops.isPending) return "pending";
      if (tops.isSuccess) return "success";
      return "none";
    }
    const i = parents.findIndex((p) => p.id === id);
    if (i < 0) return "none";
    const q = subResults[i];
    if (!q) return "none";
    if (q.isError) return "error";
    if (q.isPending) return "pending";
    if (q.isSuccess) return "success";
    return "none";
  }

  function partial(id: string): boolean {
    const state = findState(id);
    // A level still loading, or whose read failed, is not an empty level.
    if (state === "error" || state === "pending") return true;
    const data = findFor(id);
    return !!data && (data.capped || data.unread > 0);
  }

  return {
    tree,
    tagPool,
    pending,
    failed,
    topLoading: tops.isLoading,
    topError: tops.isError,
    parentIds: parents.map((p) => p.id),
    noteFor,
    partial,
    findState,
    childrenSettled: (node: DescriptionNode<GridRecord>) => settled(node, findStatus),
    subRead: (node: DescriptionNode<GridRecord>) => subRead(node, findStatus),
  };
}
