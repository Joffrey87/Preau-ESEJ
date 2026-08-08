import PageHeader from "@/components/PageHeader";
import GestionScolarite, { type Inscription } from "@/components/GestionScolarite";
import { createClient } from "@/lib/supabase/server";

export default async function ScolaritePage({
  searchParams,
}: {
  searchParams: Promise<{ annee?: string }>;
}) {
  const supabase = await createClient();
  const { annee: anneeParam } = await searchParams;

  // Années disponibles (barème + inscriptions), plus récente en tête.
  const [baremeAnneesRes, inscAnneesRes] = await Promise.all([
    supabase.from("scolarite_bareme").select("annee_scolaire"),
    supabase.from("scolarite_inscriptions").select("annee_scolaire"),
  ]);
  const annees = Array.from(
    new Set([
      ...(baremeAnneesRes.data ?? []).map((r) => r.annee_scolaire),
      ...(inscAnneesRes.data ?? []).map((r) => r.annee_scolaire),
    ]),
  ).sort((a, b) => b.localeCompare(a));

  const annee = anneeParam && annees.includes(anneeParam) ? anneeParam : annees[0] ?? "";

  const [inscriptionsRes, baremeRes] = await Promise.all([
    supabase
      .from("scolarite_inscriptions")
      .select("*")
      .eq("annee_scolaire", annee)
      .order("famille_nom"),
    supabase
      .from("scolarite_bareme")
      .select("nb_enfants, montant_mensuel")
      .eq("annee_scolaire", annee),
  ]);

  const bareme: Record<number, number> = {};
  for (const b of baremeRes.data ?? []) bareme[b.nb_enfants] = Number(b.montant_mensuel);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Frais de scolarité"
        subtitle="Suivi des paiements par famille : dû, réglé, reste à percevoir et mois d'avance."
      />
      {annees.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-16 text-center text-muted">
          Aucune donnée de scolarité.
        </div>
      ) : (
        <GestionScolarite
          annee={annee}
          annees={annees}
          inscriptions={(inscriptionsRes.data ?? []) as Inscription[]}
          bareme={bareme}
        />
      )}
    </div>
  );
}
