import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { COOKIE_PRENOM } from "@/lib/roles";
import { COOKIE_VUE } from "@/lib/vueRole";
import { niveauDuChemin, type ContexteAcces } from "@/lib/acces";
import type { DomaineVente } from "@/lib/ventes";

/**
 * Session des onglets Ventes diverses / Caisses : domaines (réglés par le Webmestre ; Trésorier = les deux)
 * et droit de modification (niveau Webmestre lecture / modification).
 */
export async function sessionVentes(page: "/ventes-diverses" | "/caisses") {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  const jar = await cookies();
  const { data: ctx } = await supabase.rpc("acces_contexte", {
    p_vue: jar.get(COOKIE_VUE)?.value ?? null,
    p_personne: decodeURIComponent(jar.get(COOKIE_PRENOM)?.value ?? "") || null,
  });
  const acces = (ctx as ContexteAcces | null) ?? null;
  const niveau = acces ? niveauDuChemin(acces.niveaux, page) : null;
  const [{ data: doms }, { data: role }] = await Promise.all([supabase.rpc("mes_domaines_ventes"), supabase.rpc("mon_role")]);
  const domaines = ((doms as string[] | null) ?? []).filter((d): d is DomaineVente => d === "ecole" || d === "evenement");
  const estTresorier = role === "tresorier";
  const peutModifier = domaines.length > 0 && (estTresorier || niveau === null || niveau === "modification");
  return { supabase, user, slug: (role as string) ?? "", estTresorier, domaines, peutModifier };
}
