import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GestionActivites, { type Activite, type Participation } from "@/components/GestionActivites";
import { createClient } from "@/lib/supabase/server";
import type { Eleve } from "@/lib/eleves";

export default async function ActivitesPage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const supabase = await createClient();
  const { annee: anneeParam } = await searchParams;

  const { data: annees } = await supabase.from("scolarite_inscriptions").select("annee_scolaire");
  const liste = [...new Set((annees ?? []).map((r) => r.annee_scolaire as string))].sort().reverse();
  const annee = anneeParam && liste.includes(anneeParam) ? anneeParam : liste[0] ?? "";

  const [actRes, partRes, elevesRes, famillesRes] = await Promise.all([
    supabase.from("activites").select("*").eq("annee_scolaire", annee).order("date_activite", { ascending: true }),
    supabase.from("activites_participations").select("id, activite_id, eleve_id, montant, paye_le"),
    supabase.from("eleves").select("id, famille_id, prenom_chiffre, initiale, classe_entree, annee_entree, decalage, sorti_le"),
    supabase.from("familles").select("id, nom"),
  ]);
  const nomFamille = new Map((famillesRes.data ?? []).map((f) => [f.id as string, f.nom as string]));
  const idsActivites = new Set((actRes.data ?? []).map((a) => a.id as string));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <div className="mb-4">
        <Link href={`/scolarite?annee=${encodeURIComponent(annee)}`} className="text-sm text-accent hover:underline">
          ← Frais de scolarité
        </Link>
      </div>
      <PageHeader
        title={`Activités ${annee}`}
        subtitle="Sorties, commandes groupées… une ligne par enfant, au prix de sa classe ; chaque famille suit ses paiements dans son espace."
      />
      <GestionActivites
        annee={annee}
        activites={(actRes.data ?? []) as Activite[]}
        participations={((partRes.data ?? []) as Participation[]).filter((p) => idsActivites.has(p.activite_id))}
        eleves={((elevesRes.data ?? []) as Eleve[]).map((e) => ({ ...e, famille_nom: nomFamille.get(e.famille_id ?? "") ?? "" }))}
      />
    </div>
  );
}
