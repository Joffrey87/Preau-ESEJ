import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ImportReleve from "@/components/ImportReleve";
import { createClient } from "@/lib/supabase/server";

export default async function ImportRelevePage() {
  const supabase = await createClient();

  const [catsRes, comptesRes, exercicesRes, opsRes] = await Promise.all([
    supabase.from("categories").select("id, nom, type").eq("archive", false).order("type").order("ordre").order("nom"),
    supabase.from("comptes").select("id, nom").eq("archive", false).order("ordre"),
    supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false }),
    supabase.from("operations").select("date_operation, montant, type, libelle, categorie_id"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
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
        existantes={opsRes.data ?? []}
      />
    </div>
  );
}
