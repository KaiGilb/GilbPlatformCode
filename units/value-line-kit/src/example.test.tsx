// The README example, run: a line of your own built on the kit's pieces, inside the host.
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TextPiece, ValueLinesHostContext, inPlace, own, type ValueLineProps, type ValueLinesHost } from "./index";
import { render, record, VAULT, card } from "../test/mount";

// A line of your own: the unit of the Scale as text, a click turns it into an input in place.
function UnitLine(p: ValueLineProps) {
  const { data } = p;
  return (
    <TextPiece
      on={inPlace(p)}
      label="Scale unit"
      value={data.scale.unit}
      empty="Add unit"
      onCommit={(unit) => p.onChange({ ...data, scale: { ...data.scale, unit, source: own(data.scale.source, p.selfId) } })}
    />
  );
}

// The host: where the lines get what the app gives them.
const host: ValueLinesHost = {
  useLinkLabel: (uri) => (uri ? "A record" : null),
  searchTypes: async () => ({ options: [], reach: "Searched the example ontology.", degraded: false }),
  blankReach: "Type to search the example ontology.",
};

function Card({ onChange }: { onChange: (next: ValueLineProps["data"]) => void }) {
  const [data, setData] = useState(card());
  return (
    <ValueLinesHostContext.Provider value={host}>
      <UnitLine
        data={data}
        editing={false}
        canEdit
        vaultId={VAULT}
        record={record}
        onOpen={() => {}}
        selfId="https://h.example.test/base/e/me"
        onChange={(next) => {
          onChange(next);
          setData(next);
        }}
      />
    </ValueLinesHostContext.Provider>
  );
}

afterEach(cleanup);

describe("the README example", () => {
  it("a click turns the unit into an input, Enter hands the whole new card up once, stamped with the signed-in person", async () => {
    const saved = vi.fn();
    render(<Card onChange={saved} />);
    await userEvent.click(screen.getByRole("button", { name: "Edit Scale unit" }));
    await userEvent.type(screen.getByLabelText("Edit Scale unit"), "minutes{Enter}");
    expect(saved).toHaveBeenCalledTimes(1);
    const next = saved.mock.calls[0]![0];
    expect(next.scale.unit).toBe("minutes");
    expect(next.scale.source).toEqual({ statedBy: "https://h.example.test/base/e/me" });
    expect(next.levels).toEqual([]);
    expect(screen.getByRole("button", { name: "Edit Scale unit" }).textContent).toBe("minutes");
  });
});
