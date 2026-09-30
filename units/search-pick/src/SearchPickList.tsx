import { SEARCH_COPY, type SearchPhase } from "./searchPick";

export function SearchPickList<T>({
  phase,
  label,
  onPick,
}: {
  phase: SearchPhase<T>;
  label: (hit: T) => string;
  onPick: (hit: T) => void;
}) {
  if (phase.kind === "idle") return null;
  if (phase.kind === "keep-typing") return <p>{SEARCH_COPY.keepTyping}</p>;
  if (phase.kind === "loading") return <p>{SEARCH_COPY.loading}</p>;
  if (phase.kind === "empty") return <p>{SEARCH_COPY.empty}</p>;
  if (phase.kind === "error") {
    return (
      <p>
        {SEARCH_COPY.error} {phase.message}
      </p>
    );
  }
  return (
    <ul>
      {phase.hits.map((hit, i) => (
        <li key={label(hit) + String(i)}>
          <button type="button" onClick={() => onPick(hit)}>
            {label(hit)}
          </button>
        </li>
      ))}
    </ul>
  );
}
