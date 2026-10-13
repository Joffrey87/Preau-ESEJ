import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import FacturesFournisseurs, { type CategorieDepense } from "@/components/evenement/FacturesFournisseurs";
import { sessionEvenement } from "@/lib/evenementServeur";
import { formatDate, formatEuros } from "@/lib/format";
import { recettes, type ContactEvenement, type EvenementCaisse, type FactureFournisseur } from "@/lib/evenement";

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
  const [{ data: factures }, { data: fournisseurs }, { data: evenements }, { data: categories }, { data: resp }] = await Promise.all([
    supabase.from("factures_fournisseurs").select("*").eq("evenement_id", id).order("date", { ascending: false }),
    supabase.from("contacts_evenement").select("*").order("nom"),
    supabase.from("evenements_caisse").select("id, nom, date").order("date", { ascending: false }),
    supabase.rpc("categories_depense_facture"),
    e.responsable_id
      ? supabase.from("evenement_membres").select("libelle").eq("id", e.responsable_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const liste = (factures ?? []) as FactureFournisseur[];
  const depenses = liste.reduce((t, f) => t + Number(f.montant), 0);
  const r = recettes(e);
  const euros = (v: number | null) => (v == null ? "—" : formatEuros(Number(v)));
  const cartes: { l: string; v: string; cls?: string }[] = [
    { l: "Dépenses", v: formatEuros(depenses), cls: "text-negative" },
    { l: "Recettes", v: euros(r), cls: "text-positive" },
    { l: "Solde", v: r == null ? "—" : formatEuros(r - depenses) },
    { l: "Caisse avant", v: euros(e.caisse_avant) },
    { l: "Caisse après", v: euros(e.caisse_apres) },
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
