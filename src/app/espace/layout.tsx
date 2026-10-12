import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { familleEnApercu } from "@/lib/apercuFamille";
import AideFlottante from "@/components/AideFlottante";
import SidebarFamille from "@/components/SidebarFamille";

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
  if (!estFamille && !apercu) redirect("/");

  const { data: famille } = apercu
    ? await supabase.from("familles").select("id, nom, revalide_annee, membre_recherche, directrice_liee").eq("id", apercu).maybeSingle()
    : await supabase.from("familles").select("id, nom, revalide_annee, membre_recherche, directrice_liee").maybeSingle();
  // Campagne annuelle de revalidation des coordonnées (1er août → 30 septembre).
  const { data: campagne } = await supabase.rpc("annee_revalidation");
  const aRevalider = !apercu && campagne != null && famille?.revalide_annee !== campagne;

  return (
    <div className="flex min-h-full flex-col bg-background md:flex-row">
      <SidebarFamille famille={famille?.nom ?? ""} apercu={!!apercu} bascule={!apercu && famille ? { prenom: famille.membre_recherche ?? null, directrice: !!famille.directrice_liee } : undefined} />
      <div className="min-w-0 flex-1">
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
