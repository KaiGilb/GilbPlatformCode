// A small fake platform for the hook tests: records by id (GET /lws/r/<id>), relations by record (GET /base/e/<id>/relations), and the master (served by a fixture).
// Not shipped (the package files are `src` only).
import { vi } from "vitest";
import { fixtureMaster, RIG } from "./masterFixture";

export const HOST = "https://h.platform.example.test";
export const VAULT = `${HOST}/vault`;

export type Doc = Record<string, unknown>;
export interface Wire {
  reads: string[];
  relationReads: string[];
  /** Every POST to the tag service (`/base/tag/masters`): the records asked for, one entry per call. */
  tagReads: string[][];
  /** The main tag the tag service answers for a record address; a record not set is left out of the answer. */
  setMainTag(entityUri: string, tag: string | null, known?: boolean): void;
  master: ReturnType<typeof fixtureMaster>;
  setRecord(id: string, doc: Doc | number): void;
  setRelations(id: string, rows: unknown[] | number): void;
  /** Hold the answers of one kind until the returned function is called. */
  hold(kind: "master" | "relations" | "records"): () => void;
}

export function installWire(): Wire {
  const records = new Map<string, Doc | number>();
  const relations = new Map<string, unknown[] | number>();
  const holds = new Map<string, Promise<void>>();
  const mainTags = new Map<string, { tag: string | null; known: boolean }>();
  const wire: Wire = {
    reads: [],
    relationReads: [],
    tagReads: [],
    setMainTag: (uri, tag, known = true) => void mainTags.set(uri, { tag, known }),
    master: fixtureMaster(),
    setRecord: (id, doc) => void records.set(id, doc),
    setRelations: (id, rows) => void relations.set(id, rows),
    hold(kind) {
      let release!: () => void;
      holds.set(kind, new Promise<void>((r) => (release = r)));
      return release;
    },
  };
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.startsWith(RIG)) {
      await holds.get("master");
      return wire.master.fetch(url, init);
    }
    if (url.endsWith("/base/tag/masters")) {
      const asked = (JSON.parse(String(init?.body ?? "{}")) as { targetEntities: string[] }).targetEntities;
      wire.tagReads.push(asked);
      return Response.json({
        masterTags: asked.filter((t) => mainTags.has(t)).map((t) => ({ targetEntity: t, tagString: mainTags.get(t)!.tag, tagKnown: mainTags.get(t)!.known })),
      });
    }
    if (url.includes("/relations")) {
      wire.relationReads.push(url);
      await holds.get("relations");
      const id = decodeURIComponent(url.split("/e/")[1]!.split("/relations")[0]!);
      const got = relations.get(id);
      if (typeof got === "number") return new Response("", { status: got });
      return Response.json({ relations: got ?? [] });
    }
    if (url.includes("/lws/r/")) {
      wire.reads.push(url);
      await holds.get("records");
      const id = decodeURIComponent(url.split("/lws/r/")[1]!.split("?")[0]!);
      const got = records.get(id);
      if (got === undefined || typeof got === "number") return new Response("", { status: typeof got === "number" ? got : 404 });
      return Response.json(got, { headers: { etag: '"e"' } });
    }
    return new Response("{}", { status: 404 });
  });
  return wire;
}

export const authorityRow = (relation: string, member: string, type = "t:AuthorityOf") => ({
  relation,
  role: "role:referenced-by",
  type,
  members: [{ member, role: "role:stakeholder" }],
});
