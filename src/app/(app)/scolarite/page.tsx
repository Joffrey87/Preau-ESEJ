import PageHeader from "@/components/PageHeader";
import GestionScolarite, {
  type Inscription,
  type AffectationRecue,
} from "@/components/GestionScolarite";
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

  // Dons d'association fléchés vers les familles de cette année scolaire.
  // Deux requêtes plutôt qu'une jointure : PostgREST ne connaît une relation
  // qu'après rechargement de son cache de schéma, ce qui rend l'imbrication
  // fragile juste après une migration.
  const idsInscriptions = (inscriptionsRes.data ?? []).map((i) => (i as Inscription).id);
  let affectations: AffectationRecue[] = [];
  if (idsInscriptions.length > 0) {
    const { data: affData, error: affErr } = await supabase
      .from("affectations_scolarite")
      .select("inscription_id, operation_id, montant")
      .in("inscription_id", idsInscriptions);

    if (affErr) {
      console.error("Lecture des affectations impossible :", affErr.message);
    }

    const brutes = (affData ?? []) as {
      inscription_id: string;
      operation_id: string;
      montant: number;
    }[];

    // Libellé et date de l'opération d'origine, pour l'infobulle.
    const parOperation = new Map<string, { libelle: string; date_operation: string }>();
    if (brutes.length > 0) {
      const { data: opsData } = await supabase
        .from("operations")
        .select("id, libelle, date_operation")
        .in("id", [...new Set(brutes.map((a) => a.operation_id))]);
      for (const o of (opsData ?? []) as { id: string; libelle: string; date_operation: string }[]) {
        parOperation.set(o.id, { libelle: o.libelle, date_operation: o.date_operation });
      }
    }

    affectations = brutes.map((a) => ({
      inscription_id: a.inscription_id,
      montant: Number(a.montant),
      libelle: parOperation.get(a.operation_id)?.libelle ?? "Don d'association",
      date_operation: parOperation.get(a.operation_id)?.date_operation ?? "",
    }));
  }

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
          affectations={affectations}
        />
      )}
    </div>
  );
}
