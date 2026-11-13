export type HistoryActorKind = "person" | "agent" | "system" | "unknown";

export interface HistoryActor {
  who: string;
  whoKind: HistoryActorKind;
  /** The raw slug or tail. Not the prettified `who` line. */
  agentLabel: string;
}

export interface DescribeAgentOptions {
  /** Cut from the end of a vault host's name label (for example `"-vault"` turns `anna-vault` into `anna`). */
  nameSuffix?: string;
}

/** The name label of a vault host (`anna` in `https://anna.gilb.com/base/p/x`): the first label of a host with at least three labels, never `id` or `www`. */
function vaultHostName(address: string, o: DescribeAgentOptions): string | null {
  let host: string;
  try {
    host = new URL(address).hostname;
  } catch {
    return null;
  }
  const labels = host.split(".");
  const first = labels[0] ?? "";
  if (labels.length < 3 || first === "" || first === "id" || first === "www") return null;
  const suffix = o.nameSuffix ?? "";
  return suffix !== "" && first.length > suffix.length && first.endsWith(suffix) ? first.slice(0, -suffix.length) : first;
}

/**
 * Who wrote a change, from the address string alone.
 * A person address on a vault host (`<name>.<apex>`, three or more labels, not `id` or `www`) is named by that host's first label,
 * minus `opts.nameSuffix`; any other person address stays "Person".
 * Does not remember the answer, and does not look up a person's name.
 * The app keeps a session cache and may replace "Person" later. That step is not here.
 */
export function describeAgent(agent: string | null | undefined, opts: DescribeAgentOptions = {}): HistoryActor {
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
    const name = vaultHostName(a, opts);
    if (name) return { who: name, whoKind: "person", agentLabel: name };
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
