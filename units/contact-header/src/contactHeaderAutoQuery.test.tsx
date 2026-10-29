// `auto` must be NARROW outside the container query and WIDE only inside it. jsdom evaluates no
// container query, so this reads the stylesheet the header ships: the auto rules before `@container` are the narrow grid (two rows,
// chips on row 2), and the wide grid for auto appears only inside `@container gsh (min-width: 56rem)`.
import { afterEach, expect, test } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ContactHeader } from "./index";
afterEach(cleanup);
test("auto is narrow by default and wide only inside the 56rem container query", () => {
  render(
    <ContactHeader layout="auto" linked holder={<span />} holderInfo={{ name: "Ann", caption: "Me", type: "t:Person" }} contactType="t:Person"
      contact={{ displayName: "Ben Berg", unnamed: false, photoUrl: null, origin: "at birth", originLoading: false, placements: [], placementOpen: false }}
      renderPlacementChip={() => null} renderPhoto={() => null} />,
  );
  const css = screen.getByTestId("contact-shell-header").querySelector("style")!.textContent!;
  const at = css.indexOf("@container gsh (min-width: 56rem)");
  expect(at).toBeGreaterThan(0);
  const before = css.slice(0, at), inside = css.slice(at);
  const autoRow = (s: string) => (s.match(/\.gsh\[data-layout="auto"\] \.gsh-row \{[^}]*\}/g) ?? []).join("\n");
  expect(autoRow(before)).toMatch(/"chips chips chips chips"/);
  expect(autoRow(before)).not.toMatch(/"hpic hname conn name cpic"/);
  expect(autoRow(inside)).toMatch(/"hpic hname conn name cpic"/);
});
