// @vitest-environment jsdom
// New tests for the merged file sets of several vaults.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";

const sets = vi.hoisted(() => ({ listVaultFiles: vi.fn() }));
vi.mock("@kaigilb/gilbplatformcode-lws-vault-sets", async (orig) => ({ ...(await orig<Record<string, unknown>>()), listVaultFiles: sets.listVaultFiles }));

import { useVaultFilesMulti, vaultFilesKey, VAULT_FILES_KEY_ROOT } from "./fileHooks";
import { setUp, tearDown } from "../test/support";

const ref = (id: string, updatedAt: number, extra: Record<string, unknown> = {}) => ({ id, entityUri: `https://h.platform.example.test/base/e/${id}`, storedWith: null, name: id, mediaType: "text/plain", typeUri: "t:File", byteSize: 3, updatedAt, ended: false, ...extra });
const wrapperFor = (qc: QueryClient) => ({ children }: { children: ReactNode }) => <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
const client = () => new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  setUp();
  sets.listVaultFiles.mockReset();
});
afterEach(() => tearDown());

describe("the file-set key", () => {
  it("is the shared root, the vault and the lifecycle", () => {
    expect(VAULT_FILES_KEY_ROOT).toEqual(["base", "files", "pod"]);
    expect(vaultFilesKey("v1", "ended")).toEqual(["base", "files", "pod", "v1", "ended"]);
  });
});

describe("useVaultFilesMulti", () => {
  it("merges the vaults' files, newest first across vaults, each row tagged with the vault it was listed from", async () => {
    sets.listVaultFiles.mockImplementation(async (v: string) => (v === "a" ? [ref("a1", 10), ref("a2", 30)] : [ref("b1", 20)]));
    const { result } = renderHook(() => useVaultFilesMulti(["a", "b"]), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(result.current.data.map((f) => [f.id, f.sourceVaultId])).toEqual([["a2", "a"], ["b1", "b"], ["a1", "a"]]);
    expect(result.current.error).toBeNull();
  });
  it("fills the defaults a vault leaves out: a name, a media type, a size, a type", async () => {
    sets.listVaultFiles.mockResolvedValue([ref("x", 1, { name: null, mediaType: null, byteSize: null, typeUri: null })]);
    const { result } = renderHook(() => useVaultFilesMulti(["a"]), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(result.current.data).toHaveLength(1));
    expect(result.current.data[0]).toMatchObject({ name: "Untitled file", mediaType: "application/octet-stream", byteSize: 0, typeUri: "t:File" });
  });
  it("asks for the lifecycle it was given, and for the live files by default", async () => {
    sets.listVaultFiles.mockResolvedValue([]);
    const live = renderHook(() => useVaultFilesMulti(["a"]), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(live.result.current.isPending).toBe(false));
    expect(sets.listVaultFiles).toHaveBeenLastCalledWith("a", "live");
    const ended = renderHook(() => useVaultFilesMulti(["b"], "ended"), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(ended.result.current.isPending).toBe(false));
    expect(sets.listVaultFiles).toHaveBeenLastCalledWith("b", "ended");
  });
  it("no vaults is not pending and has no files", () => {
    const { result } = renderHook(() => useVaultFilesMulti([]), { wrapper: wrapperFor(client()) });
    expect(result.current).toEqual({ data: [], isPending: false, error: null });
  });
  it("a vault that cannot be read is an error, and the other vault's files are still listed", async () => {
    sets.listVaultFiles.mockImplementation(async (v: string) => {
      if (v === "bad") throw new Error("no access");
      return [ref("ok", 5)];
    });
    const { result } = renderHook(() => useVaultFilesMulti(["ok", "bad"]), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error?.message).toBe("no access");
    expect(result.current.data.map((f) => f.id)).toEqual(["ok"]);
  });
  it("a thrown value that is not an Error becomes one", async () => {
    sets.listVaultFiles.mockRejectedValue("plain text");
    const { result } = renderHook(() => useVaultFilesMulti(["a"]), { wrapper: wrapperFor(client()) });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    expect(result.current.error).toBeInstanceOf(Error);
    expect(result.current.error?.message).toBe("plain text");
  });
});
