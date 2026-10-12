import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import CoffreProvider from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/server";
import AideFlottante from "@/components/AideFlottante";
import { COOKIE_PRENOM, pagesAutorisees, roleByEmail } from "@/lib/roles";
import { peutChangerDeVue } from "@/lib/vueRole";
import { emailVue } from "@/lib/vueRoleServeur";
import Icon from "@/components/Icon";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";
import type { LiensEspace } from "@/components/BasculeEspace";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware protège déjà les routes ; double sécurité côté rendu.
  if (!user) redirect("/login");
  if ((user.app_metadata as { espace?: string } | undefined)?.espace === "famille") redirect("/espace");

  // Profil Recherche de fonds : la jauge des dons en haut de chaque onglet.
  // Le Trésorier peut voir l'application « en tant que » un autre profil (vue seulement).
  const emailAffiche = (await emailVue(user.email)) ?? user.email;
  const peutChanger = peutChangerDeVue(user.email);
  const roleVu = roleByEmail(emailAffiche);
  const enVue = peutChanger && roleVu?.slug !== "tresorier";
  const rechercheFonds = roleVu?.slug === "recherche-fonds";
  // Profil « Famille » : le Trésorier choisit la famille à voir (aperçu de son espace).
  const familles = peutChanger
    ? (((await supabase.from("familles").select("id, nom").order("nom")).data ?? []) as { id: string; nom: string }[])
    : [];
  // Profil relié à un Espace famille (membre de la Recherche de fonds, Directrice) : le logo propose le passage de l'un
  // à l'autre — et, pour la famille de la Directrice, entre les trois.
  const prenomVisite = decodeURIComponent((await cookies()).get(COOKIE_PRENOM)?.value ?? "");
  const slugReel = roleByEmail(user.email)?.slug;
  let bascule: LiensEspace | undefined;
  if (slugReel === "recherche-fonds" && prenomVisite) {
    const lien = ((await supabase.rpc("liens_du_membre", { p_prenom: prenomVisite })).data as { famille: string; directrice: boolean }[] | null)?.[0];
    if (lien) bascule = { famille: lien.famille, prenom: prenomVisite, directrice: lien.directrice };
  } else if (slugReel === "directrice") {
    const { data: f } = await supabase.from("familles").select("nom, membre_recherche").eq("directrice_liee", true).maybeSingle();
    if (f) bascule = { famille: f.nom as string, prenom: (f.membre_recherche as string | null) ?? null, directrice: true };
  } else if (slugReel === "president") {
    // Président : le logo ouvre l'Espace de sa famille (familles.profil_lie), comme pour les autres familles.
    const { data: f } = await supabase.from("familles").select("nom, membre_recherche").eq("profil_lie", "president").maybeSingle();
    if (f) bascule = { famille: f.nom as string, prenom: (f.membre_recherche as string | null) ?? null, directrice: false, president: true };
  }
  const jauge = rechercheFonds ? ((await supabase.rpc("dons_exercice_courant")).data as DonsExercice) : null;

  return (
    <CoffreProvider>
      <div className="flex min-h-full flex-col md:flex-row">
        <Sidebar
          userEmail={emailAffiche ?? ""}
          peutChanger={peutChanger}
          familles={familles}
          slugActif={roleVu?.slug ?? "tresorier"}
          bascule={bascule}
        />
        <main className="flex-1 min-w-0">
          {enVue && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/40 bg-gold/15 px-5 py-2 text-[13px] md:px-8">
              <Icon name="info" className="h-4 w-4 shrink-0 text-gold" />
              <span>
                Vue en tant que <strong>{roleVu?.label}</strong> — simple aperçu de l’affichage : vos droits réels
                restent ceux du Trésorier.
              </span>
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- route qui pose un cookie puis redirige */}
              <a href="/changer-profil/tresorier" className="ml-auto font-medium text-accent hover:underline">
                Revenir au Trésorier
              </a>
            </div>
          )}
          {rechercheFonds && (
            <div className="mx-auto max-w-7xl px-5 pt-3 md:px-8">
              <JaugeDons donnees={jauge} aujourdhui={todayISO()} />
            </div>
          )}
          {children}
        </main>
      </div>
      {/* Profil restreint : pas d'accès à l'onglet Processus. */}
      <AideFlottante profil={roleVu?.slug ?? ""} peutGerer={!pagesAutorisees(emailAffiche)} />
    </CoffreProvider>
  );
}
