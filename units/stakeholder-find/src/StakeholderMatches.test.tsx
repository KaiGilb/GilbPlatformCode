// The match list's own sentences, gates and pick.
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { Candidate } from "@kaigilb/gilbplatformcode-pick-or-create";
import { StakeholderMatches } from "./StakeholderMatches";

const ada: Candidate = {
  record: "https://ann.platform.example.test/base/e/ada",
  vaultId: "https://ann.platform.example.test/base",
  type: "t:Person",
  label: "Ada",
};

function renderMatches(over: {
  candidates?: Candidate[];
  complete?: boolean;
  error?: Error | null;
  linking?: boolean;
  busy?: boolean;
  onPick?: (c: Candidate) => void;
}) {
  return render(
    <StakeholderMatches
      found={{
        data: over.candidates
          ? { candidates: over.candidates, complete: over.complete ?? true, pages: 1 }
          : undefined,
        error: over.error ?? null,
      }}
      linking={over.linking ?? false}
      busy={over.busy ?? false}
      onPick={over.onPick ?? vi.fn()}
    />,
  );
}

describe("StakeholderMatches", () => {
  it("with candidates, says open-instead; while linking, says link-instead", () => {
    const open = renderMatches({ candidates: [ada] });
    expect(screen.getByText(/open this one instead/)).toBeInTheDocument();
    expect(screen.queryByText(/link this one instead/)).toBeNull();
    open.unmount();

    renderMatches({ candidates: [ada], linking: true });
    expect(screen.getByText(/link this one instead/)).toBeInTheDocument();
  });

  it("says there may be more only when the find is not complete", () => {
    const done = renderMatches({ candidates: [ada], complete: true });
    expect(screen.queryByText(/there may be more/)).toBeNull();
    done.unmount();

    renderMatches({ candidates: [ada], complete: false });
    expect(screen.getByText(/there may be more/)).toBeInTheDocument();
  });

  it("says matches are not known when the find errors", () => {
    renderMatches({ error: new Error("the vault did not answer") });
    expect(screen.getByText("Matches not known: the vault did not answer")).toBeInTheDocument();
  });

  it("a bound timeout is a sentence, not a URL or a class name", () => {
    renderMatches({
      error: new Error(
        "GET https://ann.platform.example.test/base/records?type=Person&type=Organization could not be reached: BoundTimeoutError: creating the DPoP proof timed out",
      ),
    });
    const row = screen.getByTestId("connected-create-matches");
    expect(row.textContent).toBe(
      "Could not look up matches: signing the request did not answer within 10 s.",
    );
    expect(row.textContent).not.toMatch(/https?:|BoundTimeoutError|nothing was created|DPoP/);
  });

  it("disables the buttons while busy, and a click hands that candidate to onPick", async () => {
    const busy = renderMatches({ candidates: [ada], busy: true });
    expect(screen.getByTestId("connected-create-match-ada")).toBeDisabled();
    busy.unmount();

    const onPick = vi.fn();
    renderMatches({ candidates: [ada], onPick });
    await userEvent.click(screen.getByTestId("connected-create-match-ada"));
    expect(onPick).toHaveBeenCalledTimes(1);
    expect(onPick).toHaveBeenCalledWith(ada);
  });

  it("two same-name rows from one vault show different id tails", () => {
    const one: Candidate = {
      record: "https://ann.platform.example.test/base/e/06aaaaaaaaaaaaaaaaaaaa1111",
      vaultId: "https://ann.platform.example.test/base",
      type: "t:Person",
      label: "Jason Test",
    };
    const two: Candidate = {
      record: "https://ann.platform.example.test/base/e/06aaaaaaaaaaaaaaaaaaaa2222",
      vaultId: "https://ann.platform.example.test/base",
      type: "t:Person",
      label: "Jason Test",
    };
    renderMatches({ candidates: [one, two] });
    const first = screen.getByTestId("connected-create-match-06aaaaaaaaaaaaaaaaaaaa1111").textContent;
    const second = screen.getByTestId("connected-create-match-06aaaaaaaaaaaaaaaaaaaa2222").textContent;
    expect(first).toBe("Jason Test…aa1111");
    expect(second).toBe("Jason Test…aa2222");
    expect(first).not.toBe(second);
    expect(screen.getByTestId("connected-create-matches").textContent).not.toContain("·");
  });

  it("rows with different labels show no tail", () => {
    renderMatches({
      candidates: [
        {
          record: "https://ann.platform.example.test/base/e/06aaaaaaaaaaaaaaaaaaaa1111",
          vaultId: "https://ann.platform.example.test/base",
          type: "t:Person",
          label: "Jason Test",
        },
        {
          record: "https://ann.platform.example.test/base/e/06aaaaaaaaaaaaaaaaaaaa2222",
          vaultId: "https://ann.platform.example.test/base",
          type: "t:Person",
          label: "Ada",
        },
      ],
    });
    expect(screen.getByTestId("connected-create-match-06aaaaaaaaaaaaaaaaaaaa1111").textContent).toBe(
      "Jason Test",
    );
    expect(screen.getByTestId("connected-create-match-06aaaaaaaaaaaaaaaaaaaa2222").textContent).toBe("Ada");
  });
});
