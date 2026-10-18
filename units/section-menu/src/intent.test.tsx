// "Act once the destination is mounted" (intent.ts), ported from GilbApp's useShellIntent behaviour.
import { afterEach, describe, expect, test, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { useState } from "react";
import { createIntentChannel, type Intent } from "./intent";

type Kind = "create" | "search";
type I = Intent<Kind, "home" | "notes"> & { target?: string };
const channel = createIntentChannel<I>();

afterEach(cleanup);

function Consumer({ kind, act, accept }: { kind: Kind; act: (i: I) => void; accept?: (i: I) => boolean }) {
  channel.useIntent(kind, act, accept);
  return null;
}

function Host({ intent, place, children }: { intent: I | null; place: string; children: React.ReactNode }) {
  const [pending, setPending] = useState<I | null>(intent);
  return (
    <channel.Context.Provider value={{ intent: pending, place, consume: () => setPending(null) }}>
      {children}
    </channel.Context.Provider>
  );
}

describe("createIntentChannel", () => {
  test("runs the act once when the kind and the place match", () => {
    const act = vi.fn();
    const { rerender } = render(<Host intent={{ kind: "create", place: "notes" }} place="notes"><Consumer kind="create" act={act} /></Host>);
    rerender(<Host intent={{ kind: "create", place: "notes" }} place="notes"><Consumer kind="create" act={act} /></Host>);
    expect(act).toHaveBeenCalledTimes(1);
    expect(act.mock.calls[0]![0]).toMatchObject({ kind: "create", place: "notes" });
  });

  test("waits while the person is elsewhere, and runs once they arrive", () => {
    const act = vi.fn();
    function Moving({ place }: { place: string }) {
      return <Host intent={{ kind: "create", place: "notes" }} place={place}><Consumer kind="create" act={act} /></Host>;
    }
    const { rerender } = render(<Moving place="home" />);
    expect(act).not.toHaveBeenCalled();
    rerender(<Moving place="notes" />);
    expect(act).toHaveBeenCalledTimes(1);
  });

  test("does not run for another kind, nor when accept refuses; a place of any matches everywhere", () => {
    const other = vi.fn();
    render(<Host intent={{ kind: "create", place: "notes" }} place="notes"><Consumer kind="search" act={other} /></Host>);
    expect(other).not.toHaveBeenCalled();
    cleanup();
    const refused = vi.fn();
    render(<Host intent={{ kind: "create", place: "notes", target: "a" }} place="notes"><Consumer kind="create" act={refused} accept={(i) => i.target === "b"} /></Host>);
    expect(refused).not.toHaveBeenCalled();
    cleanup();
    const anywhere = vi.fn();
    render(<Host intent={{ kind: "search", place: "any" }} place="home"><Consumer kind="search" act={anywhere} /></Host>);
    expect(anywhere).toHaveBeenCalledTimes(1);
  });

  test("outside a provider it never matches", () => {
    const act = vi.fn();
    render(<Consumer kind="create" act={act} />);
    expect(act).not.toHaveBeenCalled();
  });
});
