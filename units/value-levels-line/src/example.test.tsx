// The README example, run: the Levels line in a card that keeps the data in state, with the host of the lines above it.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { ValueLinesHostContext, type ValueLinesHost } from "@kaigilb/gilbplatformcode-value-line-kit";
import { emptyValueCard, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueLevelsBody } from "./index";
import { record, VAULT, render } from "../test/mount";

// The host of the lines: here only the label of a record that is a source. A hook, called on every render; the same object while mounted.
const host: ValueLinesHost = {
  useLinkLabel: (uri) => (uri ? "A record" : null),
  searchTypes: async () => ({ options: [], reach: "", degraded: false }),
  blankReach: "",
};

function LevelsCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <ValueLinesHostContext.Provider value={host}>
      <PlanValueLevelsBody
        data={data}
        editing={false}
        canEdit
        vaultId={VAULT}
        record={record}
        onOpen={() => {}}
        selfId="https://h.example.test/base/e/me"
        onChange={(next) => {
          save(next);
          setData(next);
        }}
      />
    </ValueLinesHostContext.Provider>
  );
}

afterEach(cleanup);

describe("the README example", () => {
  it("an empty Value offers Status, Tolerable and Goal; a number typed into one writes that level, once, with the person as its source", async () => {
    const saved = vi.fn();
    render(<LevelsCard start={emptyValueCard()} save={saved} />, null);
    expect(screen.getAllByRole("button", { name: /^Edit Level \d kind$/ }).map((b) => b.textContent)).toEqual(["Status", "Tolerable", "Goal"]);
    await userEvent.click(screen.getByRole("button", { name: "Edit Level 3 value" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Edit Level 3 value" }), { target: { value: "5-10" } });
    await userEvent.keyboard("{Enter}");
    expect(saved).toHaveBeenCalledTimes(1);
    const levels = saved.mock.calls[0]![0].levels;
    expect(levels).toHaveLength(1);
    expect(levels[0]).toMatchObject({ kind: "Goal", value: 7.5, valueText: "5-10", source: { statedBy: "https://h.example.test/base/e/me" } });
  });
});
