// The README example, run: the Scale line in a card that keeps the data in state and saves what onChange gives.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import type { ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanScaleBody } from "./index";
import { card, record, VAULT, render } from "../test/mount";

// The card: holds the data, shows the line, saves whole what the line hands up.
function ScaleCard({ start, save }: { start: ValueCardData; save: (next: ValueCardData) => void }) {
  const [data, setData] = useState(start);
  return (
    <PlanScaleBody
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
  it("a click on the unit edits it in place; Enter saves the whole card once", async () => {
    const saved = vi.fn();
    const start = card({ scale: { text: "", unit: "minutes", rate: "per [Task]", context: "", direction: "lower", source: {} } });
    render(<ScaleCard start={start} save={saved} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    fireEvent.change(screen.getByLabelText("Edit Scale unit"), { target: { value: "seconds" } });
    await userEvent.keyboard("{Enter}");
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].scale.unit).toBe("seconds");
    expect(saved.mock.calls[0]![0].levels).toBe(start.levels);
  });
  it("the Scale line does not ask for the host of the lines: without it, it draws", () => {
    render(<ScaleCard start={card({ scale: { text: "", unit: "minutes", rate: "", context: "", direction: "higher", source: {} } })} save={() => {}} />, null);
    expect(screen.getByRole("button", { name: "Edit Scale unit" })).toBeTruthy();
  });
});
