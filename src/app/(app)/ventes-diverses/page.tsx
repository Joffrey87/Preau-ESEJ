import { redirect } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import GestionVentesDiverses, { type OperationVente } from "@/components/GestionVentesDiverses";
import { sessionVentes } from "@/lib/ventesServeur";
import type { Payeur, SousCategorie, VenteDue, VentePaiement } from "@/lib/ventes";

/** Ventes diverses : sous-catégories, ventes attendues (dus / payés) et, pour le Trésorier, rattachement bancaire. */
export default async function VentesDiversesPage({ searchParams }: { searchParams: Promise<{ exercice?: string; vue?: string }> }) {
  const { supabase, estTresorier, domaines, peutModifier } = await sessionVentes("/ventes-diverses");
  if (!domaines.length) redirect("/");
  const { exercice: exParam, vue } = await searchParams;

  const { data: exs } = await supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false });
  const exercices = (exs ?? []) as { id: string; libelle: string; date_debut: string; date_fin: string; actif: boolean }[];
  const aujourdhui = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(new Date());
  const exercice =
    exercices.find((e) => e.id === exParam) ??
    exercices.find((e) => e.date_debut <= aujourdhui && aujourdhui <= e.date_fin) ??
    exercices.find((e) => e.actif) ??
    exercices[0];

  const [sc, du, pay] = await Promise.all([
    supabase.from("ventes_sous_categories").select("id, nom, domaine, archive").order("nom"),
    exercice ? supabase.from("ventes_dues").select("*").eq("exercice_id", exercice.id).order("created_at") : Promise.resolve({ data: [] }),
    supabase.from("ventes_paiements").select("id, vente_due_id, montant, type, operation_id, caisse_mouvement_id, created_at"),
  ]);
  const payeursParDomaine = await Promise.all(
    domaines.map(async (d) => ((await supabase.rpc("liste_payeurs_ventes", { p_domaine: d })).data ?? []) as Payeur[]),
  );
  const payeurs = Array.from(new Map(payeursParDomaine.flat().map((p) => [`${p.kind}:${p.id}`, p])).values());

  // Trésorier : recettes bancaires « Ventes diverses » de l'exercice (lignes non ventilées dans la Comptabilité), avec leur ventilation.
  let operations: OperationVente[] = [];
  let ventilations: { id: string; operation_id: string; sous_categorie_id: string; montant: number }[] = [];
  if (estTresorier && exercice) {
    const { data: cats } = await supabase.from("categories").select("id, nom").eq("type", "recette").ilike("nom", "%ventes diverses%");
    const ids = (cats ?? []).map((c) => c.id as string);
    if (ids.length) {
      const { data: ops } = await supabase
        .from("operations")
        .select("id, date_operation, libelle, montant, mode_paiement, categorie_id, est_ventilee, categories(nom)")
        .in("categorie_id", ids)
        .eq("type", "recette")
        .gte("date_operation", exercice.date_debut)
        .lte("date_operation", exercice.date_fin)
        .order("date_operation", { ascending: false });
      operations = ((ops ?? []) as unknown as (OperationVente & { est_ventilee: boolean | null })[])
        .filter((o) => !o.est_ventilee)
        .map((o) => ({ ...o, montant: Number(o.montant) }));
    }
    const { data: v } = await supabase.from("ventes_ventilations").select("id, operation_id, sous_categorie_id, montant");
    ventilations = ((v ?? []) as typeof ventilations).map((x) => ({ ...x, montant: Number(x.montant) }));
  }

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Ventes diverses"
        subtitle={
          !estTresorier && domaines.length > 1
            ? "Ventes École et Événement : ce que chaque famille ou personne doit et a payé."
            : estTresorier
            ? "Sous-catégories École et Événement, ventes attendues et rattachement des paiements bancaires."
            : domaines[0] === "ecole"
              ? "Ventes du domaine École : ce que chaque famille doit et a payé."
              : "Ventes du domaine Événement : ce que chaque famille ou personne doit et a payé."
        }
      />
      <GestionVentesDiverses
        exercices={exercices.map((e) => ({ id: e.id, libelle: e.libelle, date_debut: e.date_debut, date_fin: e.date_fin }))}
        exerciceId={exercice?.id ?? ""}
        domaines={domaines}
        estTresorier={estTresorier}
        peutModifier={peutModifier}
        sousCategories={(sc.data ?? []) as SousCategorie[]}
        dues={((du.data ?? []) as VenteDue[]).map((d) => ({ ...d, montant_attendu: Number(d.montant_attendu) }))}
        paiements={((pay.data ?? []) as VentePaiement[]).map((p) => ({ ...p, montant: Number(p.montant) }))}
        payeurs={payeurs}
        operations={operations}
        ventilations={ventilations}
        vueInitiale={vue === "rattachement" && estTresorier ? "rattachement" : "ventes"}
      />
    </div>
  );
}
