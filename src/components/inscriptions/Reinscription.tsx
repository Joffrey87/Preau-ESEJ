"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { STATUTS_DOSSIER, type DonneesInscription, type StatutDossier } from "@/lib/inscriptions";
import type { ConfigFormulaire } from "@/lib/formulaireInscription";
import FormulaireInscription from "./FormulaireInscription";

export type EnfantReinscription = { id: string; prenom: string; classeSuivante: string | null; donnees: DonneesInscription; statut: StatutDossier | null };

/** Réinscription depuis l'Espace famille : un dossier pré-rempli par enfant (aussi l'aperçu de la Directrice). */
export default function Reinscription({
  annee,
  familleId,
  enfants,
  apercu,
  config,
  messageApercu = "Aperçu : l'envoi est réservé à la famille.",
}: {
  annee: string;
  familleId: string;
  enfants: EnfantReinscription[];
  apercu: boolean;
  config: ConfigFormulaire;
  messageApercu?: string;
}) {
  const sb = useMemo(() => createClient(), []);
  const [choisi, setChoisi] = useState<string | null>(null);
  const [envoyes, setEnvoyes] = useState<Set<string>>(new Set());
  const [merci, setMerci] = useState(false);
  const enfant = enfants.find((e) => e.id === choisi);
  return (
    <div className="space-y-4">
      <p className="whitespace-pre-line text-center text-sm text-muted">{config.textes.re.intro}</p>
      {!enfants.length && <p className="text-sm text-muted">Aucun enfant à réinscrire.</p>}
      <div className="grid gap-2 sm:grid-cols-2">
        {enfants.map((e) => {
          const st = envoyes.has(e.id) ? "recu" : e.statut;
          return (
            <button key={e.id} type="button" onClick={() => { setChoisi(e.id); setMerci(false); }}
              className={`rounded-xl border p-3 text-left ${choisi === e.id ? "border-accent bg-accent-soft" : "border-border bg-surface"}`}>
              <div className="font-semibold">{e.prenom}</div>
              <div className="text-[12px] text-muted">{e.classeSuivante ? `En ${e.classeSuivante} l'an prochain` : "Classe à préciser"}</div>
              {st && <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] ${STATUTS_DOSSIER.find((x) => x.v === st)?.classe}`}>Dossier {STATUTS_DOSSIER.find((x) => x.v === st)?.label.toLowerCase()}</span>}
            </button>
          );
        })}
      </div>
      {merci && <div className="whitespace-pre-line rounded-xl border border-positive/40 bg-positive/10 p-4 text-center text-sm font-semibold">{config.textes.re.merci}</div>}
      {apercu && <p className="text-[12px] text-gold">{messageApercu}</p>}
      {enfant && (
        <FormulaireInscription
          key={enfant.id}
          config={config}
          type="re"
          initial={enfant.donnees}
          dossierFichiers={`reinscription/${familleId}`}
          libelleBouton={`Envoyer la réinscription de ${enfant.prenom}`}
          apercu={apercu}
          envoyer={async (d, photo) => {
            const { error } = await sb.rpc("reinscription_deposer", { p_eleve: enfant.id, p_annee: annee, p_donnees: d, p_photo: photo });
            if (error) return error.message;
            setEnvoyes((s) => new Set(s).add(enfant.id));
            setChoisi(null);
            setMerci(true);
            return null;
          }}
        />
      )}
    </div>
  );
}
