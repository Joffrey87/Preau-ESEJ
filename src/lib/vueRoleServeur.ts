import { cookies } from "next/headers";
import { COOKIE_VUE, emailEffectif } from "@/lib/vueRole";

/** Adresse effective du compte connecté (profil simulé pour le Trésorier, le cas échéant). */
export async function emailVue(emailReel: string | null | undefined, webmestre?: boolean): Promise<string | undefined> {
  return emailEffectif(emailReel, (await cookies()).get(COOKIE_VUE)?.value, webmestre);
}
