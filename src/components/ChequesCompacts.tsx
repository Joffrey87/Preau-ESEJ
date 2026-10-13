"use client";

import { useState } from "react";
import { INCONNU, type CategorieRecette } from "@/lib/depotCheques";
import { formatDate, formatEuros, todayISO } from "@/lib/format";

export type LigneCompacte = { montant: string; emetteur: string; date_cheque: string; categorie_id: string; doute: boolean };

const montantDe = (s: string) => Number(s.replace(",", ".").replace(/\s/g, "")) || 0;
// Champ qui a l'air d'un texte, mais se modifie au clic.
const discret =
  "rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-surface focus:outline-none";

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

/** Vue compacte après import : une seule ligne par chèque (date, émetteur, montant, catégorie, Doute) ; repli propre sur mobile. */
export default function ChequesCompacts({
  lignes,
  categories,
  onChange,
  onRetirer,
}: {
  lignes: LigneCompacte[];
  categories: CategorieRecette[];
  onChange: (i: number, p: Partial<LigneCompacte>) => void;
  onRetirer?: (i: number) => void;
}) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {lignes.map((l, i) => (
        <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-2 py-1 text-sm md:flex-nowrap">
          <input aria-label="Émetteur" className={`${discret} w-0 min-w-[9rem] flex-1 basis-[calc(100%-6rem)] truncate font-medium md:basis-0`} value={l.emetteur} placeholder="Émetteur" onChange={(e) => onChange(i, { emetteur: e.target.value })} />
          <input
            aria-label="Montant (€)"
            inputMode="decimal"
            className={`${discret} w-20 shrink-0 text-right font-semibold tabular-nums`}
            value={l.montant}
            title={formatEuros(montantDe(l.montant))}
            onChange={(e) => onChange(i, { montant: e.target.value })}
          />
          <span className="shrink-0 whitespace-nowrap text-xs"><DateCliquable valeur={l.date_cheque} onChange={(v) => onChange(i, { date_cheque: v })} /></span>
          <select
            aria-label="Catégorie"
            className="min-w-0 max-w-[16rem] flex-1 rounded-md border border-border bg-surface px-1.5 py-1 text-sm md:flex-none"
            value={l.categorie_id}
            onChange={(e) => onChange(i, { categorie_id: e.target.value })}
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nom}
              </option>
            ))}
            <option value={INCONNU}>Inconnu</option>
          </select>
          <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="Doute : jamais relié automatiquement">
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
