import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";

/** Session des pages Événementiel : membres Événementiel et Trésorier modifient ; Président et Directrice lisent. */
export async function sessionEvenement() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const estEvenement = (user.app_metadata as { espace?: string } | undefined)?.espace === "evenement";
  const estTresorier = roleByEmail(user.email)?.slug === "tresorier";
  return { supabase, user, peutModifier: estEvenement || estTresorier, estTresorier };
}
