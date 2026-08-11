import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import PipelineTabs from "@/components/PipelineTabs";
import { createClient } from "@/lib/supabase/server";
import type { Prospect } from "@/lib/pipeline";
import type { Don } from "@/components/GestionDons";

export default async function PipelinePage() {
  const supabase = await createClient();
  const [{ data: prospectsData }, { data: donsData }] = await Promise.all([
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
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Pipeline grands donateurs & prospects"
        subtitle="Donateurs qualifiés depuis les dons + suivi relationnel manuel."
        action={
          <Link href="/mecenat/strategie" className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2">
            Stratégie & règles
          </Link>
        }
      />
      <PipelineTabs prospects={(prospectsData ?? []) as Prospect[]} dons={(donsData ?? []) as Don[]} />
    </div>
  );
}
