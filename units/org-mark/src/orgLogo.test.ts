// Unit logos are bounded in size, fetched ONCE per file (shared by every mark that names it) and through a small pool,
// never one fetch per mark with no limit. Ported from the app; the host is the one the unit asks for its download.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FILE_TOO_LARGE } from "./fileTooLarge";
import { ORG_LOGO_MAX_BYTES, ORG_LOGO_POOL, __resetOrgLogos, loadOrgLogoBlob } from "./orgLogo";
import type { OrgMarkHost } from "./orgMarkHost";

const HOST = "https://v.example.test/base";
// Every download in these tests is handed in as `deps.download`, as in the app; the host is never asked.
const host: OrgMarkHost = { downloadFileOutcome: () => Promise.reject(new Error("the host is not asked when deps.download is given")) };
const f = (id: string) => `${HOST}/e/${id}`;
const ok = (n = 10) => ({ kind: "ok" as const, blob: new Blob(["x".repeat(n)], { type: "image/png" }), url: "u" });

beforeEach(() => __resetOrgLogos());

describe("loadOrgLogoBlob", () => {
  it("50 marks naming the same file make ONE download", async () => {
    const download = vi.fn(async () => ok());
    const blobs = await Promise.all(Array.from({ length: 50 }, () => loadOrgLogoBlob(host, f("logo1"), HOST, { download })));
    expect(download).toHaveBeenCalledTimes(1);
    expect(blobs.every((b) => b !== null)).toBe(true);
  });
  it("asks for a BOUNDED read (the lean-copy size, not the master's)", async () => {
    const download = vi.fn(async () => ok());
    await loadOrgLogoBlob(host, f("logo1"), HOST, { download });
    expect(download).toHaveBeenCalledWith("logo1", f("logo1"), { maxBytes: ORG_LOGO_MAX_BYTES });
    expect(ORG_LOGO_MAX_BYTES).toBeLessThanOrEqual(512 * 1024);
  });
  it("a file over the bound gives no logo (the mark shows the initial), and is not asked for again", async () => {
    const download = vi.fn(async () => ({ kind: "failed" as const, status: 200, url: "u", detail: FILE_TOO_LARGE }));
    expect(await loadOrgLogoBlob(host, f("big"), HOST, { download })).toBeNull();
    expect(await loadOrgLogoBlob(host, f("big"), HOST, { download })).toBeNull();
    expect(download).toHaveBeenCalledTimes(1);
  });
  it("a body that came back over the bound is refused as well", async () => {
    const download = vi.fn(async () => ok(ORG_LOGO_MAX_BYTES + 1));
    expect(await loadOrgLogoBlob(host, f("big2"), HOST, { download })).toBeNull();
  });
  it("a failed read is not remembered: the next mark tries again", async () => {
    const download = vi.fn().mockResolvedValueOnce({ kind: "failed", status: null, url: "u", detail: "net" }).mockResolvedValueOnce(ok());
    expect(await loadOrgLogoBlob(host, f("l"), HOST, { download })).toBeNull();
    expect(await loadOrgLogoBlob(host, f("l"), HOST, { download })).not.toBeNull();
  });
  it("never more than ORG_LOGO_POOL downloads in flight, for many different files", async () => {
    let now = 0;
    let max = 0;
    const download = vi.fn(async () => {
      now++;
      max = Math.max(max, now);
      await new Promise((r) => setTimeout(r, 5));
      now--;
      return ok();
    });
    await Promise.all(Array.from({ length: 30 }, (_, i) => loadOrgLogoBlob(host, f(`l${i}`), HOST, { download })));
    expect(download).toHaveBeenCalledTimes(30);
    expect(max).toBeLessThanOrEqual(ORG_LOGO_POOL);
    expect(max).toBeGreaterThan(1);
  });
  it("a reference that names no file gives null and asks for nothing", async () => {
    const download = vi.fn();
    expect(await loadOrgLogoBlob(host, "", HOST, { download })).toBeNull();
    expect(download).not.toHaveBeenCalled();
  });
});
