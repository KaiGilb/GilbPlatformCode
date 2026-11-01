import { screen, waitFor } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { boot, click, dumpDevice, reload, watchForText, type Booted } from "./helpers";

async function annLoadedAndSaved(): Promise<Booted> {
  const k = await boot();
  k.show();
  click("signin-ann");
  await screen.findByTestId("entry-e1");
  await k.speed.currentPersist()!.flush();
  expect(await dumpDevice()).toContain("ann.example.test"); // the copy of Ann is on the device (so the checks below mean something)
  return k;
}
const noAnnOnDevice = () => waitFor(async () => expect(await dumpDevice()).not.toContain("ann.example.test"));

describe("T3 two people", () => {
  test("T3 two people: Ann signs out, Ben signs in; nothing of Ann is shown or kept", async () => {
    const k = await annLoadedAndSaved();
    click("signout");
    await screen.findByTestId("signin-ben");
    await noAnnOnDevice(); // the copy on the device went with the sign-out
    const watch = watchForText("Ann entry");
    expect(document.body.textContent).not.toContain("Ann entry");
    click("signin-ben");
    await screen.findByText("Ben entry 1");
    await k.speed.currentPersist()!.flush();
    watch.stop();
    expect(watch.seen).toEqual([]); // at no render did "Ann entry" appear
    expect(screen.getAllByTestId(/^entry-e\d+$/)).toHaveLength(5);
    expect(await dumpDevice()).not.toContain("ann.example.test");
    expect(await dumpDevice()).toContain("ben.example.test");
  });

  test("T3 two people: the same across a reload between Ann's sign-out and Ben's sign-in", async () => {
    await annLoadedAndSaved();
    click("signout");
    await screen.findByTestId("signin-ben");
    await noAnnOnDevice();
    const k = await reload();
    k.show();
    const watch = watchForText("Ann entry");
    click("signin-ben");
    await screen.findByText("Ben entry 1");
    watch.stop();
    expect(watch.seen).toEqual([]);
    expect(await dumpDevice()).not.toContain("ann.example.test");
  });

  test("T3 two people: Ann's tab closes without a sign-out; Ben signs in after the reload and finds nothing of Ann", async () => {
    await annLoadedAndSaved();
    const k = await reload(); // no sign-out happened: Ann's copy is still on the device
    expect(await dumpDevice()).toContain("ann.example.test");
    k.show();
    const watch = watchForText("Ann entry");
    click("signin-ben");
    await screen.findByText("Ben entry 1");
    watch.stop();
    expect(watch.seen).toEqual([]);
    await noAnnOnDevice();
  });
});
