"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { note20, type Synthese } from "@/lib/bulletins";
import { telechargerBulletins } from "@/lib/bulletinPdf";
import VueBulletin from "./VueBulletin";

export type BulletinFamille = { id: string; eleveId: string; synthese: Synthese; publieLe: string | null; luLe: string | null; ordre: number };

/** Espace famille : un onglet par enfant, ses bulletins du plus récent au plus ancien ; l'ouverture vaut accusé de lecture. */
export default function BulletinsFamille({ bulletins, apercu }: { bulletins: BulletinFamille[]; apercu: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const enfants = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bulletins) if (!m.has(b.eleveId)) m.set(b.eleveId, b.synthese.eleve.prenom);
    return [...m].sort((a, b) => a[1].localeCompare(b[1], "fr"));
  }, [bulletins]);
  const [enfant, setEnfant] = useState(enfants[0]?.[0] ?? null);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const [lus, setLus] = useState<Set<string>>(new Set(bulletins.filter((b) => b.luLe).map((b) => b.id)));
  const [erreur, setErreur] = useState<string | null>(null);

  if (!bulletins.length) {
    return <div className="rounded-xl border border-border bg-surface p-6 text-center text-sm text-muted">Aucun bulletin publié pour le moment.</div>;
  }

  const liste = bulletins.filter((b) => b.eleveId === enfant).sort((a, b) => b.synthese.periode.annee.localeCompare(a.synthese.periode.annee) || b.ordre - a.ordre);
  const ouvrir = (b: BulletinFamille) => {
    setOuvert(ouvert === b.id ? null : b.id);
    if (!apercu && !lus.has(b.id)) {
      sb.rpc("bulletin_lu", { p_id: b.id }).then(() => setLus((s) => new Set(s).add(b.id)));
    }
  };

  return (
    <div className="space-y-3">
      {enfants.length > 1 && (
        <div className="flex justify-center gap-1">
          {enfants.map(([id, prenom]) => {
            const nonLus = bulletins.filter((b) => b.eleveId === id && !lus.has(b.id)).length;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setEnfant(id);
                  setOuvert(null);
                }}
                className={`rounded-full px-3 py-1 text-[13px] font-medium ${enfant === id ? "bg-accent text-accent-fg" : "border border-border hover:bg-surface-2"}`}
              >
                {prenom}
                {nonLus > 0 && <span className="ml-1.5 rounded-full bg-gold px-1.5 text-[10.5px] text-white">{nonLus}</span>}
              </button>
            );
          })}
        </div>
      )}
      {erreur && <p className="text-center text-sm text-negative">{erreur}</p>}
      {liste.map((b) => (
        <div key={b.id} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="flex flex-wrap items-center gap-3 px-4 py-3">
            <button type="button" onClick={() => ouvrir(b)} className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-0.5 text-left">
              <span className="font-medium">{b.synthese.periode.libelle}</span>
              <span className="text-[12px] text-muted">
                {b.synthese.eleve.prenom} · {b.synthese.classe.nom}
              </span>
              <span className="text-[13px] tabular-nums">
                Moyenne <strong>{note20(b.synthese.general.moy)}</strong>
              </span>
              {!lus.has(b.id) && <span className="rounded-full bg-gold-soft px-2 py-0.5 text-[11px] font-medium text-gold">Nouveau</span>}
            </button>
            <button
              type="button"
              onClick={() => telechargerBulletins([b.synthese]).catch((e) => setErreur(`PDF impossible : ${e instanceof Error ? e.message : e}`))}
              className="rounded-lg border border-border px-3 py-1.5 text-[13px] hover:bg-surface-2"
            >
              Télécharger (PDF)
            </button>
            <button type="button" onClick={() => ouvrir(b)} className="rounded-lg px-3 py-1.5 text-[13px] text-accent hover:bg-accent-soft">
              {ouvert === b.id ? "Fermer" : "Lire"}
            </button>
          </div>
          {ouvert === b.id && (
            <div className="border-t border-border p-4">
              <VueBulletin s={b.synthese} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
