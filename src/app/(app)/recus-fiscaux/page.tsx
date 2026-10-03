import PageHeader from "@/components/PageHeader";
import ListeRecus, { type DonRow, type RecuInfo } from "@/components/ListeRecus";
import { createClient } from "@/lib/supabase/server";

export default async function RecusFiscauxPage() {
  const supabase = await createClient();

  // Mêmes colonnes que l'onglet Dons : la fiche du donateur s'y ouvre en fenêtre.
  const [{ data }, { data: recus }] = await Promise.all([
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, operation_id, operation:operations!dons_operation_id_fkey(date_operation)",
      )
      .is("supprime_le", null)
      .order("date_don", { ascending: false }),
    supabase.from("recus").select("recu_numero, envoye_le, envoi_mode"),
  ]);
  const dons = ((data ?? []) as unknown as (DonRow & { operation: unknown })[]).map((d) => ({
    ...d,
    operation: (Array.isArray(d.operation) ? d.operation[0] : d.operation) as DonRow["operation"],
  })) as DonRow[];

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Reçus fiscaux"
        subtitle="Un reçu par donateur et par année (ou intermédiaire), numéroté automatiquement ; chaque don figure sur un seul reçu, détaillé au modèle ESEJ."
      />
      <ListeRecus dons={dons} recus={(recus ?? []) as RecuInfo[]} />
    </div>
  );
}
