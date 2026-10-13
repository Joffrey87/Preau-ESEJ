import PageHeader from "@/components/PageHeader";
import ListeMembres from "@/components/evenement/ListeMembres";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { MembreEvenement } from "@/lib/evenement";

/** Membres du profil Événement : liste, ajout (crée le compte), modification du nom et du courriel. */
export default async function MembresEvenementPage() {
  const { supabase, peutModifier } = await sessionEvenement();
  const { data: membres } = await supabase
    .from("evenement_membres")
    .select("id, libelle, prenom, nom, courriel, famille:familles(nom, membre_recherche)")
    .order("libelle");
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <PageHeader title="Membres" subtitle="Chaque membre se connecte avec le bouton « Événement », son prénom et son prénom comme mot de passe." />
      <ListeMembres peutModifier={peutModifier} membres={(membres ?? []) as unknown as MembreEvenement[]} />
    </div>
  );
}
