import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ImportReleve from "@/components/ImportReleve";
import { createClient } from "@/lib/supabase/server";
import { toutesLesOperations } from "@/lib/operations";
import type { Correspondance } from "@/lib/correspondances";
import type { InscriptionImport } from "@/lib/importEnrichi";
import type { Don } from "@/components/GestionDons";

type OpExistante = { date_operation: string; montant: number; type: string; libelle: string; categorie_id: string | null };

export default async function ImportRelevePage() {
  const supabase = await createClient();

  const opsP = toutesLesOperations<OpExistante>(supabase, "date_operation, montant, type, libelle, categorie_id");
  const [catsRes, comptesRes, exercicesRes, corrRes, inscriptionsRes, donsRes] = await Promise.all([
    supabase.from("categories").select("id, nom, type").eq("archive", false).order("type").order("ordre").order("nom"),
    supabase.from("comptes").select("id, nom").eq("archive", false).order("ordre"),
    supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false }),
    supabase.from("correspondances").select("*").eq("actif", true).order("ordre"),
    // Familles de l'onglet Frais de scolarité, pour rattacher les écritures de scolarité.
    supabase
      .from("scolarite_inscriptions")
      .select("id, annee_scolaire, famille_nom, nb_enfants, montant_mensuel")
      .order("annee_scolaire", { ascending: false })
      .order("famille_nom"),
    // Dons existants (chiffrés) : fiches donateur connues et doublons possibles.
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, observations, supprime_le, supprime_par, operation_id",
      )
      .is("supprime_le", null),
  ]);
  const existantes = await opsP;

  const inscriptions = ((inscriptionsRes.data ?? []) as InscriptionImport[]).map((i) => ({
    ...i,
    montant_mensuel: i.montant_mensuel == null ? null : Number(i.montant_mensuel),
  }));

  return (
    <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
      <div className="no-print mb-4">
        <Link href="/comptabilite" className="text-sm text-accent hover:underline">
          ← Retour à la comptabilité
        </Link>
      </div>
      <PageHeader
        title="Importer un relevé"
        subtitle="Déposez l'export bancaire, vérifiez chaque ligne, puis validez l'entrée en comptabilité."
      />
      <ImportReleve
        categories={catsRes.data ?? []}
        comptes={comptesRes.data ?? []}
        exercices={exercicesRes.data ?? []}
        existantes={existantes}
        correspondances={(corrRes.data ?? []) as Correspondance[]}
        inscriptions={inscriptions}
        dons={(donsRes.data ?? []) as (Don & { operation_id: string | null })[]}
      />
    </div>
  );
}
