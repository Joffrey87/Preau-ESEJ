import PageHeader from "@/components/PageHeader";
import ListeRecus, { type DonRow } from "@/components/ListeRecus";
import { createClient } from "@/lib/supabase/server";

export default async function RecusFiscauxPage() {
  const supabase = await createClient();

  const { data } = await supabase
    .from("dons")
    .select(
      "id, date_don, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, est_personne_morale, adresse, cp_ville, courriel, pii_chiffre, montant, mode_paiement, recu_numero, recu_etat",
    )
    .order("date_don", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Reçus fiscaux"
        subtitle="Un reçu annuel par n° et par année, cumulant les versements. Publipostage du modèle ESEJ (.docx)."
      />
      <ListeRecus dons={(data ?? []) as DonRow[]} />
    </div>
  );
}
