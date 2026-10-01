import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { COOKIE_PRENOM, roleByEmail } from "@/lib/roles";

/**
 * Qui agit dans les onglets de recherche de fonds : le profil partagé choisit
 * son prénom dans l'application ; Président et Trésorier agissent sous le
 * prénom de leur profil (Paramètres → Mon profil), à défaut sous leur rôle.
 */
export async function contexteRecherche(supabase: SupabaseClient) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(user?.email);
  const meta = (user?.user_metadata ?? {}) as { prenom?: string };
  const partage = role?.slug === "recherche-fonds";
  const cookie = (await cookies()).get(COOKIE_PRENOM)?.value;
  return {
    partage,
    // Profil partagé : le prénom choisi à l'accès (non modifiable ensuite).
    prenomProfil: partage ? (cookie ? decodeURIComponent(cookie) : null) : meta.prenom?.trim() || role?.label || null,
    estTresorerie: role?.slug === "president" || role?.slug === "tresorier",
  };
}
