import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import Sidebar from "@/components/Sidebar";
import CoffreProvider from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/server";
import AideFlottante from "@/components/AideFlottante";
import { COOKIE_PRENOM, estEvenement, estProfesseur, pagesAutorisees, roleByEmail } from "@/lib/roles";
import { COOKIE_VUE, emailEffectif, peutChangerDeVue } from "@/lib/vueRole";
import type { ContexteAcces } from "@/lib/acces";
import { emailVue } from "@/lib/vueRoleServeur";
import Icon from "@/components/Icon";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";
import type { LiensEspace } from "@/components/BasculeEspace";
import { MEMBRES } from "@/lib/rechercheFonds";
import { contexteBasculeReelle } from "@/lib/basculeReelle";
import { BandeauBasculeReelle } from "@/components/BasculeReelle";

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
  // Droits réglés par le Webmestre (onglets masqués, lien vers la page Webmestre).
  const jar = await cookies();
  const { data: ctx } = await supabase.rpc("acces_contexte", {
    p_vue: jar.get(COOKIE_VUE)?.value ?? null,
    p_personne: decodeURIComponent(jar.get(COOKIE_PRENOM)?.value ?? "") || null,
  });
  const acces = (ctx as ContexteAcces | null) ?? null;
  const emailAffiche =
    (acces && "vue" in acces
      ? emailEffectif(user.email, acces.webmestre ? (acces.vue ?? null) : null, acces.webmestre)
      : await emailVue(user.email, acces?.webmestre)) ?? user.email;
  const peutChanger = peutChangerDeVue(user.email, acces?.webmestre);
  const roleVu = roleByEmail(emailAffiche);
  const enVue = peutChanger && !!roleVu && roleVu.email !== user.email;
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
  // Espace Événementiel : membre relié à la famille (aller), ou retour depuis le compte Événementiel vers les espaces de sa famille.
  type Lie = { libelle: string; email: string };
  if (bascule) {
    const lies = ((await supabase.rpc("membres_evenement_lies", { p_prenom: prenomVisite || null })).data ?? []) as Lie[];
    if (lies[0]) bascule = { ...bascule, evenement: lies[0] };
  } else if (estEvenement(user.email)) {
    const l = (((await supabase.rpc("mes_liens_evenement")).data ?? []) as { famille: string; membre_recherche: string | null; directrice: boolean; president: boolean }[])[0];
    const moi = (await supabase.from("evenement_membres").select("libelle").eq("user_id", user.id).maybeSingle()).data;
    if (l)
      bascule = {
        famille: l.famille,
        prenom: l.membre_recherche,
        directrice: l.directrice,
        // Depuis un compte Événementiel : jamais le profil Président (Marie A. → Espace famille Antona seulement).
        president: false,
        evenement: { libelle: (moi?.libelle as string) ?? "", email: user.email ?? "" },
      };
  }
  // Accès donnés par le Webmestre (acces_personne_profils) : ils s'ajoutent aux liens ci-dessus, sans en retirer.
  // Le profil vu « en tant que » par le Webmestre n'en tient pas compte (seulement le compte réel).
  if (!enVue) {
    type Lies = {
      famille: string | null;
      recherche: string | null;
      directrice: boolean;
      president: boolean;
      evenement: { libelle: string; email: string } | null;
      professeur: { libelle: string; email: string } | null;
    };
    const w = (await supabase.rpc("mes_acces_lies", { p_prenom: prenomVisite || null })).data as Lies | null;
    if (w) {
      const prenomRecherche = w.recherche && MEMBRES.includes(w.recherche) ? w.recherche : null;
      const ajoute = !!(prenomRecherche || w.directrice || w.president || w.evenement || w.professeur || (w.famille && !bascule));
      if (ajoute) {
        const b: LiensEspace = bascule ?? { famille: w.famille ?? "", prenom: null, directrice: false };
        bascule = {
          ...b,
          famille: b.famille || (w.famille ?? ""),
          prenom: b.prenom ?? prenomRecherche,
          directrice: b.directrice || w.directrice,
          president: (b.president ?? false) || w.president,
          evenement: b.evenement ?? w.evenement,
          professeur: b.professeur ?? w.professeur,
        };
      }
    }
  }
  // Famille réservée à la bascule (ex. : Antona) : ouverte sans changer de compte ni mot de passe.
  if (bascule) {
    const liee = (((await supabase.rpc("ma_famille_liee")).data ?? []) as { id: string; nom: string }[])[0];
    if (liee && liee.nom === bascule.famille) bascule = { ...bascule, familleLiee: true };
  }
  // Bascule réelle du Webmestre (jeton de 4 h) : bandeau permanent et choix des comptes depuis le logo.
  const reelle = await contexteBasculeReelle(user, prenomVisite);
  const jauge = rechercheFonds ? ((await supabase.rpc("dons_exercice_courant")).data as DonsExercice) : null;

  return (
    <CoffreProvider>
      <div className="flex min-h-full flex-col md:flex-row">
        <Sidebar
          userEmail={emailAffiche ?? ""}
          peutChanger={peutChanger}
          familles={familles}
          slugActif={roleVu?.slug ?? ""}
          bascule={bascule}
          niveaux={acces?.niveaux}
          webmestre={!!acces?.webmestre}
          basculeReelle={reelle ? (reelle.surWebmestre ? "webmestre" : "autre") : undefined}
        />
        <main className="flex-1 min-w-0">
          {reelle && <BandeauBasculeReelle {...reelle} />}
          {enVue && (
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/40 bg-gold/15 px-5 py-2 text-[13px] md:px-8">
              <Icon name="info" className="h-4 w-4 shrink-0 text-gold" />
              <span>
                Vue en tant que <strong>{roleVu?.label}</strong> — simple aperçu de l’affichage : vos droits réels
                restent ceux de votre profil.
              </span>
              <a href={`/changer-profil/${slugReel ?? "tresorier"}`} className="ml-auto font-medium text-accent hover:underline">
                Revenir à mon profil
              </a>
            </div>
          )}
          {rechercheFonds && (
            <div className="mx-auto max-w-7xl px-5 pt-3 md:px-8">
              <JaugeDons donnees={jauge} aujourdhui={todayISO()} saufAccueil />
            </div>
          )}
          {children}
        </main>
      </div>
      {/* Profil restreint : pas d'accès à l'onglet Processus. */}
      <AideFlottante profil={estProfesseur(emailAffiche) ? "professeur" : (roleVu?.slug ?? "")} peutGerer={!pagesAutorisees(emailAffiche)} />
    </CoffreProvider>
  );
}
