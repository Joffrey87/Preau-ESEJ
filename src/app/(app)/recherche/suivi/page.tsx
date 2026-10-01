import PageHeader from "@/components/PageHeader";
import SuiviActions from "@/components/SuiviActions";
import { BadgePrenom, PrenomProvider } from "@/components/PrenomRecherche";
import { createClient } from "@/lib/supabase/server";
import { contexteRecherche } from "@/lib/rechercheServeur";
import type { Action, EcritureLiee, Etape, Idee, NoteJournal } from "@/lib/rechercheFonds";

export default async function SuiviActionsPage({ searchParams }: { searchParams: Promise<{ action?: string }> }) {
  const { action } = await searchParams;
  const supabase = await createClient();
  const [ctx, actionsRes, ideesRes, etapesRes, journalRes, ecrituresRes] = await Promise.all([
    contexteRecherche(supabase),
    supabase.from("recherche_actions").select("*").order("modifie_le", { ascending: false }),
    supabase.from("recherche_idees").select("*").is("supprime_le", null),
    supabase.from("recherche_etapes").select("*").order("ordre"),
    supabase.from("recherche_journal").select("*"),
    supabase.from("recherche_operations").select("*").order("date_operation"),
  ]);

  return (
    <PrenomProvider partage={ctx.partage} prenomProfil={ctx.prenomProfil}>
      <div className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <PageHeader
          title="Suivi des actions"
          subtitle="Une fiche par idée retenue : porteur, contributeurs, étapes, résultats."
          action={<BadgePrenom />}
        />
        <SuiviActions
          donnees={{
            actions: (actionsRes.data ?? []).map((a) => ({ ...a, contributeurs: a.contributeurs ?? [] })) as Action[],
            idees: (ideesRes.data ?? []) as Idee[],
            etapes: (etapesRes.data ?? []) as Etape[],
            journal: (journalRes.data ?? []) as NoteJournal[],
            ecritures: (ecrituresRes.data ?? []) as EcritureLiee[],
          }}
          actionInitiale={action ?? null}
          estTresorerie={ctx.estTresorerie}
        />
      </div>
    </PrenomProvider>
  );
}
