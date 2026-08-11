import PageHeader from "@/components/PageHeader";
import Priorites from "@/components/Priorites";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import { peutVoirEvenement, type Evenement } from "@/lib/evenements";
import type { Tache } from "@/lib/taches";

export default async function PrioritesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(user?.email);
  const slug = role?.slug ?? "";

  // Tâches du rôle courant (chaque rôle a sa liste).
  const { data: tachesData } = await supabase
    .from("taches")
    .select("*")
    .eq("role", slug)
    .order("ordre", { ascending: true })
    .order("created_at", { ascending: true });

  // Événements : on charge tout puis on filtre par groupe visible (petite table).
  const { data: evData } = await supabase
    .from("evenements")
    .select("*")
    .order("date_debut", { ascending: true });
  const evenements = ((evData ?? []) as Evenement[]).filter((e) => peutVoirEvenement(e, slug));

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Priorités"
        subtitle={`Votre matrice d'Eisenhower${role ? ` — ${role.label}` : ""} et le calendrier partagé.`}
      />
      <Priorites
        roleSlug={slug}
        tachesInit={(tachesData ?? []) as Tache[]}
        evenements={evenements}
      />
    </div>
  );
}
