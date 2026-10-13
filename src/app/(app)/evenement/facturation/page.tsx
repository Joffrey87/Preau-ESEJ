import PageHeader from "@/components/PageHeader";
import FacturesFournisseurs, { type CategorieDepense } from "@/components/evenement/FacturesFournisseurs";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { ContactEvenement, EvenementCaisse, FactureFournisseur } from "@/lib/evenement";

/** Facturation : factures des fournisseurs pour les événements. */
export default async function FacturationEvenementPage() {
  const { supabase, peutModifier, estTresorier } = await sessionEvenement();
  const [{ data: factures }, { data: fournisseurs }, { data: evenements }, { data: categories }] = await Promise.all([
    supabase.from("factures_fournisseurs").select("*").order("date", { ascending: false }),
    supabase.from("contacts_evenement").select("*").order("nom"),
    supabase.from("evenements_caisse").select("id, nom, date").order("date", { ascending: false }),
    supabase.rpc("categories_depense_facture"),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Facturation" />
      <FacturesFournisseurs
        peutModifier={peutModifier}
        estTresorier={estTresorier}
        factures={(factures ?? []) as FactureFournisseur[]}
        fournisseurs={(fournisseurs ?? []) as ContactEvenement[]}
        categories={(categories ?? []) as CategorieDepense[]}
        evenements={(evenements ?? []) as Pick<EvenementCaisse, "id" | "nom" | "date">[]}
      />
    </div>
  );
}
