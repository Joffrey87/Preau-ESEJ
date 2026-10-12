"use client";

import Link from "next/link";
import { useState } from "react";

/**
 * Choix de la période de la Comptabilité : même bouton-menu que l'onglet Dons (deux colonnes, Année et Exercice).
 * Un exercice à la fois ; les années civiles se cumulent (un clic ajoute ou retire l'année ; retirer la dernière ramène
 * à l'exercice du jour).
 */
export default function MenuPeriodeCompta({
  exercices,
  annees,
  selection,
}: {
  exercices: { id: string; libelle: string; actif: boolean }[];
  annees: number[];
  selection: { exercices: string[]; annees: number[] };
}) {
  const [ouvert, setOuvert] = useState(false);
  const basculer = (a: number) => {
    const as = selection.annees.includes(a) ? selection.annees.filter((x) => x !== a) : [...selection.annees, a];
    return as.length > 0 ? `/comptabilite?annee=${[...as].sort().join(",")}` : "/comptabilite";
  };
  const libelle =
    selection.annees.length > 0
      ? `Année${selection.annees.length > 1 ? "s" : ""} ${[...selection.annees].sort().join(", ")}`
      : (exercices.find((e) => selection.exercices.includes(e.id))?.libelle ?? "Période");
  const exerciceActif = (id: string) => selection.annees.length === 0 && selection.exercices.includes(id);

  return (
    <div className="relative mb-4">
      <button
        type="button"
        onClick={() => setOuvert((v) => !v)}
        className="rounded-lg border border-accent bg-accent-soft px-3 py-2 text-sm font-medium text-accent"
      >
        {libelle} ▾
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOuvert(false)} />
          <div className="absolute left-0 z-20 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface p-2 shadow-lg">
            <div className="grid grid-cols-2 gap-2">
              <div>
                <p className="px-2 py-1 text-xs font-medium text-muted">Année</p>
                <div className="max-h-64 overflow-y-auto">
                  {[...annees].sort((a, b) => b - a).map((a) => (
                    <Link
                      key={a}
                      href={basculer(a)}
                      onClick={() => setOuvert(false)}
                      title={`Opérations datées du 1er janvier au 31 décembre ${a} — ajouter ou retirer cette année`}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-surface-2 ${
                        selection.annees.includes(a) ? "bg-accent-soft font-medium text-accent" : ""
                      }`}
                    >
                      {a}
                    </Link>
                  ))}
                </div>
              </div>
              <div>
                <p className="px-2 py-1 text-xs font-medium text-muted">Exercice</p>
                <div className="max-h-64 overflow-y-auto">
                  {exercices.map((e) => (
                    <Link
                      key={e.id}
                      href={`/comptabilite?exercice=${e.id}`}
                      onClick={() => setOuvert(false)}
                      className={`block w-full rounded-md px-2 py-1.5 text-left text-sm tabular-nums hover:bg-surface-2 ${
                        exerciceActif(e.id) ? "bg-accent-soft font-medium text-accent" : ""
                      }`}
                    >
                      {e.libelle.replace("Exercice ", "")}
                      {e.actif ? " •" : ""}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
            <p className="mt-1 border-t border-border px-2 pt-1.5 text-[11px] text-muted">Les années se cumulent : un clic ajoute ou retire l&apos;année.</p>
          </div>
        </>
      )}
    </div>
  );
}
