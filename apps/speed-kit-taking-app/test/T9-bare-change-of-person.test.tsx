import { act, screen } from "@testing-library/react";
import { describe, expect, test } from "vitest";
import { ANN, BEN, boot, click, sleep, watchForText } from "./helpers";

describe("T9 bare change of person", () => {
  test("T9 bare change of person: hub.setPrincipal(Ben) without signOut leaves nothing of Ann, and a way out", async () => {
    const k = await boot();
    k.show();
    click("signin-ann");
    await screen.findByTestId("entry-e1");
    const watch = watchForText("Ann entry");

    act(() => { k.hub.setPrincipal(BEN); });
    await sleep(30);
    watch.stop();

    expect(k.session.client).toBeNull(); // the app's own holder was cleared by its hub registration
    expect(k.cache.sessionCache.peek(`${ANN}|${ANN}|entries`).data).toBeUndefined();
    expect(document.body.textContent).not.toContain("Ann entry");
    expect(watch.seen.slice(1)).toEqual([]); // nothing new of Ann after the change (the first look is the page before it)
    expect(screen.queryByText(/Signed in as Ann/)).toBeNull(); // the page does not still claim Ann
    expect(screen.getByTestId("signin-ann")).toBeTruthy(); // and a person can sign in again
  });
});
