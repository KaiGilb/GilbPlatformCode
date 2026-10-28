// A Value (or Development Resource) record, a level, and the wait for the write queue, shared by the hook tests.
import { act } from "@testing-library/react";
import type { BaseRecord } from "@kaigilb/gilbplatformcode-base-record";
import type { LevelQualifier, ValueLevel } from "@kaigilb/gilbplatformcode-value-card-model";
import { entityUriOf } from "./server";

export const P = "https://p.example.test/vault";
export const VALUE_URI = entityUriOf("val1");

/** The Value (`t:Value`, tag `Speed`), or with another type the same record as a Development Resource. */
export function valueRow(served: Record<string, unknown> = {}, typeUri = "t:Value", tag = "Speed"): BaseRecord {
  const facts = { unitTag: tag, ...served };
  return {
    id: "val1",
    entityUri: VALUE_URI,
    typeUri,
    facts: Object.fromEntries(Object.entries(facts).map(([k, v]) => [k, typeof v === "string" ? v : JSON.stringify(v)])),
    opaqueFacts: [],
    etag: '"sha256:0"',
    updatedAt: 1,
    servedKeys: Object.keys(facts),
    served: { facts, context: undefined, etag: '"sha256:0"' },
  } as unknown as BaseRecord;
}

export const level = (kind: string, value: number | null, q: Partial<LevelQualifier> = {}): ValueLevel => ({
  kind,
  value,
  qualifier: { when: "", variables: {}, conditions: [], side: "", ...q },
  source: {},
  note: "",
});

export const settle = async () => {
  for (let i = 0; i < 30; i++)
    await act(async () => {
      await new Promise((r) => setTimeout(r, 5));
    });
};
