import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { enFamilleLiee, familleEnApercu } from "@/lib/apercuFamille";
import { estEvenement, roleByEmail } from "@/lib/roles";
import type { LiensEspace } from "@/components/BasculeEspace";
import AideFlottante from "@/components/AideFlottante";
import SidebarFamille from "@/components/SidebarFamille";
import { contexteBasculeReelle } from "@/lib/basculeReelle";
import { BandeauBasculeReelle } from "@/components/BasculeReelle";

/** Espace d'une famille : son tableau de bord, ses paiements, sa fiche. Rien d'autre. */
export default async function EspaceLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  // Compte famille : sa famille. Bureau : uniquement en aperçu d'une famille.
  const apercu = await familleEnApercu(user);
  const estFamille = (user.app_metadata as { espace?: string } | undefined)?.espace === "famille";
  // Famille réservée ouverte depuis un compte relié (Président, membre Événementiel) : la base dit laquelle.
  const liee = !estFamille && !apercu && (await enFamilleLiee(user))
    ? ((((await supabase.rpc("ma_famille_liee")).data ?? []) as { id: string; nom: string }[])[0] ?? null)
    : null;
  if (!estFamille && !apercu && !liee) redirect("/");

  const { data: famille } = liee
    ? await supabase.from("familles").select("id, nom, revalide_annee, membre_recherche, directrice_liee, profil_lie").eq("id", liee.id).maybeSingle()
    : apercu
    ? await supabase.from("familles").select("id, nom, revalide_annee, membre_recherche, directrice_liee, profil_lie").eq("id", apercu).maybeSingle()
    : await supabase.from("familles").select("id, nom, revalide_annee, membre_recherche, directrice_liee, profil_lie").maybeSingle();
  // Campagne annuelle de revalidation des coordonnées (1er août → 30 septembre).
  const { data: campagne } = await supabase.rpc("annee_revalidation");
  // Membre Événement relié à la famille : le logo propose aussi son espace Événementiel.
  const evenement = apercu || liee ? null : ((((await supabase.rpc("membres_evenement_lies")).data ?? []) as { libelle: string; email: string }[])[0] ?? null);
  // Retour vers l'espace du compte relié, dans la même session.
  let basculeLiee: Omit<LiensEspace, "famille"> | undefined;
  if (liee) {
    if (estEvenement(user.email)) {
      const moi = (await supabase.from("evenement_membres").select("libelle").eq("user_id", user.id).maybeSingle()).data;
      basculeLiee = {
        prenom: null,
        directrice: false,
        evenement: { libelle: (moi?.libelle as string) ?? "", email: user.email ?? "" },
        retourLiee: { evenement: "/famille-liee/quitter?vers=/evenement" },
      };
    } else {
      const slug = roleByEmail(user.email)?.slug;
      basculeLiee = {
        prenom: null,
        directrice: slug === "directrice",
        president: slug === "president",
        retourLiee: { directrice: "/famille-liee/quitter?vers=/", president: "/famille-liee/quitter?vers=/" },
      };
    }
  }
  // Bascule réelle du Webmestre (jeton de 4 h) : bandeau permanent et choix des comptes depuis le logo.
  const reelle = await contexteBasculeReelle(user, "");
  // Webmestre dans l'Espace d'une famille : bandeau de retour.
  const parWebmestre = !!liee && !!(await supabase.rpc("famille_du_webmestre")).data;
  const aRevalider = !apercu && campagne != null && famille?.revalide_annee !== campagne;

  return (
    <div className="flex min-h-full flex-col bg-background md:flex-row">
      <SidebarFamille famille={famille?.nom ?? ""} apercu={!!apercu} basculeReelle={!!reelle && !reelle.surWebmestre} bascule={basculeLiee ?? (!apercu && famille ? { prenom: famille.membre_recherche ?? null, directrice: !!famille.directrice_liee, president: famille.profil_lie === "president", evenement } : undefined)} />
      <div className="min-w-0 flex-1">
        {reelle && <BandeauBasculeReelle {...reelle} />}
        {apercu && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/40 bg-gold/15 px-5 py-2 text-[13px] md:px-8">
            <span className="font-semibold text-gold">⚠</span>
            <span>
              Vue en tant que <strong>famille {famille?.nom ?? ""}</strong> — simple aperçu de ce que la famille voit : vos droits réels
              restent ceux du Trésorier.
            </span>
            {/* Lien simple : un <Link> préchargerait la route et quitterait l'aperçu à l'affichage. */}
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a href="/apercu-famille/quitter?vers=accueil" className="ml-auto font-medium text-accent hover:underline">
              Revenir au Trésorier
            </a>
          </div>
        )}
        {parWebmestre && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/40 bg-gold/15 px-5 py-2 text-[13px] md:px-8">
            <span className="font-semibold text-gold">⚠</span>
            <span>
              Webmestre : vous êtes dans l&apos;Espace de la <strong>famille {famille?.nom ?? ""}</strong>, avec ses droits. Ouverture journalisée.
            </span>
            <a href="/famille-liee/quitter?vers=/" className="ml-auto font-medium text-accent hover:underline">
              Revenir au Webmestre
            </a>
          </div>
        )}
        {aRevalider && (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gold/40 bg-gold/15 px-5 py-2 text-[13px] md:px-8">
            <span className="font-semibold text-gold">⚠</span>
            <span>Merci de vérifier et de valider vos coordonnées (adresse, téléphones et courriels de Monsieur et de Madame) avant le 30 septembre.</span>
            <Link href="/espace/famille" className="ml-auto font-medium text-accent hover:underline">
              Vérifier mes informations
            </Link>
          </div>
        )}
        <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
      </div>
      {/* Fiches d'aide « Famille » ; en aperçu, le bureau les voit sans pouvoir suggérer. */}
      <AideFlottante profil="famille" familleId={apercu ? null : (famille?.id ?? null)} />
    </div>
  );
}
