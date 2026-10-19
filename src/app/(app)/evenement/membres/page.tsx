import PageHeader from "@/components/PageHeader";
import ListeMembres from "@/components/evenement/ListeMembres";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { MembreEvenement } from "@/lib/evenement";

/** Bénévoles du profil Événementiel : liste, ajout (crée le compte), modification du nom et du courriel. */
export default async function MembresEvenementPage() {
  const { supabase, peutModifier } = await sessionEvenement();
  const { data: liste } = await supabase.from("evenement_membres").select("id, libelle, prenom, nom, courriel").order("ordre", { ascending: true, nullsFirst: false }).order("libelle");
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <PageHeader title="Bénévoles" />
      <ListeMembres peutModifier={peutModifier} membres={(liste ?? []) as MembreEvenement[]} />
    </div>
  );
}
