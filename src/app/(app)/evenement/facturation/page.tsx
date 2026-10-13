import PageHeader from "@/components/PageHeader";
import FacturesFournisseurs from "@/components/evenement/FacturesFournisseurs";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { ContactEvenement, EvenementCaisse, FactureFournisseur } from "@/lib/evenement";

/** Facturation : factures des fournisseurs pour les événements. */
export default async function FacturationEvenementPage() {
  const { supabase, peutModifier, estTresorier } = await sessionEvenement();
  const [{ data: factures }, { data: fournisseurs }, { data: evenements }] = await Promise.all([
    supabase.from("factures_fournisseurs").select("*").order("date", { ascending: false }),
    supabase.from("contacts_evenement").select("*").order("nom"),
    supabase.from("evenements_caisse").select("id, nom, date").order("date", { ascending: false }),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Facturation"
        subtitle="Factures des fournisseurs. « Payée » se pose automatiquement quand le Trésorier relie l'opération bancaire."
      />
      <FacturesFournisseurs
        peutModifier={peutModifier}
        estTresorier={estTresorier}
        factures={(factures ?? []) as FactureFournisseur[]}
        fournisseurs={(fournisseurs ?? []) as ContactEvenement[]}
        evenements={(evenements ?? []) as Pick<EvenementCaisse, "id" | "nom" | "date">[]}
      />
    </div>
  );
}
