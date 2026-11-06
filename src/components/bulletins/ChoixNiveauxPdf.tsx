"use client";

import { useState } from "react";

/**
 * Avant l'export PDF d'un lot de relevés / bulletins : choisir quels niveaux inclure
 * (classes multi-niveaux). Une seule case → export direct côté appelant.
 */
export default function ChoixNiveauxPdf({
  niveaux,
  onConfirmer,
  onAnnuler,
  titre = "Niveaux à inclure dans le PDF",
}: {
  niveaux: string[];
  onConfirmer: (choisis: string[]) => void;
  onAnnuler: () => void;
  titre?: string;
}) {
  const [choisis, setChoisis] = useState<Set<string>>(() => new Set(niveaux));
  const bascule = (n: string) =>
    setChoisis((prev) => {
      const s = new Set(prev);
      if (s.has(n)) s.delete(n);
      else s.add(n);
      return s;
    });
  const tous = choisis.size === niveaux.length;
  const aucun = choisis.size === 0;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" role="dialog" aria-modal="true" aria-labelledby="choix-niveaux-pdf-titre">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-5 shadow-xl">
        <h2 id="choix-niveaux-pdf-titre" className="text-base font-semibold">
          {titre}
        </h2>
        <p className="mt-1 text-[12.5px] text-muted">Cochez les niveaux dont les élèves figureront dans le PDF.</p>
        <div className="mt-3 space-y-1.5">
          <label className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-[13px]">
            <input
              type="checkbox"
              checked={tous}
              onChange={() => setChoisis(tous ? new Set() : new Set(niveaux))}
            />
            <span className="font-medium">Tous les niveaux</span>
          </label>
          {niveaux.map((n) => (
            <label key={n} className="flex items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-[13px]">
              <input type="checkbox" checked={choisis.has(n)} onChange={() => bascule(n)} />
              <span>{n || "Niveau non renseigné"}</span>
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onAnnuler} className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2">
            Annuler
          </button>
          <button
            type="button"
            disabled={aucun}
            onClick={() => onConfirmer([...choisis])}
            className="rounded-lg bg-accent px-3 py-1.5 text-[13px] font-medium text-accent-fg hover:opacity-90 disabled:opacity-40"
          >
            Télécharger le PDF
          </button>
        </div>
      </div>
    </div>
  );
}
