import type { SupabaseClient } from "@supabase/supabase-js";
import { roleByEmail } from "@/lib/roles";

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
  return {
    partage: role?.slug === "recherche-fonds",
    prenomProfil: meta.prenom?.trim() || role?.label || null,
    estTresorerie: role?.slug === "president" || role?.slug === "tresorier",
  };
}
