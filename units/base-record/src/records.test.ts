// The shapes are types, so most of this file is checked by `tsc` (npm run typecheck): each expectTypeOf
// fails the type check when a field changes its type or turns required/optional. The runtime half is
// small on purpose: the module exports nothing at runtime.
import { describe, expect, expectTypeOf, it } from "vitest";
import type { BaseRecord, GridRecord, ServedDocument } from "./index";
import * as unit from "./index";

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];
type OptionalKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? K : never }[keyof T];

describe("BaseRecord", () => {
  it("requires id, typeUri, facts, opaqueFacts and etag; everything else is optional", () => {
    expectTypeOf<RequiredKeys<BaseRecord>>().toEqualTypeOf<"id" | "typeUri" | "facts" | "opaqueFacts" | "etag">();
    expectTypeOf<OptionalKeys<BaseRecord>>().toEqualTypeOf<"entityUri" | "typeSubstituted" | "servedKeys" | "served">();
    expectTypeOf<keyof BaseRecord>().toEqualTypeOf<
      "id" | "typeUri" | "facts" | "opaqueFacts" | "etag" | "entityUri" | "typeSubstituted" | "servedKeys" | "served"
    >();
  });

  it("types each field", () => {
    expectTypeOf<BaseRecord["id"]>().toEqualTypeOf<string>();
    expectTypeOf<BaseRecord["typeUri"]>().toEqualTypeOf<string>();
    expectTypeOf<BaseRecord["facts"]>().toEqualTypeOf<Record<string, string>>();
    expectTypeOf<BaseRecord["etag"]>().toEqualTypeOf<string | null>();
    expectTypeOf<BaseRecord["opaqueFacts"]>().toEqualTypeOf<readonly string[]>();
    expectTypeOf<BaseRecord["entityUri"]>().toEqualTypeOf<string | undefined>();
    expectTypeOf<BaseRecord["typeSubstituted"]>().toEqualTypeOf<true | undefined>();
    expectTypeOf<BaseRecord["servedKeys"]>().toEqualTypeOf<readonly string[] | undefined>();
    expectTypeOf<BaseRecord["served"]>().toEqualTypeOf<ServedDocument | undefined>();
  });

  it("takes a record with only the required fields, and refuses one that leaves a required field out", () => {
    const bare: BaseRecord = { id: "r1", typeUri: "https://vault.example.test/base/t/Function", facts: {}, opaqueFacts: [], etag: null };
    expect(bare.id).toBe("r1");
    // @ts-expect-error opaqueFacts is required: a producer must state it on purpose
    const noOpaque: BaseRecord = { id: "r1", typeUri: "t:Function", facts: {}, etag: null };
    expect(noOpaque.id).toBe("r1");
    // @ts-expect-error typeSubstituted can only be true
    const falseFlag: BaseRecord = { ...bare, typeSubstituted: false };
    expect(falseFlag.id).toBe("r1");
    // @ts-expect-error a fact is a string in the flat map
    const numberFact: BaseRecord = { ...bare, facts: { n: 1 } };
    expect(numberFact.id).toBe("r1");
  });
});

describe("ServedDocument", () => {
  it("requires facts, context and etag; prefixedKeys is optional", () => {
    expectTypeOf<RequiredKeys<ServedDocument>>().toEqualTypeOf<"facts" | "context" | "etag">();
    expectTypeOf<OptionalKeys<ServedDocument>>().toEqualTypeOf<"prefixedKeys">();
    expectTypeOf<ServedDocument["facts"]>().toEqualTypeOf<Readonly<Record<string, unknown>>>();
    expectTypeOf<ServedDocument["context"]>().toEqualTypeOf<unknown>();
    expectTypeOf<ServedDocument["etag"]>().toEqualTypeOf<string | null>();
    expectTypeOf<ServedDocument["prefixedKeys"]>().toEqualTypeOf<readonly string[] | undefined>();
  });

  it("is read-only", () => {
    const doc: ServedDocument = { facts: { title: "A" }, context: null, etag: '"sha256:x"' };
    // Never called: the lines only have to fail the type check.
    const writes = () => {
      // @ts-expect-error facts is read-only
      doc.facts = {};
      // @ts-expect-error etag is read-only
      doc.etag = null;
      // @ts-expect-error the served facts map is read-only
      doc.facts["title"] = "B";
    };
    expect(typeof writes).toBe("function");
    expect(doc.etag).toBe('"sha256:x"');
    expect(doc.facts).toEqual({ title: "A" });
  });
});

describe("GridRecord", () => {
  it("is a BaseRecord with updatedAt required, and hydrated and endingActorKind optional", () => {
    expectTypeOf<GridRecord>().toMatchTypeOf<BaseRecord>();
    expectTypeOf<RequiredKeys<GridRecord>>().toEqualTypeOf<RequiredKeys<BaseRecord> | "updatedAt">();
    expectTypeOf<OptionalKeys<GridRecord>>().toEqualTypeOf<OptionalKeys<BaseRecord> | "hydrated" | "endingActorKind">();
    expectTypeOf<GridRecord["updatedAt"]>().toEqualTypeOf<number>();
    expectTypeOf<GridRecord["hydrated"]>().toEqualTypeOf<boolean | undefined>();
    expectTypeOf<GridRecord["endingActorKind"]>().toEqualTypeOf<"holder" | "agent" | undefined>();
  });

  it("is used where a BaseRecord is wanted, but not the other way round", () => {
    const row: GridRecord = { id: "r1", typeUri: "t:Function", facts: {}, opaqueFacts: [], etag: null, updatedAt: 0 };
    const asBase: BaseRecord = row;
    expect(asBase.id).toBe("r1");
    // @ts-expect-error a BaseRecord has no updatedAt
    const notGrid: GridRecord = asBase;
    expect(notGrid.id).toBe("r1");
    // @ts-expect-error endingActorKind is holder or agent
    const wrongKind: GridRecord = { ...row, endingActorKind: "robot" };
    expect(wrongKind.id).toBe("r1");
  });
});

describe("the module", () => {
  it("exports nothing at runtime: types only", () => {
    expect(Object.keys(unit)).toEqual([]);
  });
});
