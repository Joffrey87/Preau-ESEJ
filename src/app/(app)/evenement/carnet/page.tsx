import PageHeader from "@/components/PageHeader";
import CarnetEvenement from "@/components/evenement/CarnetEvenement";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { ContactEvenement } from "@/lib/evenement";

/** Carnet d'adresses du profil Événementiel : fournisseurs et contacts événements uniquement (vue `contacts_evenement`). */
export default async function CarnetEvenementPage() {
  const { supabase, peutModifier } = await sessionEvenement();
  const { data } = await supabase.from("contacts_evenement").select("*").order("nom");
  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader title="Carnet d'adresses" subtitle="Fournisseurs et contacts utiles aux événements." />
      <CarnetEvenement peutModifier={peutModifier} contacts={(data ?? []) as ContactEvenement[]} />
    </div>
  );
}
