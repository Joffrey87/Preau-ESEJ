import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import GestionWebmestre, { type DonneesWebmestre } from "@/components/GestionWebmestre";

// Page Webmestre : vue d'ensemble des profils, des personnes et des droits par onglet ; passation ; historique.
export default async function WebmestrePage() {
  const supabase = await createClient();
  const { data: estWeb } = await supabase.rpc("est_webmestre");
  if (estWeb !== true) redirect("/");

  const [pages, droits, personnes, liens, exceptions, historique, webmestre] = await Promise.all([
    supabase.from("acces_pages").select("cle, libelle, section, ordre").order("ordre"),
    supabase.from("acces_profils").select("profil, page, niveau"),
    supabase.from("acces_personnes").select("id, nom, note").order("nom"),
    supabase.from("acces_personne_profils").select("personne, profil, note"),
    supabase.from("acces_personne_pages").select("personne, profil, page, niveau"),
    supabase.from("acces_historique").select("id, quand, auteur, action, profil, page, ancien, nouveau, detail").order("quand", { ascending: false }).limit(300),
    supabase.from("webmestre").select("profil, depuis").single(),
  ]);

  const donnees: DonneesWebmestre = {
    pages: pages.data ?? [],
    droits: droits.data ?? [],
    personnes: personnes.data ?? [],
    liens: liens.data ?? [],
    exceptions: exceptions.data ?? [],
    historique: historique.data ?? [],
    webmestre: webmestre.data ?? { profil: "tresorier", depuis: "" },
  } as DonneesWebmestre;

  return (
    <div className="mx-auto max-w-7xl px-5 py-6 md:px-8">
      <h1 className="text-xl font-semibold tracking-tight">Webmestre</h1>
      <p className="mt-1 text-sm text-muted">Profils de Préau, personnes qui y ont accès, droits par onglet, passation et historique.</p>
      <GestionWebmestre donnees={donnees} />
    </div>
  );
}