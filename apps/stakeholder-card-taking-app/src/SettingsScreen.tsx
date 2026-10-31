import { useState } from "react";
import { EMPTY_SETTINGS, settingsProblems, type AppSettings } from "./settings";

const FIELDS: { key: keyof AppSettings; label: string; hint: string; required: boolean }[] = [
  { key: "origin", label: "Platform origin of the vault", hint: "https://your-vault.example.test", required: true },
  { key: "signInOrigin", label: "Sign-in origin (the platform's identity service)", hint: "https://id.example.test", required: true },
  { key: "ontologyOrigin", label: "Ontology origin", hint: "https://ontology.example.test", required: true },
  { key: "geoOrigin", label: "World catalogue origin", hint: "https://geo.example.test", required: true },
  { key: "systemVaultHosts", label: "System vault hosts", hint: "ontology.example.test (comma-separated)", required: true },
  { key: "systemHostLabels", label: "System host labels", hint: "id, ontology (comma-separated)", required: true },
  { key: "ontologyApiOrigin", label: "Ontology search origin", hint: "optional", required: false },
  { key: "ontologyApiOriginRaw", label: "Ontology search origin, as text", hint: "optional", required: false },
  { key: "publicCorpusOrigin", label: "Public term corpus origin", hint: "optional", required: false },
  { key: "dpopProofOrigin", label: "DPoP proof origin for the platform origin", hint: "optional: https://id.example.test (the host the platform origin forwards to)", required: false },
  { key: "localRigHosts", label: "Local rig hosts", hint: "optional (comma-separated)", required: false },
  { key: "minOntologyQuery", label: "Shortest ontology query", hint: "optional, a whole number", required: false },
  { key: "mynetProfileUrl", label: "MyNet profile address", hint: "https://mynet.example.test/profile", required: false },
  { key: "vocabTypeBatchRevisions", label: "Batched vocabulary revisions", hint: "optional", required: false },
];

export function SettingsScreen({ initial, onSave, onCancel }: { initial: AppSettings | null; onSave: (s: AppSettings) => void; onCancel?: () => void }) {
  const [draft, setDraft] = useState<AppSettings>(initial ?? EMPTY_SETTINGS);
  const [problems, setProblems] = useState<string[]>(() => (initial ? settingsProblems(initial) : []));
  return (
    <form
      aria-label="Settings"
      onSubmit={(e) => {
        e.preventDefault();
        const found = settingsProblems(draft);
        setProblems(found);
        if (found.length === 0) onSave(draft);
      }}
    >
      <h2>Settings</h2>
      <p>These values stay in this browser. Nothing here is sent anywhere until you sign in.</p>
      {FIELDS.map((f) => (
        <p key={f.key}>
          <label>
            {f.label}
            <br />
            <input value={draft[f.key]} placeholder={f.hint} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} size={56} />
          </label>
        </p>
      ))}
      {problems.length > 0 && (
        <ul role="alert">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      )}
      <button type="submit">Save settings</button>
      {onCancel && (
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      )}
    </form>
  );
}
