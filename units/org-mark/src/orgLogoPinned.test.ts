// Pins of the unit: every export, the host member, the key, the cache bound, the pool and what is remembered.
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FileFetchOutcome } from "@kaigilb/gilbplatformcode-file-words";
import * as unit from "./index";
import { FILE_TOO_LARGE } from "./fileTooLarge";
import { ORG_LOGO_MAX_BYTES, ORG_LOGO_POOL, __resetOrgLogos, loadOrgLogoBlob } from "./orgLogo";
import type { OrgMarkHost } from "./orgMarkHost";

const DOOR = "https://v.example.test/base";
const OTHER = "https://w.example.test/base";
const entity = (id: string) => `${DOOR}/e/${id}`;
const ok = (n = 10): FileFetchOutcome => ({ kind: "ok", blob: new Blob(["x".repeat(n)], { type: "image/png" }), url: "u" });
const hostOf = (answer: (id: string, at: string | null, opts: { maxBytes?: number }) => Promise<FileFetchOutcome>) => {
  const downloadFileOutcome = vi.fn(answer);
  return { host: { downloadFileOutcome } satisfies OrgMarkHost, downloadFileOutcome };
};

beforeEach(() => __resetOrgLogos());

describe("exports", () => {
  it("the unit exports exactly these names", () => {
    expect(Object.keys(unit).sort()).toEqual(
      ["FILE_TOO_LARGE", "ORG_LOGO_MAX_BYTES", "ORG_LOGO_POOL", "OrgMark", "OrgMarkHostContext", "__resetOrgLogos", "fileIdFromPhotoRef", "loadOrgLogoBlob", "useOrgMarkHost"].sort(),
    );
  });
  it("the constants", () => {
    expect(ORG_LOGO_MAX_BYTES).toBe(256 * 1024);
    expect(ORG_LOGO_POOL).toBe(4);
    expect(FILE_TOO_LARGE).toBe("too large");
  });
});

describe("the host member", () => {
  it("is asked with the file id, where it lives and the bound", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    const blob = await loadOrgLogoBlob(host, entity("logo0001"), DOOR);
    expect(blob).not.toBeNull();
    expect(downloadFileOutcome).toHaveBeenCalledTimes(1);
    expect(downloadFileOutcome).toHaveBeenCalledWith("logo0001", entity("logo0001"), { maxBytes: ORG_LOGO_MAX_BYTES });
  });
  it("a reference without a scheme is read at the door the mark is drawn in", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    await loadOrgLogoBlob(host, "/files/logo0002", DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledWith("logo0002", DOOR, { maxBytes: ORG_LOGO_MAX_BYTES });
  });
  it("with no door a reference without a scheme is read at null", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    await loadOrgLogoBlob(host, "/files/logo0003", null);
    expect(downloadFileOutcome).toHaveBeenCalledWith("logo0003", null, { maxBytes: ORG_LOGO_MAX_BYTES });
  });
  it("is looked up when the load runs: the host given to this call answers", async () => {
    const a = hostOf(async () => ok());
    const b = hostOf(async () => ok());
    await loadOrgLogoBlob(a.host, entity("fileAAAA"), DOOR);
    await loadOrgLogoBlob(b.host, entity("fileBBBB"), DOOR);
    expect(a.downloadFileOutcome).toHaveBeenCalledTimes(1);
    expect(b.downloadFileOutcome).toHaveBeenCalledTimes(1);
    expect(b.downloadFileOutcome.mock.calls[0]?.[0]).toBe("fileBBBB");
  });
  it("deps.download wins over the host and the host is not asked", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    const download = vi.fn(async () => ok());
    await loadOrgLogoBlob(host, entity("logo0004"), DOOR, { download });
    expect(download).toHaveBeenCalledTimes(1);
    expect(downloadFileOutcome).not.toHaveBeenCalled();
  });
});

describe("what names no file", () => {
  it.each([["an empty reference", ""], ["blanks", "   "], ["the mediated profile-photo route", `${DOOR}/connect/profile-photo`], ["a short bare word", "abc"], ["a bare word with a colon", "a:bcdefghi"]])("%s gives null and asks for nothing", async (_n, ref) => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    expect(await loadOrgLogoBlob(host, ref, DOOR)).toBeNull();
    expect(downloadFileOutcome).not.toHaveBeenCalled();
  });
  it("a malformed percent-encoding throws at once, as the source does (the answer is not a promise)", () => {
    const { host } = hostOf(async () => ok());
    expect(() => loadOrgLogoBlob(host, `${DOOR}/e/%E0%A4%A`, DOOR)).toThrow(URIError);
  });
});

describe("the key", () => {
  it("the same file read through two doors is two downloads", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    await loadOrgLogoBlob(host, "/files/logo0005", DOOR);
    await loadOrgLogoBlob(host, "/files/logo0005", OTHER);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(2);
  });
  it("a reference with its own scheme ignores the door, so two doors share it", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    await loadOrgLogoBlob(host, entity("logo0006"), DOOR);
    await loadOrgLogoBlob(host, entity("logo0006"), OTHER);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(1);
  });
  it("the same promise is handed to every mark while it is held", async () => {
    const { host } = hostOf(async () => ok());
    const first = loadOrgLogoBlob(host, entity("logo0007"), DOOR);
    expect(loadOrgLogoBlob(host, entity("logo0007"), DOOR)).toBe(first);
  });
});

