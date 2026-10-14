import { cookies } from "next/headers";
import { ROLES } from "@/lib/roles";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_VUE, emailEffectif } from "@/lib/vueRole";

/**
 * Adresse effective du compte connecté : celle du profil sur lequel le Webmestre a basculé sa vue. La base fait foi
 * (ma_vue_webmestre : seul le vrai Webmestre en a une, et il reçoit alors tous les droits de ce profil) ; si la base
 * ne répond pas, on retombe sur le cookie comme avant.
 */
export async function emailVue(emailReel: string | null | undefined, webmestre?: boolean): Promise<string | undefined> {
  if (!emailReel) return undefined;
  const { data, error } = await (await createClient()).rpc("ma_vue_webmestre");
  if (!error) return (typeof data === "string" && ROLES.find((r) => r.slug === data)?.email) || emailReel;
  return emailEffectif(emailReel, (await cookies()).get(COOKIE_VUE)?.value, webmestre);
}

/** Remet la vue du Webmestre sur son propre profil (sans effet pour les autres comptes). */
export async function reinitialiserVueWebmestre(): Promise<void> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("est_webmestre");
  if (data === true) await supabase.rpc("webmestre_vue_definir", { p_profil: null });
}
