// Aperçu de l'espace d'une famille par le bureau : un cookie désigne la
// famille regardée. Il ne donne aucun droit par lui-même : la base ne renvoie
// l'espace d'une famille qu'aux rôles du bureau (`espace_famille_apercu`).

import { cookies } from "next/headers";
import type { User } from "@supabase/supabase-js";

export const COOKIE_APERCU = "apercu_famille";

/** Famille regardée en aperçu (compte du bureau seulement), ou null. */
export async function familleEnApercu(user: User | null): Promise<string | null> {
  if (!user || (user.app_metadata as { espace?: string } | undefined)?.espace === "famille") return null;
  return (await cookies()).get(COOKIE_APERCU)?.value ?? null;
}
