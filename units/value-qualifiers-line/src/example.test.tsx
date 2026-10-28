// The README example, run: the Qualifiers line in a card that keeps the data in state, saves what onChange gives and does the rename itself.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { blankVariable, emptyValueCard, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanVariablesBody } from "./index";
import { record, VAULT, render } from "../test/mount";

// The card: holds the data, shows the line, saves whole what the line hands up, and renames a qualifier on its records itself.
function QualifiersCard({ start, save, rename }: { start: ValueCardData; save: (next: ValueCardData) => void; rename: (from: string, to: string) => void }) {
  const [data, setData] = useState(start);
  return (
    <PlanVariablesBody
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
      onRenameQualifier={rename}
    />
  );
}

afterEach(cleanup);

describe("the README example", () => {
  it("the rename is the card's own; adding a preset puts ' for [Name]' on the Scale's context and hands up the whole card", async () => {
    const saved = vi.fn();
    const rename = vi.fn();
    const start: ValueCardData = { ...emptyValueCard(), scale: { ...emptyValueCard().scale, rate: "per [Customer]" }, variables: [{ ...blankVariable("Client"), options: [{ name: "a", definition: "" }] }] };
    render(<QualifiersCard start={start} save={saved} rename={rename} />);
    // The rename is the card's: the line only says from and to, and sends nothing itself.
    await userEvent.click(screen.getByTestId("plan-variable-rename-helper"));
    expect(rename).toHaveBeenCalledWith("Client", "Customer");
    expect(saved).not.toHaveBeenCalled();
    // Adding a preset puts " for [Country]" on the Scale's context and hands up the whole card.
    await userEvent.click(screen.getByRole("button", { name: "+ Qualifier" }));
    await userEvent.click(screen.getByRole("button", { name: "Add qualifier Country" }));
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].scale.context).toBe("for [Country]");
    expect(saved.mock.calls[0]![0].variables).toBe(start.variables);
    // Two Scale names now have no record, so the rename is no longer offered: it needs exactly one of each.
    expect(screen.queryByTestId("plan-variable-rename-helper")).toBeNull();
  });
});
