import PageHeader from "@/components/PageHeader";
import GestionComptes from "@/components/GestionComptes";
import GestionCategories from "@/components/GestionCategories";
import GestionExercices from "@/components/GestionExercices";
import GestionOrganisation, { type Organisation } from "@/components/GestionOrganisation";
import MonProfil from "@/components/MonProfil";
import SecuriteDonnees from "@/components/SecuriteDonnees";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";

export default async function ParametresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(user?.email);
  const meta = (user?.user_metadata ?? {}) as { prenom?: string; nom?: string };

  const [comptesRes, categoriesRes, exercicesRes, organisationRes] = await Promise.all([
    supabase.from("comptes").select("id, nom, type, solde_initial, ordre, archive").order("ordre"),
    supabase.from("categories").select("id, nom, type, ordre, archive").order("type").order("ordre").order("nom"),
    supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false }),
    supabase.from("organisation").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Paramètres"
        subtitle="Comptes, catégories et exercices comptables."
      />

      <div className="space-y-10">
        <MonProfil prenom={meta.prenom ?? ""} nom={meta.nom ?? ""} roleLabel={role?.label ?? "—"} />
        <SecuriteDonnees />
        <GestionOrganisation organisation={(organisationRes.data ?? null) as Organisation | null} />
        <GestionExercices exercices={exercicesRes.data ?? []} />
        <GestionComptes comptes={comptesRes.data ?? []} />
        <GestionCategories categories={categoriesRes.data ?? []} />
      </div>
    </div>
  );
}
