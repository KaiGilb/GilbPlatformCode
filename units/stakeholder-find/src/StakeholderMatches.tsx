// The "already in this vault" list inside the create dialog.
// Picking one stays in the dialog: it closes, notifies, and may link.
// Same-name rows show the record's id tail, as in the link panel.

import type { Candidate } from "@kaigilb/gilbplatformcode-pick-or-create";
import { stakeholderErrorText } from "@kaigilb/gilbplatformcode-person-create";
import { idFromEntityUri } from "@kaigilb/gilbplatformcode-id-tail";
import { labelsSeenTwice, shortIdTail } from "./sameLabel";
import { IdTail } from "./IdTail";
import type { StakeholderFindResult } from "./useStakeholderCreate";

export function StakeholderMatches({
  found,
  linking,
  busy,
  onPick,
}: {
  found: StakeholderFindResult;
  linking: boolean;
  busy: boolean;
  onPick: (c: Candidate) => void;
}) {
  const candidates = found.data?.candidates ?? [];
  const labels: string[] = [];
  for (const c of candidates) {
    if (c.label == null) continue;
    labels.push(c.label);
  }
  const collided = labelsSeenTwice(labels);
  return (
    <div data-testid="connected-create-matches" className="min-h-0 w-full max-h-[min(24rem,calc(100vh-16rem))] overflow-y-auto">
      {found.data && found.data.candidates.length > 0 && (
        <>
          <span>
            {linking
              ? "Already in this vault — link this one instead of making a new one:"
              : "Already in this vault — open this one instead of making a new one:"}
          </span>
          {found.data.candidates.map((c) => (
            <button
              key={c.record}
              type="button"
              data-testid={`connected-create-match-${idFromEntityUri(c.record)}`}
              className="min-h-[44px] text-left px-2 rounded-[var(--r-md)] hover:bg-[var(--sel)] text-[14px]"
              disabled={busy}
              onClick={() => void onPick(c)}
            >
              {c.label == null ? (
                c.record
              ) : collided.has(c.label) ? (
                <>
                  {c.label}
                  <IdTail tail={shortIdTail(c.record)} />
                </>
              ) : (
                c.label
              )}
            </button>
          ))}
          {!found.data.complete && <span>Not every record was read; there may be more.</span>}
        </>
      )}
      {found.error && <span>{stakeholderErrorText(found.error, "lookup")}</span>}
    </div>
  );
}
