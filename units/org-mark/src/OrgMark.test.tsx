// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { FileFetchOutcome } from "@kaigilb/gilbplatformcode-file-words";
import { OrgMark } from "./OrgMark";
import { ORG_LOGO_MAX_BYTES, __resetOrgLogos } from "./orgLogo";
import { OrgMarkHostContext, type OrgMarkHost } from "./orgMarkHost";

const DOOR = "https://v.example.test/base";
const entity = (id: string) => `${DOOR}/e/${id}`;
const ok = (): FileFetchOutcome => ({ kind: "ok", blob: new Blob(["png"], { type: "image/png" }), url: "u" });

let created: Blob[] = [];
let revoked: string[] = [];
beforeEach(() => {
  __resetOrgLogos();
  created = [];
  revoked = [];
  URL.createObjectURL = (b: Blob | MediaSource) => {
    created.push(b as Blob);
    return `blob:example.test/${created.length}`;
  };
  URL.revokeObjectURL = (u: string) => {
    revoked.push(u);
  };
});
afterEach(cleanup);

const withHost = (host: OrgMarkHost, ui: ReactNode) => <OrgMarkHostContext.Provider value={host}>{ui}</OrgMarkHostContext.Provider>;
const hostOf = (answer: (id: string, at: string | null, opts: { maxBytes?: number }) => Promise<FileFetchOutcome> = async () => ok()) => {
  const downloadFileOutcome = vi.fn(answer);
  return { host: { downloadFileOutcome } satisfies OrgMarkHost, downloadFileOutcome };
};

describe("OrgMark", () => {
  it("without a host provider it throws an error that names the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<OrgMark logo={null} vaultId={null} name="Acme" />)).toThrow(/OrgMarkHostContext\.Provider/);
    spy.mockRestore();
  });

  it("draws the initial and asks for nothing when the record has no logo", () => {
    const { host, downloadFileOutcome } = hostOf();
    render(withHost(host, <OrgMark logo={null} vaultId={DOOR} name="  acme" />));
    const mark = screen.getByTestId("org-mark");
    expect(mark.textContent).toBe("A");
    expect(mark.getAttribute("data-has-logo")).toBe("false");
    expect(mark.getAttribute("aria-hidden")).toBe("true");
    expect(downloadFileOutcome).not.toHaveBeenCalled();
  });

  it("a name with no letters shows a question mark", () => {
    const { host } = hostOf();
    render(withHost(host, <OrgMark logo={null} vaultId={DOOR} name="   " />));
    expect(screen.getByTestId("org-mark").textContent).toBe("?");
  });

  it("asks for nothing when the vault is not known", () => {
    const { host, downloadFileOutcome } = hostOf();
    render(withHost(host, <OrgMark logo={entity("logo0001")} vaultId={null} name="Acme" />));
    expect(downloadFileOutcome).not.toHaveBeenCalled();
    expect(screen.getByTestId("org-mark").textContent).toBe("A");
  });

  it("draws the logo once the bounded read has come back", async () => {
    const { host, downloadFileOutcome } = hostOf();
    const { container } = render(withHost(host, <OrgMark logo={entity("logo0002")} vaultId={DOOR} name="Acme" size={40} />));
    await waitFor(() => expect(screen.getByTestId("org-mark").getAttribute("data-has-logo")).toBe("true"));
    const img = container.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("blob:example.test/1");
    expect(img.getAttribute("alt")).toBe("");
    expect(created).toHaveLength(1);
    expect(downloadFileOutcome).toHaveBeenCalledWith("logo0002", entity("logo0002"), { maxBytes: ORG_LOGO_MAX_BYTES });
    const mark = screen.getByTestId("org-mark") as HTMLElement;
    expect(mark.style.width).toBe("40px");
    expect(mark.style.height).toBe("40px");
  });

  it("the size is 32 when none is given", () => {
    const { host } = hostOf();
    render(withHost(host, <OrgMark logo={null} vaultId={DOOR} name="Acme" />));
    const mark = screen.getByTestId("org-mark") as HTMLElement;
    expect(mark.style.width).toBe("32px");
    expect(mark.style.height).toBe("32px");
  });

  it("a logo over the bound keeps the initial", async () => {
    const { host, downloadFileOutcome } = hostOf(async () => ({ kind: "failed", status: 200, url: "u", detail: "too large" }));
    render(withHost(host, <OrgMark logo={entity("logo0003")} vaultId={DOOR} name="Acme" />));
    await waitFor(() => expect(downloadFileOutcome).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(screen.getByTestId("org-mark").getAttribute("data-has-logo")).toBe("false");
    expect(created).toHaveLength(0);
  });

  it("revokes the address it made when it goes away", async () => {
    const { host } = hostOf();
    const { unmount } = render(withHost(host, <OrgMark logo={entity("logo0004")} vaultId={DOOR} name="Acme" />));
    await waitFor(() => expect(created).toHaveLength(1));
    unmount();
    expect(revoked).toEqual(["blob:example.test/1"]);
  });

  it("an answer that comes after the mark went away makes no address", async () => {
    let release: (o: FileFetchOutcome) => void = () => {};
    const { host, downloadFileOutcome } = hostOf(() => new Promise<FileFetchOutcome>((resolve) => (release = resolve)));
    const { unmount } = render(withHost(host, <OrgMark logo={entity("logo0005")} vaultId={DOOR} name="Acme" />));
    await waitFor(() => expect(downloadFileOutcome).toHaveBeenCalled());
    unmount();
    release(ok());
    await new Promise((r) => setTimeout(r, 10));
    expect(created).toHaveLength(0);
  });

  it("a new logo goes back to the initial and reads the new file; the old address is revoked", async () => {
    const { host, downloadFileOutcome } = hostOf();
    const { rerender } = render(withHost(host, <OrgMark logo={entity("logo0006")} vaultId={DOOR} name="Acme" />));
    await waitFor(() => expect(created).toHaveLength(1));
    rerender(withHost(host, <OrgMark logo={entity("logo0007")} vaultId={DOOR} name="Acme" />));
    expect(revoked).toContain("blob:example.test/1");
    await waitFor(() => expect(created).toHaveLength(2));
    expect(downloadFileOutcome).toHaveBeenCalledTimes(2);
  });

  it("a new name alone reads nothing again", async () => {
    const { host, downloadFileOutcome } = hostOf();
    const { rerender } = render(withHost(host, <OrgMark logo={entity("logo0008")} vaultId={DOOR} name="Acme" />));
    await waitFor(() => expect(created).toHaveLength(1));
    rerender(withHost(host, <OrgMark logo={entity("logo0008")} vaultId={DOOR} name="Beta" />));
    expect(downloadFileOutcome).toHaveBeenCalledTimes(1);
    expect(revoked).toEqual([]);
  });

  it("two marks of one file make one download", async () => {
    const { host, downloadFileOutcome } = hostOf();
    render(
      withHost(
        host,
        <>
          <OrgMark logo={entity("logo0009")} vaultId={DOOR} name="Acme" />
          <OrgMark logo={entity("logo0009")} vaultId={DOOR} name="Acme" />
        </>,
      ),
    );
    await waitFor(() => expect(created).toHaveLength(2));
    expect(downloadFileOutcome).toHaveBeenCalledTimes(1);
  });
});
