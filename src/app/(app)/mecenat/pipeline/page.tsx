import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PipelineTabs from "@/components/PipelineTabs";
import { createClient } from "@/lib/supabase/server";
import type { Prospect } from "@/lib/pipeline";
import type { Don } from "@/components/GestionDons";
import { pagesAutorisees, roleByEmail } from "@/lib/roles";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";

export default async function PipelinePage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: prospectsData }, { data: donsData }, jaugeRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("prospects")
      .select("*")
      .order("prochaine_action_date", { ascending: true, nullsFirst: false })
      .order("nom"),
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, observations",
      )
      .is("supprime_le", null),
    supabase.rpc("dons_exercice_courant"),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Relations donateurs"
        subtitle="Donateurs qualifiés depuis les dons + suivi relationnel manuel."
        action={
          pagesAutorisees(user?.email) ? undefined : <Link href="/mecenat/strategie" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Stratégie & règles
          </Link>
        }
      />
      {/* Recherche de fonds : la jauge est déjà en haut de chaque onglet (layout). */}
      {roleByEmail(user?.email)?.slug !== "recherche-fonds" && (
        <JaugeDons donnees={(jaugeRes.data as DonsExercice) ?? null} aujourdhui={todayISO()} />
      )}
      <PipelineTabs prospects={(prospectsData ?? []) as Prospect[]} dons={(donsData ?? []) as Don[]} />
    </div>
  );
}
