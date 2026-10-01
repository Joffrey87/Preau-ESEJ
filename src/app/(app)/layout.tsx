import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import CoffreProvider from "@/components/CoffreProvider";
import { createClient } from "@/lib/supabase/server";
import AideFlottante from "@/components/AideFlottante";
import { pagesAutorisees, roleByEmail } from "@/lib/roles";

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

  return (
    <CoffreProvider>
      <div className="flex min-h-full flex-col md:flex-row">
        <Sidebar userEmail={user.email ?? ""} userName={userName} />
        <main className="flex-1 min-w-0">{children}</main>
      </div>
      {/* Profil restreint : pas d'accès à l'onglet Processus. */}
      <AideFlottante profil={roleByEmail(user.email)?.slug ?? ""} peutGerer={!pagesAutorisees(user.email)} />
    </CoffreProvider>
  );
}
