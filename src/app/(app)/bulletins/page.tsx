import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
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
  const directrice = roleByEmail(user?.email)?.slug === "directrice";
  const { data: moi } = await supabase.from("enseignants").select("id").eq("user_id", user?.id ?? "").maybeSingle();
  const initial = await searchParams;
  return <Bulletins directrice={directrice} enseignantId={(moi?.id as string | undefined) ?? null} initial={initial} />;
}
