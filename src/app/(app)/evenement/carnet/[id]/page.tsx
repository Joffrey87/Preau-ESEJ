import Link from "next/link";
import { notFound } from "next/navigation";
import PageHeader from "@/components/PageHeader";
import FicheContactEvenement from "@/components/evenement/FicheContactEvenement";
import FacturesFournisseurs from "@/components/evenement/FacturesFournisseurs";
import { sessionEvenement } from "@/lib/evenementServeur";
import { formatDate, formatEuros } from "@/lib/format";
import { STATUTS_FACTURE, nomContact, type ContactEvenement, type EvenementCaisse, type FactureFournisseur } from "@/lib/evenement";

/** Fiche d'un fournisseur : coordonnées, factures et statuts, opérations passées (Trésorier uniquement). */
export default async function FicheFournisseurPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, peutModifier, estTresorier } = await sessionEvenement();
  const { data: contact } = await supabase.from("contacts_evenement").select("*").eq("id", id).maybeSingle();
  if (!contact) notFound();
  const [{ data: factures }, { data: evenements }] = await Promise.all([
    supabase.from("factures_fournisseurs").select("*").eq("fournisseur_id", id).order("date", { ascending: false }),
    supabase.from("evenements_caisse").select("id, nom, date").order("date", { ascending: false }),
  ]);
  const liste = (factures ?? []) as FactureFournisseur[];
  // Opérations bancaires liées : la base ne les montre qu'au bureau (le profil Événement n'en voit aucune).
  const idsOps = liste.map((f) => f.operation_id).filter((x): x is string => !!x);
  const { data: operations } =
    estTresorier && idsOps.length
      ? await supabase.from("operations").select("id, date_operation, libelle, montant").in("id", idsOps).order("date_operation", { ascending: false })
      : { data: [] };
  const total = (s: string) => liste.filter((f) => f.statut === s).reduce((t, f) => t + Number(f.montant), 0);
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-8 md:px-8">
      <Link href="/evenement/carnet" className="text-sm text-accent hover:underline">
        ← Carnet d&apos;adresses
      </Link>
      <PageHeader title={nomContact(contact as ContactEvenement)} />
      <FicheContactEvenement contact={contact as ContactEvenement} peutModifier={peutModifier} />
      <div className="grid gap-3 sm:grid-cols-3">
        {STATUTS_FACTURE.map((s) => (
          <div key={s.v} className="rounded-xl border border-border bg-surface p-4">
            <div className="text-xs text-muted">{s.l}</div>
            <div className="text-lg font-semibold">{formatEuros(total(s.v))}</div>
          </div>
        ))}
      </div>
      <h2 className="font-semibold">Factures</h2>
      <FacturesFournisseurs
        peutModifier={peutModifier}
        estTresorier={estTresorier}
        factures={liste}
        fournisseurs={[contact as ContactEvenement]}
        evenements={(evenements ?? []) as Pick<EvenementCaisse, "id" | "nom" | "date">[]}
        fournisseurFixe={id}
      />
      {estTresorier && (
        <section>
          <h2 className="mb-2 font-semibold">Opérations bancaires liées</h2>
          {(operations ?? []).length === 0 ? (
            <p className="text-sm text-muted">Aucune opération liée.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {(operations ?? []).map((o) => (
                <li key={o.id}>
                  {formatDate(o.date_operation)} · {o.libelle} · {formatEuros(Number(o.montant))}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}
