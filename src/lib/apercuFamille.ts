// Aperçu de l'espace d'une famille par le bureau : un cookie désigne la
// famille regardée. Il ne donne aucun droit par lui-même : la base ne renvoie
// l'espace d'une famille qu'aux rôles du bureau (`espace_famille_apercu`).

import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import { emailVue } from "@/lib/vueRoleServeur";

export const COOKIE_APERCU = "apercu_famille";
/** Espace de la famille réservée reliée au compte, ouvert sans changer de compte (voir /famille-liee/entrer). */
export const COOKIE_FAMILLE_LIEE = "famille_liee";

/** Le compte (non famille) consulte-t-il en ce moment l'Espace de sa famille reliée ? */
export async function enFamilleLiee(user: User | null): Promise<boolean> {
  if (!user || (user.app_metadata as { espace?: string } | undefined)?.espace === "famille") return false;
  return (await cookies()).get(COOKIE_FAMILLE_LIEE)?.value === "1";
}

/**
 * Famille dont le bureau consulte l'espace : celle de l'aperçu (cookie), sinon celle rattachée au profil
 * (`familles.profil_lie`, ex. : le Président, parent d'un ancien élève, voit ses paiements dans son propre menu).
 */
export async function familleConsultee(user: User | null): Promise<string | null> {
  return (await familleEnApercu(user)) ?? (await familleDuProfil(user));
}

/** Famille rattachée au profil d'Administration connecté (ou vu), hors aperçu ; null sinon. */
export async function familleDuProfil(user: User | null): Promise<string | null> {
  if (!user || (user.app_metadata as { espace?: string } | undefined)?.espace === "famille") return null;
  // Famille reliée : l'espace se lit comme celui d'une famille (espace_famille), pas en aperçu.
  if (await enFamilleLiee(user)) return null;
  const slug = roleByEmail(await emailVue(user.email))?.slug;
  if (!slug) return null;
  const { data } = await (await createClient()).from("familles").select("id").eq("profil_lie", slug).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Famille regardée en aperçu (compte du bureau seulement), ou null. */
export async function familleEnApercu(user: User | null): Promise<string | null> {
  if (!user || (user.app_metadata as { espace?: string } | undefined)?.espace === "famille") return null;
  if (await enFamilleLiee(user)) return null;
  return (await cookies()).get(COOKIE_APERCU)?.value ?? null;
}
