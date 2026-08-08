import { redirect } from "next/navigation";
import Sidebar from "@/components/Sidebar";
import { createClient } from "@/lib/supabase/server";

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

  const meta = (user.user_metadata ?? {}) as { prenom?: string; nom?: string };
  const userName = [meta.prenom, meta.nom].filter(Boolean).join(" ") || undefined;

  return (
    <div className="flex min-h-full flex-col md:flex-row">
      <Sidebar userEmail={user.email ?? ""} userName={userName} />
      <main className="flex-1 min-w-0">{children}</main>
    </div>
  );
}
