import PageHeader from "@/components/PageHeader";
import GestionPistes from "@/components/GestionPistes";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import { PARAMS } from "@/lib/segments";
import type { Financement } from "@/lib/financements";

export default async function FinancementPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(user?.email)?.slug ?? null;

  const { data } = await supabase
    .from("financements")
    .select("*")
    .order("echeance", { ascending: true, nullsFirst: false });

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Financement"
        subtitle="Pistes de financement au-delà des dons : entreprises, fondations, subventions, événements, legs."
      />

      <div className="mb-5 rounded-xl border border-dashed border-border bg-surface-2 px-5 py-4 text-sm text-muted">
        Diversifier les ressources réduit la dépendance aux grands donateurs (concentration des 5 premiers &lt;{" "}
        {PARAMS.concentrationTop5Max} %). Objectif de collecte annuelle :{" "}
        <strong className="text-foreground">≥ {PARAMS.collecteCible.toLocaleString("fr-FR")} €</strong>. Chaque piste
        suit son cycle : piste → contacté → dossier → déposé → obtenu.
      </div>

      <GestionPistes financements={(data ?? []) as Financement[]} roleSlug={roleSlug} />
    </div>
  );
}
