// Ported from GilbApp `vaultSets.test.ts` (the `listVaultFilesPage` block, 5 of its 18 tests). The other 13 test `listVaultRecords`,
// `isNonGraphNodeEntity` and `normalizeTypeUri` (not taken, or another unit's), so they are left out.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { listVaultFiles, listVaultFilesPage, OPEN_PAGE_SIZE } from "./vaultSets";
import { setUp, tearDown } from "../test/support";

function resp(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers(),
    json: async () => body,
    text: async () => JSON.stringify(body),
  } as unknown as Response;
}

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  setUp();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  tearDown();
});

// ── Open path is a PAGE (36k is nothing; concatenating the vault is the defect)
describe("listVaultFilesPage — first page only, SpeedGate N=20", () => {
  const VAULT = "https://ontology.platform.example.test/base";
  const filePage = (from: number, n: number, count = 1460) => ({
    count,
    files: Array.from({ length: n }, (_, i) => ({
      entity: `https://ontology.platform.example.test/base/e/f${from + i}`,
      fileName: `type-picture-${from + i}.png`,
      mediaType: "image/png",
      typeUri: "t:TypePicture",
      byteSize: 100,
      storedWith: null,
      ended: false,
      updatedAt: "2026-09-05T00:00:00.000Z",
    })),
  });

  it("🔴 ACCEPTANCE — a vault holding 1460 files yields ONE page of 20, not 1460", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      return resp(200, filePage(offset, Math.min(OPEN_PAGE_SIZE, 1460 - offset)));
    });

    const page = await listVaultFilesPage(VAULT, 0);

    expect(page.files).toHaveLength(OPEN_PAGE_SIZE);
    expect(page.total).toBe(1460);
    expect(page.complete).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const asked = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(asked.searchParams.get("limit")).toBe(String(OPEN_PAGE_SIZE));
  });

  it("open path listVaultFiles is the first page, ⛔ not the concatenating loop", async () => {
    fetchMock.mockResolvedValue(resp(200, filePage(0, OPEN_PAGE_SIZE, 1460)));
    const files = await listVaultFiles(VAULT);
    expect(files).toHaveLength(OPEN_PAGE_SIZE);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("?unattached=true is sent for the standalone register", async () => {
    fetchMock.mockResolvedValue(resp(200, { count: 0, files: [] }));
    await listVaultFilesPage(VAULT, 0, { storedWith: null });
    const asked = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(asked.searchParams.get("unattached")).toBe("true");
    expect(asked.searchParams.get("storedWith")).toBeNull();
  });

  it("?storedWith= is sent for one record's attachments", async () => {
    fetchMock.mockResolvedValue(resp(200, { count: 0, files: [] }));
    const rec = "https://books.platform.example.test/base/e/book1";
    await listVaultFilesPage(VAULT, 0, { storedWith: rec });
    const asked = new URL(fetchMock.mock.calls[0]![0] as string);
    expect(asked.searchParams.get("storedWith")).toBe(rec);
  });

  it("offset walks the next page; complete when the server's count is reached", async () => {
    fetchMock.mockImplementation(async (url: string) => {
      const offset = Number(new URL(url).searchParams.get("offset") ?? "0");
      return resp(200, filePage(offset, Math.min(OPEN_PAGE_SIZE, 25 - offset), 25));
    });
    const p0 = await listVaultFilesPage(VAULT, 0);
    expect(p0.files).toHaveLength(20);
    expect(p0.complete).toBe(false);
    const p1 = await listVaultFilesPage(VAULT, 20);
    expect(p1.files).toHaveLength(5);
    expect(p1.complete).toBe(true);
  });
});
