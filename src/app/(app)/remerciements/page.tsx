import PageHeader from "@/components/PageHeader";
import Remerciements, { type DonARemercier } from "@/components/Remerciements";
import { createClient } from "@/lib/supabase/server";
import { SEUIL_REMERCIEMENT } from "@/lib/seuilRemerciement";

export default async function RemerciementsPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("dons")
    .select(
      "id, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, remerciement_envoye_le",
    )
    .is("supprime_le", null)
    .eq("don_boursier", false)
    .gte("montant", SEUIL_REMERCIEMENT)
    .order("date_don", { ascending: false });

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Remerciements"
        subtitle={`Dons de ${SEUIL_REMERCIEMENT} € et plus (hors dons boursiers) : la lettre de remerciement du Président, puis la date d'envoi.`}
      />
      {error ? (
        <p className="rounded-xl border border-negative/40 bg-negative/10 px-4 py-3 text-sm text-negative">Lecture impossible : {error.message}</p>
      ) : (
        <Remerciements donsInit={(data ?? []) as DonARemercier[]} />
      )}
    </div>
  );
}
