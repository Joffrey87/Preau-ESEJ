import PageHeader from "@/components/PageHeader";
import AxesRecherche from "@/components/AxesRecherche";
import { BadgePrenom, PrenomProvider } from "@/components/PrenomRecherche";
import { createClient } from "@/lib/supabase/server";
import { contexteRecherche } from "@/lib/rechercheServeur";
import type { Action, Idee } from "@/lib/rechercheFonds";

export default async function AxesRecherchePage() {
  const supabase = await createClient();
  const [ctx, ideesRes, actionsRes] = await Promise.all([
    contexteRecherche(supabase),
    supabase.from("recherche_idees").select("*").is("supprime_le", null).order("pilier").order("ordre"),
    supabase.from("recherche_actions").select("*"),
  ]);

  return (
    <PrenomProvider partage={ctx.partage} prenomProfil={ctx.prenomProfil}>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <PageHeader
          title="Axes de recherche"
          subtitle="Les pistes de financement du plan V3.2, à enrichir et à arbitrer ensemble."
          action={<BadgePrenom />}
        />
        <AxesRecherche idees={(ideesRes.data ?? []) as Idee[]} actions={(actionsRes.data ?? []) as Action[]} />
      </div>
    </PrenomProvider>
  );
}
