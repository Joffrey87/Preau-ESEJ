import GestionDons, { type Don } from "@/components/GestionDons";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import { contexteRecherche } from "@/lib/rechercheServeur";
import type { DemandeRecu } from "@/components/DemandeRecu";

/** Recherche de fonds : tous les dons (hors dons boursiers), en lecture ; fiche contact et demande de reçu fiscal. */
export default async function DonsRecherchePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(await emailVue(user?.email))?.slug ?? null;
  const [{ data: dons }, { data: demandes }, ctx] = await Promise.all([
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, telephone, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, don_boursier, passer_a, operation_id",
      )
      .is("supprime_le", null)
      .or("don_boursier.is.null,don_boursier.eq.false")
      .order("date_don", { ascending: false }),
    supabase.from("dons_demandes_recu").select("don_id, demande_par, demande_role, demande_le"),
    contexteRecherche(supabase),
  ]);
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Dons" subtitle="Consultation des dons. Cliquez sur un donateur pour mettre à jour sa relation et ses coordonnées." />
      <GestionDons dons={(dons ?? []) as Don[]} roleSlug={roleSlug} modeRecherche
        prenomRecherche={ctx.prenomProfil} demandes={(demandes ?? []) as DemandeRecu[]} />
    </div>
  );
}
