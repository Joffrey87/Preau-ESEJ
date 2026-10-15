import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import { emailVue } from "@/lib/vueRoleServeur";
import Bulletins from "@/components/bulletins/Bulletins";

// Bulletins : la Directrice (tout), la titulaire d'une classe (toutes ses matières, mention, appréciation),
// un intervenant (sa matière). Les droits réels sont tenus par la base (RLS) ; la page n'en est que le reflet.
export default async function BulletinsPage({
  searchParams,
}: {
  searchParams: Promise<{ classe?: string; periode?: string; onglet?: string; bulletin?: string }>;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  // Profil affiché (vue du Webmestre comprise) : le Webmestre en vue Directrice voit exactement l'écran de la Directrice.
  const slug = roleByEmail(await emailVue(user?.email))?.slug;
  const directrice = slug === "directrice";
  const { data: moi } = await supabase.from("enseignants").select("id").eq("user_id", user?.id ?? "").maybeSingle();
  const initial = await searchParams;
  return <Bulletins directrice={directrice} matiereSeule={slug === "directeur-spirituel" ? "Catéchisme" : undefined} enseignantId={(moi?.id as string | undefined) ?? null} initial={initial} />;
}
