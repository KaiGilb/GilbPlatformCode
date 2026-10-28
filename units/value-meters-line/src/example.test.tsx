// The README example, run: the Meters line in a card that keeps the data in state and saves what onChange gives.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { emptyValueCard, type ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValueMetersBody } from "./index";
import { record, VAULT, render } from "../test/mount";

// The card: holds the data, shows the line, saves whole what the line hands up.
function MetersCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <PlanValueMetersBody
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
  );
}

afterEach(cleanup);

describe("the README example", () => {
  it("'+ Meter' writes nothing until the Meter has a qualifier or a method; then the whole card goes up once", async () => {
    const saved = vi.fn();
    render(<MetersCard start={emptyValueCard()} save={saved} />, null);
    await userEvent.click(screen.getByRole("button", { name: "+ Meter" }));
    expect(saved).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole("button", { name: "Edit Meter 1 qualifier" }));
    fireEvent.change(screen.getByLabelText("Edit Meter 1 qualifier"), { target: { value: "During Development" } });
    await userEvent.keyboard("{Enter}");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].meters).toEqual([{ qualifier: "During Development", lines: [] }]);
  });
  it("the Meters line does not ask for the host of the lines: without it, it draws", () => {
    render(<MetersCard start={emptyValueCard()} save={() => {}} />, null);
    expect(screen.getByRole("button", { name: "+ Meter" })).toBeTruthy();
  });
});
