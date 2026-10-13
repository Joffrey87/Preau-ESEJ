"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import {
  MODES_RECETTE,
  bouton,
  candidatsRecette,
  champ,
  nombre,
  type ModeRecette,
  type OperationCandidate,
  type RecetteEvenement,
} from "@/lib/evenement";
import { useEnregistrer } from "./useEnregistrer";

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export default function RecettesEvenement({
  evenementId,
  recettes,
  operations,
  peutModifier,
  estTresorier,
}: {
  evenementId: string;
  recettes: RecetteEvenement[];
  operations: OperationCandidate[];
  peutModifier: boolean;
  estTresorier: boolean;
}) {
  const supabase = createClient();
  const { erreur, occupe, executer } = useEnregistrer();
  const [mode, setMode] = useState<ModeRecette>("cheque");
  const [montant, setMontant] = useState("");
  const [date, setDate] = useState(aujourdhui());
  const [libelle, setLibelle] = useState("");
  const [choix, setChoix] = useState<Record<string, string>>({});
  const opParId = new Map(operations.map((o) => [o.id, o]));
  const liees = new Set(recettes.map((r) => r.operation_id).filter(Boolean) as string[]);

  async function ajouter() {
    const m = nombre(montant);
    if (!m || m <= 0) return;
    const ok = await executer(() =>
      supabase.from("evenement_recettes").insert({ evenement_id: evenementId, mode, montant: m, date, libelle: libelle.trim() || null }),
    );
    if (ok) {
      setMontant("");
      setLibelle("");
    }
  }
  const lier = (id: string, op: string | null) =>
    executer(() => supabase.from("evenement_recettes").update({ operation_id: op }).eq("id", id));

  return (
    <div className="space-y-3">
      {peutModifier && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-3">
          <select className={`${champ} w-auto`} value={mode} onChange={(e) => setMode(e.target.value as ModeRecette)}>
            {MODES_RECETTE.map((m) => (
              <option key={m.v} value={m.v}>{m.l}</option>
            ))}
          </select>
          <input className={`${champ} w-28`} inputMode="decimal" placeholder="Montant" value={montant} onChange={(e) => setMontant(e.target.value)} />
          <input className={`${champ} w-40`} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          <input className={`${champ} min-w-0 flex-1`} placeholder="Libellé" value={libelle} onChange={(e) => setLibelle(e.target.value)} />
          <button className={bouton} disabled={occupe || !montant} onClick={ajouter}>Ajouter</button>
        </div>
      )}
      {erreur && <p className="text-sm text-negative">{erreur}</p>}
      <div className="divide-y divide-border rounded-xl border border-border bg-surface">
        {recettes.length === 0 && <div className="p-3 text-sm text-muted">—</div>}
        {recettes.map((r) => {
          const op = r.operation_id ? opParId.get(r.operation_id) : null;
          const cands = estTresorier && !r.operation_id ? candidatsRecette(r, operations, liees) : [];
          return (
            <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3 text-sm">
              <span className="w-16 font-medium">{MODES_RECETTE.find((m) => m.v === r.mode)?.l}</span>
              <span className="w-24 text-muted">{formatDate(r.date)}</span>
              <span className="min-w-0 flex-1 truncate">{r.libelle ?? ""}</span>
              <span className="w-24 text-right font-semibold text-positive">{formatEuros(Number(r.montant))}</span>
              {r.operation_id ? (
                <span className="rounded-full bg-positive/10 px-2 py-0.5 text-xs text-positive" title={op ? `${formatDate(op.date_operation)} · ${op.libelle}` : ""}>
                  Validé
                </span>
              ) : (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 dark:bg-amber-900/20 dark:text-amber-300">À valider</span>
              )}
              {estTresorier && r.operation_id && (
                <button className="text-xs text-accent hover:underline" disabled={occupe} onClick={() => lier(r.id, null)}>Délier</button>
              )}
              {peutModifier && !r.operation_id && (
                <button className="text-xs text-negative hover:underline" disabled={occupe}
                  onClick={() => executer(() => supabase.from("evenement_recettes").delete().eq("id", r.id))}>Supprimer</button>
              )}
              {estTresorier && !r.operation_id && (
                <div className="flex w-full items-center gap-2">
                  <select className={`${champ} min-w-0 flex-1`} value={choix[r.id] ?? ""} onChange={(e) => setChoix({ ...choix, [r.id]: e.target.value })}>
                    <option value="">Opération bancaire…</option>
                    {cands.length > 0 && (
                      <optgroup label="Suggestions">
                        {cands.map((o) => (
                          <option key={o.id} value={o.id}>{formatDate(o.date_operation)} · {formatEuros(Number(o.montant))} · {o.libelle}</option>
                        ))}
                      </optgroup>
                    )}
                    <optgroup label="Toutes">
                      {operations.filter((o) => !liees.has(o.id) && Number(o.montant) > 0).map((o) => (
                        <option key={o.id} value={o.id}>{formatDate(o.date_operation)} · {formatEuros(Number(o.montant))} · {o.libelle}</option>
                      ))}
                    </optgroup>
                  </select>
                  <button className={bouton} disabled={occupe || !choix[r.id]} onClick={() => lier(r.id, choix[r.id])}>Valider</button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
