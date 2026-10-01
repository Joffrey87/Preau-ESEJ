import PageHeader from "@/components/PageHeader";
import AxesRecherche from "@/components/AxesRecherche";
import { BadgePrenom, PrenomProvider } from "@/components/PrenomRecherche";
import { createClient } from "@/lib/supabase/server";
import { contexteRecherche } from "@/lib/rechercheServeur";
import { nonRetenueExpiree, type Action, type Idee } from "@/lib/rechercheFonds";

export default async function AxesRecherchePage() {
  const supabase = await createClient();
  const [ctx, ideesRes, actionsRes] = await Promise.all([
    contexteRecherche(supabase),
    supabase.from("recherche_idees").select("*").is("supprime_le", null).order("pilier").order("ordre"),
    supabase.from("recherche_actions").select("*"),
  ]);

  // Une idée non retenue disparaît de l'onglet trois semaines après la décision.
  const idees = ((ideesRes.data ?? []) as Idee[]).filter((i) => !nonRetenueExpiree(i));

  return (
    <PrenomProvider partage={ctx.partage} prenomProfil={ctx.prenomProfil}>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <PageHeader
          title="Axes de recherche"
          action={<BadgePrenom />}
        />
        <AxesRecherche idees={idees} actions={(actionsRes.data ?? []) as Action[]} />
      </div>
    </PrenomProvider>
  );
}
