import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Deconnexion } from "@/components/EspaceClient";
import { familleEnApercu } from "@/lib/apercuFamille";

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
    ? await supabase.from("familles").select("nom").eq("id", apercu).maybeSingle()
    : await supabase.from("familles").select("nom").maybeSingle();

  return (
    <div className="min-h-full bg-background">
      {apercu && (
        <div className="flex flex-wrap items-center justify-center gap-3 bg-gold px-4 py-1.5 text-center text-xs font-medium text-white">
          Aperçu (bureau) : vous voyez l&apos;espace tel que la famille {famille?.nom ?? ""} le verra.
          {/* Lien simple : un <Link> préchargerait la route et quitterait l'aperçu à l'affichage. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a href="/apercu-famille/quitter" className="rounded bg-white/20 px-2 py-0.5 underline-offset-2 hover:underline">
            Quitter l&apos;aperçu
          </a>
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
    </div>
  );
}
