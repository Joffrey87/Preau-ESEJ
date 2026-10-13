import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import FacturesFournisseurs, { type CategorieDepense } from "@/components/evenement/FacturesFournisseurs";
import { sessionEvenement } from "@/lib/evenementServeur";
import { formatDate, formatEuros } from "@/lib/format";
import RecettesEvenement from "@/components/evenement/RecettesEvenement";
import { recettes, type ContactEvenement, type OperationCandidate, type RecetteEvenement, type EvenementCaisse, type FactureFournisseur } from "@/lib/evenement";

/** Vue d'un événement : factures rattachées, total des dépenses, caisse et recettes. */
export default async function EvenementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { supabase, peutModifier, estTresorier } = await sessionEvenement();
  const { data: ev } = await supabase
    .from("evenements_caisse")
    .select("id, nom, date, responsable_id, caisse_avant, caisse_apres")
    .eq("id", id)
    .maybeSingle();
  if (!ev) notFound();
  const e = ev as EvenementCaisse;
  const debut = new Date(Date.parse(e.date) - 60 * 86400000).toISOString().slice(0, 10);
  const fin = new Date(Date.parse(e.date) + 90 * 86400000).toISOString().slice(0, 10);
  const [{ data: factures }, { data: fournisseurs }, { data: evenements }, { data: categories }, { data: resp }, { data: lignes }, { data: ops }] = await Promise.all([
    supabase.from("factures_fournisseurs").select("*").eq("evenement_id", id).order("date", { ascending: false }),
    supabase.from("contacts_evenement").select("*").order("nom"),
    supabase.from("evenements_caisse").select("id, nom, date").order("date", { ascending: false }),
    supabase.rpc("categories_depense_facture"),
    e.responsable_id
      ? supabase.from("evenement_membres").select("libelle").eq("id", e.responsable_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("evenement_recettes").select("*").eq("evenement_id", id).order("date"),
    estTresorier
      ? supabase.from("operations").select("id, date_operation, libelle, libelle_origine, montant")
          .gt("montant", 0).gte("date_operation", debut).lte("date_operation", fin).order("date_operation")
      : Promise.resolve({ data: [] }),
  ]);
  const manuelles = (lignes ?? []) as RecetteEvenement[];
  const parMode = (m: string) => manuelles.filter((x) => x.mode === m).reduce((t, x) => t + Number(x.montant), 0);
  const liste = (factures ?? []) as FactureFournisseur[];
  const depenses = liste.reduce((t, f) => t + Number(f.montant), 0);
  const r = recettes(e);
  const euros = (v: number | null) => (v == null ? "—" : formatEuros(Number(v)));
  const totalRecettes = (r ?? 0) + parMode("cheque") + parMode("carte") + parMode("autre");
  const cartes: { l: string; v: string; cls?: string }[] = [
    { l: "Dépenses", v: formatEuros(depenses), cls: "text-negative" },
    { l: "Recettes", v: formatEuros(totalRecettes), cls: "text-positive" },
    { l: "Bénéfice", v: formatEuros(totalRecettes - depenses), cls: totalRecettes - depenses < 0 ? "text-negative" : "" },
    { l: "Caisse avant", v: euros(e.caisse_avant) },
    { l: "Caisse après", v: euros(e.caisse_apres) },
  ];
  const detail = [
    { l: "Caisse", v: euros(r) },
    { l: "Chèque", v: formatEuros(parMode("cheque")) },
    { l: "Carte", v: formatEuros(parMode("carte")) },
    { l: "Autre", v: formatEuros(parMode("autre")) },
  ];
  return (
    <div className="mx-auto max-w-6xl space-y-6 px-5 py-8 md:px-8">
      <Link href="/evenement" className="text-sm text-accent hover:underline">
        ← Événements
      </Link>
      <PageHeader
        title={e.nom}
        subtitle={`${formatDate(e.date)} · Responsable de caisse : ${(resp as { libelle: string } | null)?.libelle ?? "—"}`}
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {cartes.map((c) => (
          <div key={c.l} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted">{c.l}</div>
            <div className={`text-lg font-semibold ${c.cls ?? ""}`}>{c.v}</div>
          </div>
        ))}
      </div>
      <h2 className="font-semibold">Recettes</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {detail.map((c) => (
          <div key={c.l} className="rounded-xl border border-border bg-surface px-4 py-2">
            <div className="text-xs text-muted">{c.l}</div>
            <div className="font-semibold">{c.v}</div>
          </div>
        ))}
      </div>
      <RecettesEvenement
        evenementId={id}
        recettes={manuelles}
        operations={(ops ?? []) as OperationCandidate[]}
        peutModifier={peutModifier}
        estTresorier={estTresorier}
      />
      <h2 className="font-semibold">Factures ({liste.length})</h2>
      <FacturesFournisseurs
        peutModifier={peutModifier}
        estTresorier={estTresorier}
        factures={liste}
        fournisseurs={(fournisseurs ?? []) as ContactEvenement[]}
        evenements={(evenements ?? []) as Pick<EvenementCaisse, "id" | "nom" | "date">[]}
        evenementFixe={id}
        categories={(categories ?? []) as CategorieDepense[]}
      />
    </div>
  );
}
