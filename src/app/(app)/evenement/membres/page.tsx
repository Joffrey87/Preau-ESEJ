import PageHeader from "@/components/PageHeader";
import ListeMembres from "@/components/evenement/ListeMembres";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { MembreEvenement } from "@/lib/evenement";

/** Membres du profil Événement : liste, ajout (crée le compte), modification du nom et du courriel. */
export default async function MembresEvenementPage() {
  const { supabase, peutModifier } = await sessionEvenement();
  // La famille reliée passe par une fonction : le profil Événement ne lit pas la table familles.
  const [{ data: liste }, { data: familles }] = await Promise.all([
    supabase.from("evenement_membres").select("id, libelle, prenom, nom, courriel").order("libelle"),
    supabase.rpc("familles_membres_evenement"),
  ]);
  const parMembre = new Map(
    ((familles ?? []) as { membre_id: string; famille: string; membre_recherche: string | null }[]).map((f) => [f.membre_id, f]),
  );
  const membres = (liste ?? []).map((m) => {
    const f = parMembre.get(m.id as string);
    return { ...m, famille: f ? { nom: f.famille, membre_recherche: f.membre_recherche } : null };
  });
  return (
    <div className="mx-auto max-w-4xl px-5 py-8 md:px-8">
      <PageHeader title="Membres" subtitle="Chaque membre se connecte avec le bouton « Événement », son prénom et son prénom comme mot de passe." />
      <ListeMembres peutModifier={peutModifier} membres={membres as MembreEvenement[]} />
    </div>
  );
}
