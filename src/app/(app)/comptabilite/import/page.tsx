import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ImportReleve, { type OpExistante, type ImportPasse } from "@/components/ImportReleve";
import { createClient } from "@/lib/supabase/server";
import { toutesLesOperations } from "@/lib/operations";
import type { Correspondance } from "@/lib/correspondances";
import type { InscriptionImport } from "@/lib/importEnrichi";
import type { NatureAffectation } from "@/lib/scolariteDepots";
import type { Don } from "@/components/GestionDons";

export default async function ImportRelevePage() {
  const supabase = await createClient();

  // Toutes les opérations (pagination au-delà de 1000) : doublons, catégories
  // apprises, mémoire des choix et contrôle du solde.
  const opsP = toutesLesOperations<OpExistante>(
    supabase,
    "id, date_operation, montant, type, libelle, libelle_origine, libelle_origine_chiffre, categorie_id, compte_id, parent_id, est_ventilee",
  );
  const [catsRes, comptesRes, exercicesRes, corrRes, inscriptionsRes, donsRes, affRes, importsRes] = await Promise.all([
    supabase.from("categories").select("id, nom, type").eq("archive", false).order("type").order("ordre").order("nom"),
    supabase.from("comptes").select("id, nom, solde_initial").eq("archive", false).order("ordre"),
    supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false }),
    supabase.from("correspondances").select("*").eq("actif", true).order("ordre"),
    // Familles de l'onglet Frais de scolarité, pour rattacher les écritures de scolarité.
    supabase
      .from("scolarite_inscriptions")
      .select("id, annee_scolaire, famille_nom, nb_enfants, montant_mensuel")
      .order("annee_scolaire", { ascending: false })
      .order("famille_nom"),
    // Dons existants (chiffrés) : donateurs connus, doublons possibles, mémoire.
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, observations, supprime_le, supprime_par, operation_id",
      )
      .is("supprime_le", null),
    // Rattachements déjà faits : mémoire des familles et répartition Amitié Sainte Anne.
    supabase.from("affectations_scolarite").select("operation_id, inscription_id, montant, nature"),
    supabase
      .from("imports_releve")
      .select("id, fichier, compte_id, nb_operations, total_recettes, total_depenses, solde_banque, solde_date, solde_preau, cree_le, annule_le")
      .order("cree_le", { ascending: false })
      .limit(10),
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
        comptes={(comptesRes.data ?? []).map((c) => ({ ...c, solde_initial: Number(c.solde_initial) || 0 }))}
        exercices={exercicesRes.data ?? []}
        existantes={existantes}
        correspondances={(corrRes.data ?? []) as Correspondance[]}
        inscriptions={inscriptions}
        dons={(donsRes.data ?? []) as (Don & { operation_id: string | null })[]}
        affectations={(affRes.data ?? []) as { operation_id: string; inscription_id: string; montant: number; nature: NatureAffectation }[]}
        imports={(importsRes.data ?? []) as ImportPasse[]}
      />
    </div>
  );
}
