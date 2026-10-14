"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STATUTS_DOSSIER, type DonneesInscription, type StatutDossier } from "@/lib/inscriptions";
import FormulaireInscription from "./FormulaireInscription";

export type EnfantReinscription = { id: string; prenom: string; classeSuivante: string | null; donnees: DonneesInscription; statut: StatutDossier | null };

/** Réinscription depuis l'Espace famille : un dossier pré-rempli par enfant. */
export default function Reinscription({ annee, familleId, enfants, apercu }: { annee: string; familleId: string; enfants: EnfantReinscription[]; apercu: boolean }) {
  const sb = useMemo(() => createClient(), []);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [envoyes, setEnvoyes] = useState<Set<string>>(new Set());
  const enfant = enfants.find((e) => e.id === choisi);
  if (!enfants.length) return <p className="text-sm text-muted">Aucun enfant à réinscrire.</p>;
  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-2">
        {enfants.map((e) => {
          const st = envoyes.has(e.id) ? "recu" : e.statut;
          return (
            <button key={e.id} type="button" onClick={() => setChoisi(e.id)}
              className={`rounded-xl border p-3 text-left ${choisi === e.id ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}>
              <div className="font-semibold">{e.prenom}</div>
              <div className="text-[12px] text-muted">{e.classeSuivante ? `En ${e.classeSuivante} l'an prochain` : "Classe à préciser"}</div>
              {st && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUTS_DOSSIER.find((x) => x.v === st)?.classe}`}>Dossier {STATUTS_DOSSIER.find((x) => x.v === st)?.label.toLowerCase()}</span>}
            </button>
          );
        })}
      </div>
      {apercu && <p className="text-[12px] text-gold">Aperçu : l&apos;envoi est réservé à la famille.</p>}
      {enfant && !apercu && (
        <FormulaireInscription
          key={enfant.id}
          initial={enfant.donnees}
          dossierPhoto={`reinscription/${familleId}`}
          libelleBouton={`Envoyer la réinscription de ${enfant.prenom}`}
          envoyer={async (d, photo) => {
            const { error } = await sb.rpc("reinscription_deposer", { p_eleve: enfant.id, p_annee: annee, p_donnees: d, p_photo: photo });
            if (error) return error.message;
            setEnvoyes((s) => new Set(s).add(enfant.id));
            setChoisi(null);
            return null;
          }}
        />
      )}
    </div>
  );
}
