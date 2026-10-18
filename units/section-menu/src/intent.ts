/**
 * "Act once the destination is mounted": a pending act that a menu or command palette hands to the
 * section it goes to.
 *
 * ⚠ WHY NOT A WINDOW EVENT. An event fired in the same tick as the section move reaches nobody,
 * because the destination is not mounted yet. (GilbApp, 2026-10-18: "Create a vault" from ⌘K moved to
 * Vaults and fired an event before the Vaults view existed to hear it, so no dialog opened.) An intent
 * waits in the host until the person is in its place and a component there consumes it.
 *
 * The host holds at most one pending intent and provides it through the channel's `Context`. A
 * component in the destination calls the channel's `useIntent` with the kind it can carry out.
 *
 * Each channel has a context of its own, apart from the host's other contexts, so a test that mocks the
 * host's main context does not break a component that only consumes intents.
 */
import { createContext, useContext, useEffect, useRef, type Context } from "react";

/** The least an intent carries: what to do, and where (`"any"` for anywhere). A host may add fields. */
export interface Intent<Kind extends string = string, Place extends string = string> {
  kind: Kind;
  place: Place | "any";
}

/** What the host provides on the channel. */
export interface IntentChannelValue<I extends Intent> {
  intent: I | null;
  /** Where the person is now. */
  place: string | undefined;
  /** Marks the pending intent as carried out, so it runs once. */
  consume: () => void;
}

/** A channel: the context the host provides, and the hook a destination calls. */
export interface IntentChannel<I extends Intent> {
  Context: Context<IntentChannelValue<I> | null>;
  /**
   * Runs `act` once per matching intent, after the calling component is on screen: when the pending
   * intent has `kind`, the person is in its place (or its place is `"any"`), and `accept` (if given)
   * agrees. Outside a provider it never matches.
   */
  useIntent: (kind: I["kind"], act: (intent: I) => void, accept?: (intent: I) => boolean) => void;
}

/**
 * Makes one intent channel. Call it once per app, at module level.
 * @returns the channel's `Context` and `useIntent`
 */
export function createIntentChannel<I extends Intent>(): IntentChannel<I> {
  const Ctx = createContext<IntentChannelValue<I> | null>(null);
  function useIntent(kind: I["kind"], act: (intent: I) => void, accept?: (intent: I) => boolean): void {
    const channel = useContext(Ctx);
    const intent = channel?.intent ?? null;
    const place = channel?.place;
    const consume = channel?.consume;
    // The latest callbacks, so the effect below re-runs only when the intent or the place changes.
    const actRef = useRef(act);
    const acceptRef = useRef(accept);
    actRef.current = act;
    acceptRef.current = accept;
    // The intent this component already carried out. React's StrictMode runs an effect twice on mount,
    // before `consume()`'s state change lands, so without this the act ran twice (Agent.Tester D3).
    // It is cleared once no intent is pending, so the same intent object posted again acts again
    // (Agent.Tester round 2, D9).
    const doneRef = useRef<I | null>(null);

    useEffect(() => {
      if (!intent) doneRef.current = null;
      if (!intent || intent.kind !== kind || !consume) return;
      if (intent.place !== "any" && intent.place !== place) return;
      if (intent === doneRef.current) return;
      if (acceptRef.current && !acceptRef.current(intent)) return;
      doneRef.current = intent;
      consume();
      actRef.current(intent);
    }, [intent, place, kind, consume]);
  }
  return { Context: Ctx, useIntent };
}
