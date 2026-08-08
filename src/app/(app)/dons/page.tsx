import PageHeader from "@/components/PageHeader";
import GestionDons, { type Don } from "@/components/GestionDons";
import { createClient } from "@/lib/supabase/server";

export default async function DonsPage() {
  const supabase = await createClient();

  const { data: dons } = await supabase
    .from("dons")
    .select(
      "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, observations",
    )
    .order("date_don", { ascending: false });

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Dons"
        subtitle="Suivi des dons reçus et génération des reçus fiscaux."
      />
      <GestionDons dons={(dons ?? []) as Don[]} />
    </div>
  );
}
