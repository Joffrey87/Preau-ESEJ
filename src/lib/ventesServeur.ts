import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_PRENOM, roleByEmail } from "@/lib/roles";
import { COOKIE_VUE } from "@/lib/vueRole";
import { niveauDuChemin, type ContexteAcces } from "@/lib/acces";
import type { DomaineVente } from "@/lib/ventes";

/**
 * Session des onglets Ventes diverses / Caisses : domaines visibles et droit de modification.
 * Trésorier : tout ; Directrice : École ; comptes Événement : Événement. Le niveau Webmestre (lecture / modification)
 * s'applique par-dessus (la base garde le dernier mot : RLS par domaine).
 */
export async function sessionVentes(page: "/ventes-diverses" | "/caisses") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const estEvenement = (user.app_metadata as { espace?: string } | undefined)?.espace === "evenement";
  const slug = estEvenement ? "evenement" : (roleByEmail(user.email)?.slug ?? "");
  const jar = await cookies();
  const { data: ctx } = await supabase.rpc("acces_contexte", {
    p_vue: jar.get(COOKIE_VUE)?.value ?? null,
    p_personne: decodeURIComponent(jar.get(COOKIE_PRENOM)?.value ?? "") || null,
  });
  const acces = (ctx as ContexteAcces | null) ?? null;
  const niveau = acces ? niveauDuChemin(acces.niveaux, page) : null;
  const estTresorier = slug === "tresorier";
  const domaines: DomaineVente[] = estTresorier ? ["ecole", "evenement"] : slug === "directrice" ? ["ecole"] : estEvenement ? ["evenement"] : [];
  const peutModifier = estTresorier || (domaines.length > 0 && (niveau === null || niveau === "modification"));
  return { supabase, user, slug, estTresorier, domaines, peutModifier };
}
