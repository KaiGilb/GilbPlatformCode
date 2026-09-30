export type HistoryActorKind = "person" | "agent" | "system" | "unknown";

export interface HistoryActor {
  who: string;
  whoKind: HistoryActorKind;
  /** The raw slug or tail. Not the prettified `who` line. */
  agentLabel: string;
}

/**
 * Who wrote a change, from the address string alone.
 * Does not remember the answer, and does not look up a person's name.
 * The app keeps a session cache and may replace "Person" later. That step is not here.
 */
export function describeAgent(agent: string | null | undefined): HistoryActor {
  if (!agent?.trim()) {
    return { who: "Unknown actor", whoKind: "unknown", agentLabel: "unknown" };
  }
  const a = agent.trim();

  const agentM = a.match(/\/base\/e\/agent-([^/?#]+)/i) || a.match(/(?:^|\/)agent-([^/?#]+)/i);
  if (agentM?.[1]) {
    const slug = agentM[1];
    const pretty = slug
      .replace(/[-_]+/g, " ")
      .replace(/\bvabasevedanta\b/gi, "VA BVedanta")
      .replace(/\bvedanta\b/gi, "BVedanta")
      .replace(/\besco\b/gi, "ESCO");
    return {
      who: `AI agent · ${pretty}`,
      whoKind: "agent",
      agentLabel: slug,
    };
  }

  const pM = a.match(/\/base\/p\/([^/?#]+)/i);
  if (pM?.[1]) {
    return { who: "Person", whoKind: "person", agentLabel: "Person" };
  }

  // Case-sensitive. A capital E in /base/E/ is not this branch.
  const eM = a.match(/\/base\/e\/([^/?#]+)/);
  if (eM?.[1]) {
    const id = eM[1];
    if (/^agent[-_]/i.test(id)) {
      const slug = id.replace(/^agent[-_]/i, "");
      return {
        who: `AI agent · ${slug.replace(/[-_]+/g, " ")}`,
        whoKind: "agent",
        agentLabel: slug,
      };
    }
    return {
      who: `System · ${id.length > 20 ? `${id.slice(0, 16)}…` : id}`,
      whoKind: "system",
      agentLabel: id,
    };
  }

  const tail = a.split("/").pop() || a;
  return {
    who: `Actor · ${tail}`,
    whoKind: "unknown",
    agentLabel: tail,
  };
}

/** The badge only. Same call as `describeAgent(agent).agentLabel`. */
export function agentLabel(agent: string | null | undefined): string {
  return describeAgent(agent).agentLabel;
}
