"use client";

import { useState } from "react";
import { MOTIFS, type MotifCheque } from "@/lib/depotCheques";
import { formatDate, formatEuros, todayISO } from "@/lib/format";

export type LigneCompacte = { montant: string; emetteur: string; date_cheque: string; motif: MotifCheque; doute: boolean };

const montantDe = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;
// Champ qui a l'air d'un texte, mais se modifie au clic.
const discret =
  "w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-surface focus:outline-none";

function DateCliquable({ valeur, onChange }: { valeur: string; onChange: (v: string) => void }) {
  const [edition, setEdition] = useState(false);
  if (edition)
    return (
      <input
        type="date"
        autoFocus
        aria-label="Date du chèque"
        className="rounded border border-border bg-surface px-1 py-0.5 text-xs"
        value={valeur}
        onChange={(e) => onChange(e.target.value || todayISO())}
        onBlur={() => setEdition(false)}
      />
    );
  return (
    <button type="button" className="rounded px-1 py-0.5 text-left text-muted hover:bg-surface-2" title="Changer la date" onClick={() => setEdition(true)}>
      {valeur === todayISO() ? "Aujourd\u2019hui" : formatDate(valeur)}
    </button>
  );
}

/** Vue compacte après import : une ligne dense par chèque ; on choisit le motif et coche « Doute ». */
export default function ChequesCompacts({
  lignes,
  onChange,
  onRetirer,
}: {
  lignes: LigneCompacte[];
  onChange: (i: number, p: Partial<LigneCompacte>) => void;
  onRetirer?: (i: number) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {lignes.map((l, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-2 py-1.5 text-sm">
          <input aria-label="Émetteur" className={`${discret} min-w-0 flex-1 font-medium`} value={l.emetteur} placeholder="Émetteur" onChange={(e) => onChange(i, { emetteur: e.target.value })} />
          <input
            aria-label="Montant (€)"
            inputMode="decimal"
            className={`${discret} w-24 text-right font-semibold tabular-nums`}
            value={l.montant}
            title={formatEuros(montantDe(l.montant))}
            onChange={(e) => onChange(i, { montant: e.target.value })}
          />
          <DateCliquable valeur={l.date_cheque} onChange={(v) => onChange(i, { date_cheque: v })} />
          <select
            aria-label="Motif"
            className={`rounded-md border px-1.5 py-1 text-sm ${l.motif ? "border-border bg-surface" : ""}`}
            value={l.motif}
            onChange={(e) => onChange(i, { motif: e.target.value as MotifCheque })}
          >
            {MOTIFS.map((m) => (
              <option key={m.v} value={m.v}>
                {m.l}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1 text-xs text-muted" title="Doute : jamais relié automatiquement">
            <input type="checkbox" checked={l.doute} onChange={(e) => onChange(i, { doute: e.target.checked })} />
            Doute
          </label>
          {onRetirer && lignes.length > 1 && (
            <button type="button" className="text-xs text-muted hover:text-negative" aria-label="Retirer ce chèque" onClick={() => onRetirer(i)}>
              ✕
            </button>
          )}
        </li>
      ))}
    </ul>
  );
}
