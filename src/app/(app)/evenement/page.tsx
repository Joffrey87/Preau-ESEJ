import PageHeader from "@/components/PageHeader";
import ListeEvenements from "@/components/evenement/ListeEvenements";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { EvenementCaisse, MembreEvenement } from "@/lib/evenement";

/** Événements : nom, date, responsable de caisse, caisse avant / après et recettes. */
export default async function EvenementsPage() {
  const { supabase, peutModifier, estTresorier, estResponsable } = await sessionEvenement();
  const [{ data: membres }, { data: evenements }, { data: demandes }] = await Promise.all([
    supabase.from("evenement_membres").select("id, libelle, prenom, nom, courriel").order("ordre", { ascending: true, nullsFirst: false }).order("libelle"),
    supabase.from("evenements_caisse").select("id, nom, date, responsable_id, caisse_avant, caisse_apres").order("date", { ascending: false }),
    supabase.from("demandes_suppression").select("cible_id").eq("cible", "evenement").eq("statut", "en_attente"),
  ]);
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader title="Événements" />
      <ListeEvenements
        peutModifier={peutModifier}
        peutSupprimer={estResponsable || estTresorier}
        demandesEnAttente={(demandes ?? []).map((d) => d.cible_id as string)}
        membres={(membres ?? []) as MembreEvenement[]}
        evenements={(evenements ?? []) as EvenementCaisse[]}
      />
    </div>
  );
}
