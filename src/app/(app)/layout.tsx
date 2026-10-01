import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CoffreProvider from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/server";
import AideFlottante from "@/components/AideFlottante";
import { pagesAutorisees, roleByEmail } from "@/lib/roles";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";

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

  const meta = (user.user_metadata ?? {}) as { prenom?: string; nom?: string };
  const userName = [meta.prenom, meta.nom].filter(Boolean).join(" ") || undefined;

  // Profil Recherche de fonds : la jauge des dons en haut de chaque onglet.
  const rechercheFonds = roleByEmail(user.email)?.slug === "recherche-fonds";
  const jauge = rechercheFonds ? ((await supabase.rpc("dons_exercice_courant")).data as DonsExercice) : null;

  return (
    <CoffreProvider>
      <div className="flex min-h-full flex-col md:flex-row">
        <Sidebar userEmail={user.email ?? ""} userName={userName} />
        <main className="flex-1 min-w-0">
          {rechercheFonds && (
            <div className="mx-auto max-w-7xl px-5 pt-6 md:px-8">
              <JaugeDons donnees={jauge} aujourdhui={todayISO()} />
            </div>
          )}
          {children}
        </main>
      </div>
      {/* Profil restreint : pas d'accès à l'onglet Processus. */}
      <AideFlottante profil={roleByEmail(user.email)?.slug ?? ""} peutGerer={!pagesAutorisees(user.email)} />
    </CoffreProvider>
  );
}
