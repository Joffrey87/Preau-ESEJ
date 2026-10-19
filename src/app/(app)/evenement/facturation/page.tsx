import PageHeader from "@/components/PageHeader";
import type { RibAttente } from "@/components/evenement/ImportRib";
import FacturesFournisseurs, { type CategorieDepense, type MouvementCaisseFacture } from "@/components/evenement/FacturesFournisseurs";
import { sessionEvenement } from "@/lib/evenementServeur";
import type { ContactEvenement, EvenementCaisse, FactureFournisseur } from "@/lib/evenement";

/** Facturation : factures des fournisseurs pour les événements. */
export default async function FacturationEvenementPage() {
  const { supabase, peutModifier, estTresorier, peutImporterRib } = await sessionEvenement();
  const [{ data: factures }, { data: fournisseurs }, { data: evenements }, { data: categories }, { data: gEcole }, { data: gEv }, { data: mouvements }, { data: ribs }] = await Promise.all([
    supabase.from("factures_fournisseurs").select("*").order("date", { ascending: false }),
    supabase.from("contacts_evenement").select("*").order("nom"),
    supabase.from("evenements_caisse").select("id, nom, date").order("date", { ascending: false }),
    supabase.rpc("categories_depense_facture"),
    supabase.rpc("facture_domaine_gerable", { p_domaine: "ecole" }),
    supabase.rpc("facture_domaine_gerable", { p_domaine: "evenement" }),
    // Sorties de caisse (espèces) pour régler une facture.
    supabase.from("caisse_mouvements").select("id, caisse_id, date, libelle, montant, caisses(cle, nom)").lt("montant", 0).order("date", { ascending: false }).limit(200),
    estTresorier ? supabase.rpc("ribs_a_confirmer") : Promise.resolve({ data: [] }),
  ]);
  const domainesGerables = [gEcole === true ? "ecole" : null, gEv === true ? "evenement" : null].filter(Boolean) as ("ecole" | "evenement")[];
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Facturation" />
      <FacturesFournisseurs
        peutImporterRib={peutImporterRib}
        ribsAConfirmer={(ribs ?? []) as RibAttente[]}
        peutModifier={peutModifier}
        estTresorier={estTresorier}
        factures={(factures ?? []) as FactureFournisseur[]}
        fournisseurs={(fournisseurs ?? []) as ContactEvenement[]}
        categories={(categories ?? []) as CategorieDepense[]}
        evenements={(evenements ?? []) as Pick<EvenementCaisse, "id" | "nom" | "date">[]}
        domainesGerables={domainesGerables}
        mouvementsCaisse={((mouvements ?? []) as unknown as MouvementCaisseFacture[]).map((m) => ({ ...m, montant: Number(m.montant) }))}
      />
    </div>
  );
}
