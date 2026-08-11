import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ReconciliationCompta from "@/components/ReconciliationCompta";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import type { Don } from "@/components/GestionDons";
import type { OpDon } from "@/lib/reconciliation";

export default async function DepuisComptaPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(user?.email)?.slug ?? null;

  // Catégorie « Don » de la comptabilité.
  const { data: catDon } = await supabase
    .from("categories")
    .select("id")
    .eq("nom", "Don")
    .maybeSingle();

  // Dons déjà liés à une opération (pour ne pas re-proposer).
  const { data: liens } = await supabase
    .from("dons")
    .select("operation_id")
    .not("operation_id", "is", null);
  const liees = new Set((liens ?? []).map((l) => l.operation_id as string));

  // Opérations « Don » de la compta, non encore liées.
  let operations: OpDon[] = [];
  if (catDon?.id) {
    const { data: ops } = await supabase
      .from("operations")
      .select("id, date_operation, montant, libelle, libelle_origine, mode_paiement")
      .eq("categorie_id", catDon.id)
      .eq("type", "recette")
      .order("date_operation", { ascending: false });
    operations = ((ops ?? []) as OpDon[]).filter((o) => !liees.has(o.id));
  }

  // Tous les dons (pour rapprochement montant/date + rapprochement du nom, déchiffré côté client).
  const { data: dons } = await supabase
    .from("dons")
    .select(
      "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, observations, supprime_le, supprime_par, operation_id",
    )
    .is("supprime_le", null);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Importer des dons depuis la comptabilité"
        subtitle="Les opérations de catégorie « Don » pas encore présentes dans l'onglet Dons. Le donateur est deviné d'après le libellé bancaire — à vérifier avant validation."
        action={
          <Link href="/dons" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            ← Retour aux dons
          </Link>
        }
      />
      <ReconciliationCompta
        operations={operations}
        dons={(dons ?? []) as Don[]}
        roleSlug={roleSlug}
      />
    </div>
  );
}
