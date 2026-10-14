import PageHeader from "@/components/PageHeader";
import PipelineTabs from "@/components/PipelineTabs";
import { createClient } from "@/lib/supabase/server";
import type { Prospect } from "@/lib/pipeline";
import type { Don } from "@/components/GestionDons";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";
import { contexteRecherche } from "@/lib/rechercheServeur";
import { ROLES_SUIVI, type SuiviAction } from "@/lib/suiviDonateurs";

export default async function PipelinePage() {
  const supabase = await createClient();
  const [{ data: { user } }, { data: prospectsData }, { data: donsData }, jaugeRes, obtenusRes] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("prospects")
      .select("*")
      .order("prochaine_action_date", { ascending: true, nullsFirst: false })
      .order("nom"),
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, observations, donateur_bourse, don_boursier, famille_statut, ne_pas_solliciter, contact_reserve_a, reserve_pour",
      )
      .is("supprime_le", null),
    supabase.rpc("dons_exercice_courant"),
    supabase.rpc("prospects_obtenus"),
  ]);
  const obtenus = Object.fromEntries(
    ((obtenusRes.data ?? []) as { prospect_id: string; montant: number | string; nb: number }[]).map((o) => [o.prospect_id, { montant: Number(o.montant), nb: o.nb }]),
  );
  const slugVu = roleByEmail(await emailVue(user?.email))?.slug ?? "";
  // Suivi des relations : historique des actions et auteur (prénom Recherche de fonds ou profil).
  const [{ data: suiviData }, ctx] = await Promise.all([
    supabase.from("suivi_actions").select("*").order("cree_le", { ascending: false }),
    contexteRecherche(supabase),
  ]);

  return (
    <div className="mx-auto max-w-6xl px-5 py-4 md:px-8">
      <PageHeader
        compact
        title="Relations donateurs"
      />
      {/* Recherche de fonds : la jauge est déjà en haut de chaque onglet (layout). */}
      {roleByEmail(await emailVue(user?.email))?.slug !== "recherche-fonds" && (
        <div className="mb-5">
          <JaugeDons donnees={(jaugeRes.data as DonsExercice) ?? null} aujourdhui={todayISO()} />
        </div>
      )}
      <PipelineTabs
        prospects={(prospectsData ?? []) as Prospect[]}
        dons={(donsData ?? []) as Don[]}
        obtenus={obtenus}
        peutLier={["tresorier", "president", "administrateur"].includes(slugVu)}
        peutModifierDons={slugVu === "tresorier"}
        peutModifierRelation={["recherche-fonds", "tresorier", "president"].includes(slugVu)}
        suivi={(suiviData ?? []) as SuiviAction[]}
        peutSuivre={ROLES_SUIVI.includes(slugVu)}
        auteurSuivi={ctx.prenomProfil}
        peutEcrireProspects={["tresorier", "president", "administrateur", "recherche-fonds"].includes(slugVu)}
      />
    </div>
  );
}
