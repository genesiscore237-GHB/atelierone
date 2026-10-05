"use client";

function isNumericType(t: string) {
  return t === "NOMBRE" || t === "DECIMAL" || t === "INTEGER" || t === "UNIT_VALUE" || t === "RANGE";
}

const STATUTS = [
  { value: "RENSEIGNE", label: "Renseigné" },
  { value: "INCONNU", label: "Inconnu" },
  { value: "N_A", label: "Non applicable" },
];

export function AttributDefLigne({ def, value, unite, statut, onStatutChange, onChange }: {
  def: { cle: string; libelle: string; typeAttribut: string; liste?: string[]; obligatoire?: boolean; aide?: string | null; uniteSymbole?: string | null };
  value: string;
  unite?: string;
  statut?: string;
  onStatutChange?: (s: string) => void;
  onChange: (v: string) => void;
}) {
  const t = def.typeAttribut ?? "TEXTE";
  const field = (() => {
    if (t === "BOOLEAN" || t === "BOOLEEN") {
      return (
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" className="size-4" checked={value === "true" || value === "oui" || value === "1"} onChange={(e) => onChange(e.target.checked ? "true" : "false")} />
          Oui / Non
        </label>
      );
    }
    if (t === "ENUM" && def.liste?.length) {
      return (
        <select value={value} onChange={(e) => onChange(e.target.value)} className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs">
          <option value="">—</option>
          {def.liste.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    if (t === "MULTI_ENUM" && def.liste?.length) {
      return (
        <div className="flex flex-wrap gap-3">
          {def.liste.map((o) => (
            <label key={o} className="flex items-center gap-1 text-xs">
              <input type="checkbox" className="size-3.5" checked={value.split(",").includes(o)} onChange={(e) => {
                const arr = value ? value.split(",") : [];
                onChange(e.target.checked ? [...arr, o].join(",") : arr.filter((x) => x !== o).join(","));
              }} /> {o}
            </label>
          ))}
        </div>
      );
    }
    if (t === "LONG_TEXT") {
      return (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.aide ?? ""}
          rows={2}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
        />
      );
    }
    if (t === "DATE") {
      return (
        <input
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.aide ?? ""}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
        />
      );
    }
    if (t === "DATETIME") {
      return (
        <input
          type="datetime-local"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={def.aide ?? ""}
          className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
        />
      );
    }
    return <input
      type="text"
      inputMode={isNumericType(t) ? "decimal" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={def.aide ?? ""}
      className="w-full rounded border border-border bg-background px-2 py-1.5 text-xs"
    />;
  })();
  return (
    <div className="grid grid-cols-12 items-center gap-1.5">
      <span className="col-span-4 text-xs text-foreground">{def.libelle}{def.obligatoire ? " *" : ""}</span>
      <div className="col-span-5">{field}</div>
      {(unite ?? def.uniteSymbole) ? <span className="col-span-1 text-right text-[10px] text-muted-foreground">{unite ?? def.uniteSymbole}</span> : <span className="col-span-1" />}
      {onStatutChange ? (
        <select
          value={statut ?? "RENSEIGNE"}
          onChange={(e) => onStatutChange(e.target.value)}
          className={`col-span-2 rounded border px-1.5 py-1 text-[10px] ${statut === "INCONNU" ? "border-warning/40 bg-warning/5 text-warning-foreground" : statut === "N_A" ? "border-border bg-muted/40 text-muted-foreground" : "border-border/60 bg-background text-muted-foreground"}`}
          title="Statut de la valeur — Inconnu ≠ Non applicable"
        >
          {STATUTS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      ) : null}
    </div>
  );
}