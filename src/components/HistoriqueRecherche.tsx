"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { dateHeure, type EvenementHistorique } from "@/lib/rechercheFonds";

/** Bouton « Historique » : les décisions importantes, datées et signées. */
export default function HistoriqueRecherche() {
  const [ouvert, setOuvert] = useState(false);
  const [lignes, setLignes] = useState<EvenementHistorique[] | null>(null);

  useEffect(() => {
    if (!ouvert) return;
    let annule = false;
    void createClient()
      .from("recherche_historique")
      .select("id, le, prenom, objet, objet_id, titre, evenement")
      .order("le", { ascending: false })
      .limit(300)
      .then(({ data }) => {
        if (!annule) setLignes((data ?? []) as EvenementHistorique[]);
      });
    return () => {
      annule = true;
    };
  }, [ouvert]);

  return (
    <>
      <button type="button" onClick={() => setOuvert(true)} className="rounded-lg border border-border px-3 py-2 text-sm hover:bg-surface-2">
        Historique
      </button>
      {ouvert && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOuvert(false)}>
          <div className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl border border-border bg-surface shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-base font-semibold">Historique des décisions</h2>
              <button type="button" onClick={() => setOuvert(false)} aria-label="Fermer" className="rounded p-1 text-muted hover:bg-surface-2">✕</button>
            </div>
            <div className="overflow-y-auto px-5 py-3 text-sm">
              {lignes === null ? (
                <p className="text-muted">Chargement…</p>
              ) : lignes.length === 0 ? (
                <p className="text-muted">Aucune décision enregistrée pour l&apos;instant.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {lignes.map((l) => (
                    <li key={l.id} className="flex flex-wrap items-baseline gap-x-2 py-1.5">
                      <span className="w-28 shrink-0 tabular-nums text-xs text-muted">{dateHeure(l.le)}</span>
                      <span className="font-medium">{l.prenom ?? "—"}</span>
                      <span className="text-muted">·</span>
                      <span>
                        {l.titre ? <span className="font-medium">« {l.titre} »</span> : null} {l.evenement}
                      </span>
                      <span className="ml-auto text-[11px] text-muted">{l.objet === "idee" ? "Idée" : "Action"}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
