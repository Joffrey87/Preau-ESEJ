import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Deconnexion } from "@/components/EspaceClient";
import { familleEnApercu } from "@/lib/apercuFamille";
import AideFlottante from "@/components/AideFlottante";

const NAV = [
  { href: "/espace", label: "Tableau de bord" },
  { href: "/espace/paiements", label: "Paiements" },
  { href: "/espace/famille", label: "Ma famille" },
];

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
    ? await supabase.from("familles").select("id, nom, revalide_annee").eq("id", apercu).maybeSingle()
    : await supabase.from("familles").select("id, nom, revalide_annee").maybeSingle();
  // Campagne annuelle de revalidation des coordonnées (1er août → 30 septembre).
  const { data: campagne } = await supabase.rpc("annee_revalidation");
  const aRevalider = !apercu && campagne != null && famille?.revalide_annee !== campagne;

  return (
    <div className="min-h-full bg-background">
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
      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-5 py-3">
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo.webp" alt="" className="h-10 w-10 rounded-full object-contain" />
            <div>
              <div className="text-sm font-semibold">École du Saint-Enfant-Jésus</div>
              <div className="text-xs text-muted">Espace famille{famille?.nom ? ` — Famille ${famille.nom}` : ""}</div>
            </div>
          </div>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV.map((n) => (
              <Link key={n.href} href={n.href} className="rounded-lg px-3 py-1.5 text-sm hover:bg-surface-2">
                {n.label}
              </Link>
            ))}
            {!apercu && <Deconnexion />}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
      {/* Fiches d'aide « Famille » ; en aperçu, le bureau les voit sans pouvoir suggérer. */}
      <AideFlottante profil="famille" familleId={apercu ? null : (famille?.id ?? null)} />
    </div>
  );
}
