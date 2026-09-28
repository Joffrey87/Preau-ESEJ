import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Deconnexion } from "@/components/EspaceClient";

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
  if ((user.app_metadata as { espace?: string } | undefined)?.espace !== "famille") redirect("/");

  const { data: famille } = await supabase.from("familles").select("nom").maybeSingle();

  return (
    <div className="min-h-full bg-background">
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
            <Deconnexion />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-5 py-6">{children}</main>
    </div>
  );
}
