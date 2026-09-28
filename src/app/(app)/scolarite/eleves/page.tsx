import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import ImportEleves from "@/components/ImportEleves";
import { createClient } from "@/lib/supabase/server";
import type { Eleve } from "@/lib/eleves";

export default async function ElevesPage() {
  const supabase = await createClient();
  const { data: insc } = await supabase.from("scolarite_inscriptions").select("annee_scolaire, famille_id");
  const annee = [...new Set((insc ?? []).map((r) => r.annee_scolaire as string))].sort().reverse()[0] ?? "";
  const famillesAnnee = (insc ?? []).filter((r) => r.annee_scolaire === annee).map((r) => r.famille_id as string);

  const [famillesRes, elevesRes] = await Promise.all([
    supabase.from("familles").select("id, nom").order("nom"),
    supabase.from("eleves").select("id, famille_id, prenom_chiffre, initiale, classe_entree, annee_entree, decalage, sorti_le"),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <div className="mb-4">
        <Link href="/scolarite" className="text-sm text-accent hover:underline">← Frais de scolarité</Link>
      </div>
      <PageHeader
        title={`Élèves ${annee}`}
        subtitle="Enfants scolarisés, classe actuelle et année d'entrée ; import de la liste tenue par l'école. Prénoms chiffrés (coffre du carnet)."
      />
      <ImportEleves
        annee={annee}
        familles={(famillesRes.data ?? []) as { id: string; nom: string }[]}
        famillesAnnee={famillesAnnee}
        eleves={(elevesRes.data ?? []) as Eleve[]}
      />
    </div>
  );
}
