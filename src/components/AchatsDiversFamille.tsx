"use client";

import { useState } from "react";
import { formatDate, formatEuros } from "@/lib/format";

export type AchatFamille = {
  id: string;
  exercice_id: string;
  exercice: string;
  date_vente: string;
  domaine: "ecole" | "evenement";
  objet: string;
  quantite: number | null;
  montant: number;
  paye: number;
  mode: string;
};
export type CoordonneesPaiement = { ordre_cheque: string | null; titulaire: string | null; iban: string | null; bic: string | null };

const MODE: Record<string, string> = { virement: "Virement", cheque: "Chèque", liquide: "Espèces" };
const PARTIE: Record<string, string> = { ecole: "École", evenement: "Événement" };

/** Liste des achats d'une année (cartes sur téléphone, tableau sur grand écran). */
function Liste({ achats }: { achats: AchatFamille[] }) {
  if (achats.length === 0) return <p className="rounded-xl border border-border bg-surface p-4 text-sm text-muted">Aucun achat pour cette année.</p>;
  const statut = (a: AchatFamille) =>
    a.paye >= a.montant - 0.005 ? (
      <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-300">Payé</span>
    ) : (
      <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">À régler</span>
    );
  return (
    <>
      <ul className="space-y-2 sm:hidden">
        {achats.map((a) => (
          <li key={a.id} className="rounded-xl border border-border bg-surface p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="font-medium">
                  {a.objet}
                  {a.quantite ? <span className="ml-1 text-muted">× {a.quantite}</span> : null}
                </div>
                <div className="text-xs text-muted">
                  {formatDate(a.date_vente)} · {PARTIE[a.domaine]} · {MODE[a.mode] ?? a.mode}
                </div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold tabular-nums">{formatEuros(a.montant)}</div>
                <div className="mt-1">{statut(a)}</div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-hidden rounded-xl border border-border bg-surface sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-xs text-muted">
              <th className="px-4 py-2 font-medium">Date</th>
              <th className="px-4 py-2 font-medium">Achat</th>
              <th className="px-4 py-2 font-medium">Partie</th>
              <th className="px-4 py-2 text-right font-medium">Montant</th>
              <th className="px-4 py-2 font-medium">Paiement</th>
              <th className="px-4 py-2 font-medium">Statut</th>
            </tr>
          </thead>
          <tbody>
            {achats.map((a) => (
              <tr key={a.id} className="border-b border-border/50 last:border-0">
                <td className="px-4 py-2 text-muted">{formatDate(a.date_vente)}</td>
                <td className="px-4 py-2">
                  {a.objet}
                  {a.quantite ? <span className="ml-1 text-muted">× {a.quantite}</span> : null}
                </td>
                <td className="px-4 py-2 text-muted">{PARTIE[a.domaine]}</td>
                <td className="px-4 py-2 text-right tabular-nums">{formatEuros(a.montant)}</td>
                <td className="px-4 py-2 text-muted">{MODE[a.mode] ?? a.mode}</td>
                <td className="px-4 py-2">{statut(a)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function AchatsDiversFamille({
  achats,
  coordonnees,
  exerciceCourant,
  exercices,
}: {
  achats: AchatFamille[];
  coordonnees: CoordonneesPaiement | null;
  exerciceCourant: string;
  exercices: { id: string; libelle: string }[];
}) {
  const [voirAnciennes, setVoirAnciennes] = useState(false);
  const annee = achats.filter((a) => a.exercice_id === exerciceCourant);
  const paye = annee.reduce((s, a) => s + Math.min(a.paye, a.montant), 0);
  const attente = annee.reduce((s, a) => s + Math.max(0, a.montant - a.paye), 0);
  const anciennes = exercices.filter((e) => e.id !== exerciceCourant && achats.some((a) => a.exercice_id === e.id));
  const libCourant = exercices.find((e) => e.id === exerciceCourant)?.libelle ?? "";
  const aRegler = annee.filter((a) => a.paye < a.montant - 0.005);
  const c = coordonnees;
  const aCoordonnees = !!(c?.ordre_cheque || c?.iban);

  return (
    <div className="space-y-5">
      <div className="text-center">
        <h1 className="text-lg font-semibold">Achats divers</h1>
        <p className="text-xs text-muted">Année scolaire {libCourant} · École et Événement</p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-border bg-surface p-3 text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted">Payé</div>
          <div className="text-lg font-semibold tabular-nums text-positive">{formatEuros(paye)}</div>
        </div>
        <div className="rounded-xl border border-border bg-surface p-3 text-center">
          <div className="text-[11px] uppercase tracking-wide text-muted">En attente</div>
          <div className={`text-lg font-semibold tabular-nums ${attente > 0.005 ? "text-gold" : ""}`}>{formatEuros(attente)}</div>
        </div>
      </div>

      {aRegler.length > 0 && (
        <section className="rounded-xl border border-gold/40 bg-gold/10 p-4 text-sm">
          <h2 className="font-semibold">À régler : {formatEuros(attente)}</h2>
          {aCoordonnees ? (
            <ul className="mt-2 space-y-2">
              {c?.ordre_cheque && (
                <li>
                  <span className="font-medium">Par chèque</span> à l&apos;ordre de <strong>{c.ordre_cheque}</strong>, à remettre à l&apos;école.
                </li>
              )}
              {c?.iban && (
                <li>
                  <span className="font-medium">Par virement</span>
                  {c.titulaire ? <> au bénéficiaire <strong>{c.titulaire}</strong></> : null} :
                  <div className="mt-1 select-all break-all rounded-lg bg-background px-3 py-2 font-mono text-[13px]">{c.iban}</div>
                  {c.bic && <div className="mt-1 text-xs text-muted">BIC : <span className="select-all font-mono">{c.bic}</span></div>}
                  <div className="mt-1 text-xs text-muted">Indiquez votre nom de famille et l&apos;achat en libellé du virement.</div>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-1 text-muted">Les modalités de paiement vous seront communiquées par l&apos;école.</p>
          )}
        </section>
      )}

      <Liste achats={annee} />

      {anciennes.length > 0 && (
        <section>
          <button
            type="button"
            onClick={() => setVoirAnciennes((v) => !v)}
            className="w-full rounded-xl border border-border px-4 py-2.5 text-sm font-medium hover:bg-surface-2"
          >
            {voirAnciennes ? "Masquer les années précédentes" : "Année(s) précédente(s)"}
          </button>
          {voirAnciennes && (
            <div className="mt-4 space-y-5">
              {anciennes.map((e) => (
                <div key={e.id}>
                  <h2 className="mb-2 text-sm font-semibold">{e.libelle}</h2>
                  <Liste achats={achats.filter((a) => a.exercice_id === e.id)} />
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
