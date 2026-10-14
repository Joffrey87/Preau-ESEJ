import GestionDons, { type Don } from "@/components/GestionDons";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";

/** Médailles Don (Directrice) : les dons hors dons boursiers, en lecture ; seule la colonne Médaille se coche. */
export default async function MedaillesDonPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(await emailVue(user?.email))?.slug ?? null;
  const { data: dons } = await supabase
    .from("dons")
    .select(
      "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, telephone, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, don_boursier, medaille_affichee, medaille_par, medaille_le, operation_id",
    )
    .is("supprime_le", null)
    .or("don_boursier.is.null,don_boursier.eq.false")
    .order("date_don", { ascending: false });
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Médailles Don" subtitle="Cochez la médaille quand elle est posée sur le tableau des dons. Les autres informations sont en lecture seule." />
      <GestionDons dons={(dons ?? []) as Don[]} roleSlug={roleSlug} modeMedailles />
    </div>
  );
}
