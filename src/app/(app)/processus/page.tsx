import PageHeader from "@/components/PageHeader";
import GestionFichesAide from "@/components/GestionFichesAide";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import { COLONNES_ACTIVEE, COLONNES_FICHE, ficheDepuisBase, type FicheActivee } from "@/lib/fichesAide";

export default async function ProcessusPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; fiche?: string; onglet?: string }>;
}) {
  const { q, fiche, onglet } = await searchParams;
  const supabase = await createClient();
  const [{ data: { user } }, fichesRes, activeesRes, famillesRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("fiches_aide").select(COLONNES_FICHE).order("titre"),
    supabase.from("fiches_aide_activees").select(COLONNES_ACTIVEE).order("active_le", { ascending: false }),
    supabase.from("familles").select("id, nom"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Processus"
        subtitle="Fiches d'aide : les tâches à accomplir et la bonne manière de les faire, par onglet et par profil."
      />
      <GestionFichesAide
        fiches={((fichesRes.data ?? []) as Record<string, unknown>[]).map(ficheDepuisBase)}
        activees={(activeesRes.data ?? []) as FicheActivee[]}
        familles={(famillesRes.data ?? []) as { id: string; nom: string }[]}
        profil={roleByEmail(user?.email)?.slug ?? ""}
        rechercheInitiale={q ?? ""}
        ficheInitiale={fiche ?? null}
        ongletInitial={onglet ?? ""}
      />
    </div>
  );
}
