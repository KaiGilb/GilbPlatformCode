// The README example, run: the Illustration line in a card that keeps the data in state and saves what onChange gives.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent } from "@testing-library/react";
import { useState } from "react";
import type { ValueCardData } from "@kaigilb/gilbplatformcode-value-card-model";
import { PlanValuePictureBody } from "./index";
import { record, VAULT, render } from "../test/mount";
import { goalSlider, lowered } from "../test/graph";

// The card: holds the data, shows the line, saves whole what the line hands up.
function IllustrationCard({ start, save, moved }: { start: ValueCardData; save: (next: ValueCardData) => void; moved: boolean }) {
  const [data, setData] = useState(start);
  return (
    <PlanValuePictureBody
      data={data}
      editing
      canEdit
      vaultId={VAULT}
      record={record}
      onOpen={() => {}}
      selfId={null}
      // An older stored list of levels makes the graph read-only until the card has moved it into records.
      legacy={moved ? undefined : { levels: 2, qualifiers: 0, meters: 0, busy: false, canMove: true, onMove: () => {} }}
      onChange={(next) => {
        save(next);
        setData(next);
      }}
    />
  );
}

afterEach(cleanup);

describe("the README example", () => {
  it("steps a Goal one step with the arrow key and hands the whole new card to the host, once", () => {
    const saved = vi.fn();
    const start = lowered();
    render(<IllustrationCard start={start} save={saved} moved />, null);
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(saved).toHaveBeenCalledTimes(1);
    expect(saved.mock.calls[0]![0].levels.map((l: { kind: string; value: number }) => [l.kind, l.value])).toEqual([["Status", 9], ["Goal", 4]]);
    expect(saved.mock.calls[0]![0].scale).toBe(start.scale);
  });
  it("while the older list is not moved, the graph is read-only", () => {
    const saved = vi.fn();
    render(<IllustrationCard start={lowered()} save={saved} moved={false} />, null);
    fireEvent.keyDown(goalSlider(), { key: "ArrowRight" });
    expect(saved).not.toHaveBeenCalled();
  });
});
