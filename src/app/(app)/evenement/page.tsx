import PageHeader from "@/components/PageHeader";
import ListeEvenements from "@/components/evenement/ListeEvenements";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { EvenementCaisse, MembreEvenement } from "@/lib/evenement";

/** Événements : nom, date, responsable de caisse, caisse avant / après et recettes. */
export default async function EvenementsPage() {
  const { supabase, peutModifier } = await sessionEvenement();
  const [{ data: membres }, { data: evenements }] = await Promise.all([
    supabase.from("evenement_membres").select("id, libelle, prenom, nom, courriel").order("libelle"),
    supabase.from("evenements_caisse").select("id, nom, date, responsable_id, caisse_avant, caisse_apres").order("date", { ascending: false }),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader title="Événements" subtitle="Les événements et leur caisse : les recettes = caisse après − caisse avant." />
      <ListeEvenements
        peutModifier={peutModifier}
        membres={(membres ?? []).map((m) => ({ ...m, famille: null })) as MembreEvenement[]}
        evenements={(evenements ?? []) as EvenementCaisse[]}
      />
    </div>
  );
}
