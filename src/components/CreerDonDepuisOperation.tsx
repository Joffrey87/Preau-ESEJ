"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "./GestionComptes";
import ChampsDonateur, {
  ficheDonateurValide,
  formDonateurDepuisDon,
  formDonateurDepuisNom,
  piiDeFiche,
  relationsConnues,
  resumeDonateur,
  type FormDonateur,
} from "./FormulaireDonateur";
import type { Don } from "@/components/GestionDons";
import { useCoffre } from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/client";
import { formatDate, formatEuros } from "@/lib/format";
import { donateursRessemblants, extraireNom, identitesDonateurs, reconnaitreDonateur } from "@/lib/reconciliation";

/**
 * Création d'un don depuis la Comptabilité : une écriture « Don » sans don dans
 * l'onglet Dons devient un don, avec sa fiche donateur, relié à l'écriture
 * (donc visible dans l'onglet Reçus fiscaux). Montant et date viennent de
 * l'écriture ; le nom est deviné d'après l'intitulé bancaire.
 */
export default function CreerDonDepuisOperation({
  operation,
  dons,
  onFermer,
}: {
  operation: {
    id: string;
    date_operation: string;
    montant: number;
    mode_paiement: string | null;
    exercice_id: string | null;
    /** Intitulés (bancaire, saisi) déchiffrés, où chercher le nom du donateur. */
    texte: string | null;
  };
  /** Dons existants (déchiffrés), pour reprendre un donateur connu. */
  dons: Don[];
  onFermer: () => void;
}) {
  const router = useRouter();
  const coffre = useCoffre();
  const identites = useMemo(() => identitesDonateurs(dons), [dons]);
  const nomExtrait = useMemo(() => extraireNom(operation.texte), [operation.texte]);
  const reconnu = useMemo(() => reconnaitreDonateur([operation.texte], identites), [operation.texte, identites]);
  const ressemblants = useMemo(() => {
    const premiers = reconnu?.candidats ?? [];
    const autres = donateursRessemblants(nomExtrait, identites).filter((i) => !premiers.some((p) => p.cle === i.cle));
    return [...premiers, ...autres].slice(0, 5);
  }, [reconnu, nomExtrait, identites]);

  const [f, setF] = useState<FormDonateur>(() =>
    reconnu && reconnu.candidats.length === 1 ? formDonateurDepuisDon(reconnu.candidats[0].exemple) : formDonateurDepuisNom(nomExtrait),
  );
  const [busy, setBusy] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);
  const set = <K extends keyof FormDonateur>(k: K, v: FormDonateur[K]) => setF((p) => ({ ...p, [k]: v }));

  async function valider(e: React.FormEvent) {
    e.preventDefault();
    setErreur(null);
    if (!coffre.estOuvert) return setErreur("Coffre verrouillé : déverrouillez-le pour enregistrer la fiche (chiffrée).");
    if (!ficheDonateurValide(f)) return setErreur(f.est_personne_morale ? "Le nom de l'organisme est obligatoire." : "Le nom est obligatoire.");
    setBusy(true);
    const { error } = await createClient()
      .from("dons")
      .insert({
        exercice_id: operation.exercice_id,
        origine: f.origine.trim() || null,
        categorie_donateur: f.categorie_donateur || null,
        est_personne_morale: f.est_personne_morale,
        montant: operation.montant,
        date_don: operation.date_operation,
        mode_paiement: operation.mode_paiement,
        recu_numero: null,
        recu_etat: null,
        observations: "Créé depuis la comptabilité",
        operation_id: operation.id,
        pii_chiffre: await coffre.chiffrer(JSON.stringify(piiDeFiche(f))),
        donateur_titre: null,
        donateur_nom: null,
        donateur_prenom: null,
        raison_sociale: null,
        adresse: null,
        cp_ville: null,
        courriel: null,
      });
    setBusy(false);
    if (error) return setErreur("Création impossible : " + error.message);
    router.refresh();
    onFermer();
  }

  return (
    <Modal title="Créer le don depuis la comptabilité" onClose={onFermer}>
      <form onSubmit={valider} className="max-h-[75vh] space-y-4 overflow-y-auto pr-1 text-sm">
        <p className="rounded-lg bg-surface-2 px-3 py-2">
          Don du <strong>{formatDate(operation.date_operation)}</strong> de <strong>{formatEuros(operation.montant)}</strong>, relié à cette
          écriture. Le don et sa fiche apparaîtront dans les onglets Dons et Reçus fiscaux.
        </p>

        {ressemblants.length > 0 && (
          <div>
            <div className="mb-1 text-xs text-muted">Donateurs connus qui ressemblent à l&apos;intitulé bancaire :</div>
            <div className="flex flex-wrap gap-2">
              {ressemblants.map((r) => (
                <button
                  key={r.cle}
                  type="button"
                  onClick={() => setF(formDonateurDepuisDon(r.exemple))}
                  className="rounded-full border border-border px-2.5 py-1 text-xs hover:bg-surface-2"
                  title="Reprendre la fiche de ce donateur"
                >
                  {r.nom}
                </button>
              ))}
            </div>
          </div>
        )}
        {nomExtrait && <p className="text-xs text-muted">Nom lu dans l&apos;intitulé : « {nomExtrait} ». Vérifiez-le avant d&apos;enregistrer.</p>}

        <ChampsDonateur f={f} set={set} relations={relationsConnues(dons)} idListe="relations-creation-don" />

        {!coffre.estOuvert && <p className="rounded-lg bg-gold-soft px-3 py-2 text-xs text-gold">🔒 Coffre verrouillé : déverrouillez-le pour enregistrer.</p>}
        {erreur && <p className="rounded-lg bg-negative/10 px-3 py-2 text-negative">{erreur}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onFermer} className="rounded-lg border border-border px-4 py-2 hover:bg-surface-2">
            Annuler
          </button>
          <button
            type="submit"
            disabled={busy || !ficheDonateurValide(f)}
            className="rounded-lg bg-accent px-4 py-2 font-medium text-accent-fg hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Création…" : `Créer le don de ${resumeDonateur(f) || "…"}`}
          </button>
        </div>
      </form>
    </Modal>
  );
}