describe("what is remembered", () => {
  it("a successful read is remembered", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    await loadOrgLogoBlob(host, entity("logo0008"), DOOR);
    await loadOrgLogoBlob(host, entity("logo0008"), DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(1);
  });
  it("a body of exactly the bound is accepted; one byte more is refused and remembered as too large", async () => {
    const exact = hostOf(async () => ok(ORG_LOGO_MAX_BYTES));
    expect(await loadOrgLogoBlob(exact.host, entity("exact001"), DOOR)).not.toBeNull();
    const over = hostOf(async () => ok(ORG_LOGO_MAX_BYTES + 1));
    expect(await loadOrgLogoBlob(over.host, entity("over0001"), DOOR)).toBeNull();
    expect(await loadOrgLogoBlob(over.host, entity("over0001"), DOOR)).toBeNull();
    expect(over.downloadFileOutcome).toHaveBeenCalledTimes(1);
  });
  it.each<[string, FileFetchOutcome]>([
    ["gone", { kind: "gone", url: "u" }],
    ["unaddressed", { kind: "unaddressed", url: "u" }],
    ["forbidden", { kind: "forbidden", status: 403, url: "u" }],
    ["failed with another detail", { kind: "failed", status: 500, url: "u", detail: "net" }],
    ["failed with no detail", { kind: "failed", status: null, url: "u", detail: null }],
    ["failed with a detail that only looks like the bound", { kind: "failed", status: 200, url: "u", detail: "Too large" }],
  ])("%s gives null and is asked for again", async (_n, outcome) => {
    const { host, downloadFileOutcome } = hostOf(async () => outcome);
    expect(await loadOrgLogoBlob(host, entity("retry001"), DOOR)).toBeNull();
    expect(await loadOrgLogoBlob(host, entity("retry001"), DOOR)).toBeNull();
    expect(downloadFileOutcome).toHaveBeenCalledTimes(2);
  });
  it("a host that throws or rejects gives null and is asked for again", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => {
      throw new Error("net");
    });
    expect(await loadOrgLogoBlob(host, entity("throws001"), DOOR)).toBeNull();
    expect(await loadOrgLogoBlob(host, entity("throws001"), DOOR)).toBeNull();
    expect(downloadFileOutcome).toHaveBeenCalledTimes(2);
  });
  it("holds at most 200 files: the 201st evicts the oldest", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    for (let i = 0; i < 200; i++) await loadOrgLogoBlob(host, entity(`cache${String(i).padStart(4, "0")}`), DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(200);
    await loadOrgLogoBlob(host, entity("cache0000"), DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(200); // 200 are held, the first is still there
    await loadOrgLogoBlob(host, entity("cache0200"), DOOR); // the 201st
    expect(downloadFileOutcome).toHaveBeenCalledTimes(201);
    // The oldest by insertion (a read does not renew an entry) was evicted: the first file, not the second.
    await loadOrgLogoBlob(host, entity("cache0001"), DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(201);
    await loadOrgLogoBlob(host, entity("cache0000"), DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(202);
  });
  it("__resetOrgLogos forgets what is held", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    await loadOrgLogoBlob(host, entity("reset0001"), DOOR);
    __resetOrgLogos();
    await loadOrgLogoBlob(host, entity("reset0001"), DOOR);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(2);
  });
});

describe("the pool", () => {
  it("starts ORG_LOGO_POOL downloads, holds the rest, and starts the next as one ends, in order", async () => {
    const resolvers: (() => void)[] = [];
    const started: string[] = [];
    const { host } = hostOf(
      (id) =>
        new Promise<FileFetchOutcome>((resolve) => {
          started.push(id);
          resolvers.push(() => resolve(ok()));
        }),
    );
    const all = Array.from({ length: 6 }, (_, i) => loadOrgLogoBlob(host, entity(`pool${String(i).padStart(4, "0")}`), DOOR));
    await vi.waitFor(() => expect(started).toHaveLength(ORG_LOGO_POOL));
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toHaveLength(ORG_LOGO_POOL);
    resolvers[0]!();
    await vi.waitFor(() => expect(started).toHaveLength(ORG_LOGO_POOL + 1));
    expect(started[4]).toBe("pool0004");
    resolvers[1]!();
    await vi.waitFor(() => expect(started).toHaveLength(ORG_LOGO_POOL + 2));
    expect(started[5]).toBe("pool0005");
    resolvers.slice(2).forEach((r) => r());
    await Promise.all(all);
  });
  it("a place is given back when a download ends: ten loads one after the other all finish", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ok());
    for (let i = 0; i < 10; i++) expect(await loadOrgLogoBlob(host, entity(`seq${String(i).padStart(5, "0")}`), DOOR)).not.toBeNull();
    expect(downloadFileOutcome).toHaveBeenCalledTimes(10);
  });
  it("a download that fails frees its place", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => {
      throw new Error("net");
    });
    const all = await Promise.all(Array.from({ length: 12 }, (_, i) => loadOrgLogoBlob(host, entity(`fail${String(i).padStart(4, "0")}`), DOOR)));
    expect(all.every((b) => b === null)).toBe(true);
    expect(downloadFileOutcome).toHaveBeenCalledTimes(12);
  });
});
