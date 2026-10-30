import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ANN, boot, click, sleep, type Booted } from "./helpers";

async function onEntryOne(): Promise<Booted> {
  const k = await boot();
  k.show();
  click("signin-ann");
  await screen.findByTestId("entry-e1");
  click("nav-entry-e1");
  return k;
}
const typeName = (v: string) => fireEvent.change(screen.getByTestId("rename-input"), { target: { value: v } });

describe("T6 rename", () => {
  test("T6 rename: success shows Renamed. and the list shows the new name", async () => {
    const k = await onEntryOne();
    typeName("Ann's first");
    click("rename-button");
    await screen.findByText("Renamed.", { exact: false });
    expect(screen.getByTestId("toast").textContent).toContain("Renamed.");
    expect(k.platform.nameOf(ANN, "e1")).toBe("Ann's first");
    expect(k.proof.requests.patch).toBe(1);
    await waitFor(() => expect(screen.getByTestId("entry-name").textContent).toBe("Ann's first"));
    click("nav-entries");
    expect(within(screen.getByTestId("entry-e1")).getByRole("button").textContent).toBe("Ann's first");
  });

  test("T6 rename: a failed write leaves a notice with the cause until it is dismissed", async () => {
    const k = await onEntryOne();
    k.platform.patchFailure = { status: 500, message: "the disk is full" };
    typeName("Never saved");
    click("rename-button");
    const notice = await screen.findByTestId("notice");
    expect(notice.textContent).toContain("Not renamed: the platform answered 500: the disk is full");
    expect(k.platform.nameOf(ANN, "e1")).toBe("Ann entry 1");
    await sleep(50);
    click("nav-entries"); // it stays across pages
    expect(screen.getByTestId("notice").textContent).toContain("the disk is full");
    click("notice-dismiss");
    expect(screen.queryByTestId("notice")).toBeNull();
    expect(screen.queryByTestId("toast")).toBeNull();
  });

  test("T6 rename: a name changed elsewhere after the edit began cancels the job, and nothing is written", async () => {
    const k = await onEntryOne();
    typeName("Mine"); // the edit begins, on "Ann entry 1"
    k.platform.renameBehindBack(ANN, "e1", "Changed elsewhere");
    click("rename-button");
    const notice = await screen.findByTestId("notice");
    expect(notice.textContent).toContain("Not renamed: the name changed since you started editing. Look again.");
    expect(k.proof.requests.patch).toBe(0); // no PATCH was sent
    expect(k.platform.nameOf(ANN, "e1")).toBe("Changed elsewhere");
    await waitFor(() => expect(screen.getByTestId("entry-name").textContent).toBe("Changed elsewhere")); // the fresh read is shown
    expect(screen.queryByTestId("toast")).toBeNull();
  });
});
