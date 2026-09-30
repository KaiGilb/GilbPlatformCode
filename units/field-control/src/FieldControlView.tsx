import { fieldControlKind, fieldInputType, type FieldKind } from "./fieldControl";

export function FieldControl({
  kind,
  label,
  value,
  onChange,
  options = [],
  readOnly = false,
  placeholder = "",
}: {
  kind: FieldKind;
  label: string;
  value: string;
  onChange: (value: string) => void;
  options?: readonly string[];
  readOnly?: boolean;
  placeholder?: string;
}) {
  const control = fieldControlKind(kind);
  return (
    <label>
      <span>{label}</span>
      {control === "textarea" ? (
        <textarea value={value} readOnly={readOnly} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : control === "select" ? (
        <select value={value} disabled={readOnly} onChange={(e) => onChange(e.target.value)}>
          <option value="">—</option>
          {options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={fieldInputType(kind)}
          value={value}
          readOnly={readOnly}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}
