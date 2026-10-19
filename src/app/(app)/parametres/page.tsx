import PageHeader from "@/components/PageHeader";
import GestionComptes from "@/components/GestionComptes";
import GestionCategories from "@/components/GestionCategories";
import GestionExercices from "@/components/GestionExercices";
import GestionOrganisation, { type Organisation } from "@/components/GestionOrganisation";
import MonProfil from "@/components/MonProfil";
import ChoixTheme from "@/components/ChoixTheme";
import SecuriteDonnees from "@/components/SecuriteDonnees";
import QrCodesPaiement from "@/components/QrCodesPaiement";
import CoordonneesPaiementForm from "@/components/CoordonneesPaiementForm";
import ConsoClaude from "@/components/ConsoClaude";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";

export default async function ParametresPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const role = roleByEmail(await emailVue(user?.email));
  const meta = (user?.user_metadata ?? {}) as { prenom?: string; nom?: string };

  const [comptesRes, categoriesRes, exercicesRes, organisationRes, webmestreRes, alerteRes] = await Promise.all([
    supabase.from("comptes").select("id, nom, type, solde_initial, ordre, archive").order("ordre"),
    supabase.from("categories").select("id, nom, type, ordre, archive").order("type").order("ordre").order("nom"),
    supabase.from("exercices").select("id, libelle, date_debut, date_fin, actif").order("date_debut", { ascending: false }),
    supabase.from("organisation").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("est_webmestre"),
    supabase.rpc("claude_conso_alerte"),
  ]);
  // Crédit Claude : Webmestre seulement (la base refuse les statistiques à tout autre compte).
  const webmestre = webmestreRes.data === true;
  const alerte = alerteRes.data as { usd_mois: number; seuil_usd: number; depasse: boolean } | null;

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 md:px-8">
      <PageHeader
        title="Paramètres"
        subtitle="Comptes, catégories et exercices comptables."
      />

      {webmestre && alerte?.depasse && (
        <Link href="#conso-claude" role="alert" className="mb-6 block rounded-xl border border-gold/60 bg-gold/10 px-4 py-3 text-sm hover:border-gold">
          <span className="font-semibold text-gold">Crédit Claude : seuil mensuel dépassé. </span>
          {Number(alerte.usd_mois).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $ ce mois-ci pour un seuil de{" "}
          {Number(alerte.seuil_usd).toLocaleString("fr-FR", { minimumFractionDigits: 2 })} $ — voir le détail.
        </Link>
      )}

      <div className="space-y-10">
        <MonProfil prenom={meta.prenom ?? ""} nom={meta.nom ?? ""} roleLabel={role?.label ?? "—"} />
        <ChoixTheme />
        <SecuriteDonnees />
        {webmestre && <ConsoClaude />}
        <GestionOrganisation organisation={(organisationRes.data ?? null) as Organisation | null} />
        {/* QR codes IBAN (SumUp, Crédit Mutuel), affichés dans Ventes diverses : Trésorier seulement. */}
        {role?.slug === "tresorier" && <QrCodesPaiement />}
        {role?.slug === "tresorier" && <CoordonneesPaiementForm />}
        <GestionExercices exercices={exercicesRes.data ?? []} />
        <GestionComptes comptes={comptesRes.data ?? []} />
        <GestionCategories categories={categoriesRes.data ?? []} />
      </div>
    </div>
  );
}
