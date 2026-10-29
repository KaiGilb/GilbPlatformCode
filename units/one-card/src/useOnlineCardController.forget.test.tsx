// A link write (connect or unlink) on a card changes which records a member has, so the Stakeholders list's kept up-front answers are
// forgotten and the next draw asks the find again; what the session knows was deleted stays known. The kept answers are the
// `stakeholder-list-state` unit's (the list's door is not part of this unit), written here directly.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import {
  forgetDeletedLinkedRecord,
  forgetLinkedRecords,
  isDeletedLinkedRecord,
  memberAnswers,
  recordReads,
  screenAnswerUntil,
} from "@kaigilb/gilbplatformcode-stakeholder-list-state";

const refreshRecordInCaches = vi.hoisted(() => vi.fn(async () => undefined));
const patchRecord = vi.hoisted(() => vi.fn(async () => ({ etag: null })));
vi.mock("@kaigilb/gilbplatformcode-record-cache-kit", async (importOriginal) => ({ ...((await importOriginal()) as object), refreshRecordInCaches }));
vi.mock("@kaigilb/gilbplatformcode-lws-records", async (orig) => ({ ...((await orig()) as object), patchRecord }));
import { anchorShareOf } from "@kaigilb/gilbplatformcode-stakeholder-list-doors";
import "../test/origins";
import { useOnlineCardController } from "./useOnlineCardController";

const VAULT = "https://h.example.test/vault";
const HOLDER = "https://h.example.test/vault/i";
const MEMBER = "https://k.example.test/vault";

const client = new QueryClient();
const wrapper = ({ children }: { children: ReactNode }) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
const seed = () => {
  memberAnswers.set(MEMBER, { ids: ["a"], complete: true });
  recordReads.set("a", null);
  screenAnswerUntil.set(MEMBER, 1);
};

beforeEach(() => {
  forgetLinkedRecords();
  patchRecord.mockClear();
  vi.stubGlobal("fetch", async () => new Response("{}", { status: 404 }));
});
afterEach(() => vi.unstubAllGlobals());

describe("a link write forgets the list's kept up-front answers", () => {
  it.each(["confirmLink", "unlink"] as const)("after %s, the next draw asks the member's find again", async (act_) => {
    seed();
    const rec = { id: "r9", entityUri: "https://h.example.test/base/e/r9", served: { facts: {} as Record<string, unknown> } };
    const { result } = renderHook(() => useOnlineCardController({ enabled: true, vaultId: VAULT, holder: HOLDER, canWrite: true, record: rec }), { wrapper });
    expect(memberAnswers.size).toBe(1);
    await act(async () => {
      if (act_ === "confirmLink") await result.current!.confirmLink({ principal: MEMBER } as never);
      else await result.current!.unlink();
    });
    expect(patchRecord).toHaveBeenCalled();
    expect(memberAnswers.size).toBe(0);
    expect(recordReads.size).toBe(0);
    expect(screenAnswerUntil.size).toBe(0);
  });
});

describe("a link write forgets the card's shared resolver answer", () => {
  it.each(["confirmLink", "unlink"] as const)("after %s, the answer the card and its placement chips shared is asked again", async (act_) => {
    const rec = { id: "r9", entityUri: "https://h.example.test/base/e/r9", served: { facts: {} as Record<string, unknown> } };
    const { result } = renderHook(() => useOnlineCardController({ enabled: true, vaultId: VAULT, holder: HOLDER, canWrite: true, record: rec }), { wrapper });
    const share = anchorShareOf(result.current);
    expect(share).not.toBeNull();
    share!.answer = Promise.resolve({ kind: "none" } as never);
    await act(async () => {
      if (act_ === "confirmLink") await result.current!.confirmLink({ principal: MEMBER } as never);
      else await result.current!.unlink();
    });
    expect(share!.answer).toBeNull();
  });
});

describe("a link write keeps what the session knows was deleted", () => {
  it.each(["confirmLink", "unlink"] as const)("after %s, a record deleted before is still known as deleted", async (act_) => {
    forgetDeletedLinkedRecord("gone1");
    const rec = { id: "r9", entityUri: "https://h.example.test/base/e/r9", served: { facts: {} as Record<string, unknown> } };
    const { result } = renderHook(() => useOnlineCardController({ enabled: true, vaultId: VAULT, holder: HOLDER, canWrite: true, record: rec }), { wrapper });
    await act(async () => {
      if (act_ === "confirmLink") await result.current!.confirmLink({ principal: MEMBER } as never);
      else await result.current!.unlink();
    });
    expect(isDeletedLinkedRecord("gone1")).toBe(true);
    // and sign-out (the whole forget) does empty it
    forgetLinkedRecords();
    expect(isDeletedLinkedRecord("gone1")).toBe(false);
  });
});
