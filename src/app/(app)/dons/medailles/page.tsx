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
  // Exercice en cours (1er septembre → 31 août), calculé d'après la date du jour : il bascule seul chaque 1er septembre.
  const auj = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Paris" }));
  const debut = auj.getMonth() >= 8 ? auj.getFullYear() : auj.getFullYear() - 1;
  const du = `${debut}-09-01`, au = `${debut + 1}-08-31`;
  const { data: dons } = await supabase
    .from("dons")
    .select(
      "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, telephone, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, don_boursier, medaille_affichee, medaille_par, medaille_le, operation_id, created_at",
    )
    .is("supprime_le", null)
    .or("don_boursier.is.null,don_boursier.eq.false")
    .gte("date_don", du)
    .lte("date_don", au)
    .order("date_don", { ascending: false });
  // N° du don dans l'exercice : 1 pour le premier, par date du don croissante, puis date de saisie, puis identifiant.
  const liste = (dons ?? []) as (Don & { created_at: string | null })[];
  const numeros: Record<string, number> = {};
  [...liste]
    .sort((a, b) => a.date_don.localeCompare(b.date_don) || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id))
    .forEach((d, i) => (numeros[d.id] = i + 1));
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Médailles Don" subtitle={`Exercice ${debut}-${debut + 1} (du 01/09/${debut} au 31/08/${debut + 1}). Cochez la médaille quand elle est posée sur le tableau des dons. Les autres informations sont en lecture seule.`} />
      <GestionDons dons={(dons ?? []) as Don[]} roleSlug={roleSlug} modeMedailles numeros={numeros} />
    </div>
  );
}
