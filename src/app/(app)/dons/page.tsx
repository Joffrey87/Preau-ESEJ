import GestionDons, { type Don } from "@/components/GestionDons";
import PageHeader from "@/components/PageHeader";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import type { ModeleRecuRow } from "@/lib/modeleRecu";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";
import type { DemandeRecu, AlerteDonateur } from "@/components/DemandeRecu";

export default async function DonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(await emailVue(user?.email))?.slug ?? null;
  if (roleSlug === "directeur-spirituel") return <DonsDirecteurSpirituel roleSlug={roleSlug} />;

  // On charge aussi les dons supprimés (corbeille) : le composant sépare actifs
  // et supprimés via `supprime_le`.
  const { data: dons } = await supabase
    .from("dons")
    .select(
      "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, telephone, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, don_boursier, medaille_affichee, medaille_par, medaille_le, passer_a, operation_id, operation:operations!dons_operation_id_fkey(date_operation)",
    )
    .order("date_don", { ascending: false });

  // L'opération reliée arrive en tableau ou en objet selon la relation : on la ramène à un objet.
  const donsNormalises = ((dons ?? []) as unknown as (Don & { operation: unknown })[]).map((d) => ({
    ...d,
    operation: (Array.isArray(d.operation) ? d.operation[0] : d.operation) as Don["operation"],
  })) as Don[];

  // Demandes de reçu (Recherche de fonds) et alertes « infos donateur modifiées » (Trésorier).
  const [{ data: demandes }, { data: alertes }] = await Promise.all([
    supabase.from("dons_demandes_recu").select("don_id, demande_par, demande_role, demande_le"),
    supabase.from("dons_alertes_donateur").select("id, don_id, changements, par, le").is("vu_le", null).order("le"),
  ]);

  // Signataires et adresse imprimés sur les reçus (modifiables depuis la page).
  const { data: modeleRecu } = await supabase.from("modele_recu").select("*").eq("id", 1).maybeSingle();

  // Relations déjà employées, proposées en suggestion à la saisie.
  const relations = Array.from(
    new Set((dons ?? []).map((d) => (d.origine ?? "").trim()).filter(Boolean)),
  ).sort((a, b) => a.localeCompare(b, "fr"));

  // Jauge des dons de l'exercice (la même que dans Relations donateurs) ; le profil Recherche de fonds l'a déjà en haut de chaque onglet.
  const jauge =
    roleSlug === "recherche-fonds" ? null : ((await supabase.rpc("dons_exercice_courant")).data as DonsExercice | null);

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <GestionDons dons={donsNormalises} roleSlug={roleSlug}
        relations={relations} demandes={(demandes ?? []) as DemandeRecu[]} alertes={(alertes ?? []) as AlerteDonateur[]} modeleRecu={(modeleRecu ?? null) as ModeleRecuRow | null}
        sousEntete={roleSlug === "recherche-fonds" ? undefined : <JaugeDons donnees={jauge} aujourdhui={todayISO()} />} />
    </div>
  );
}

/**
 * Directeur spirituel : la vue de la Recherche de fonds (dons hors dons boursiers, en lecture, fiche contact, demande de
 * reçu fiscal, téléchargement du reçu établi), plus la colonne Médaille, qu'il coche, et le n° du don dans son exercice.
 */
async function DonsDirecteurSpirituel({ roleSlug }: { roleSlug: string }) {
  const supabase = await createClient();
  const [{ data: dons }, { data: demandes }] = await Promise.all([
    supabase
      .from("dons")
      .select(
        "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, telephone, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, don_boursier, medaille_affichee, medaille_par, medaille_le, passer_a, operation_id, created_at",
      )
      .is("supprime_le", null)
      .or("don_boursier.is.null,don_boursier.eq.false")
      .order("date_don", { ascending: false }),
    supabase.from("dons_demandes_recu").select("don_id, demande_par, demande_role, demande_le"),
  ]);
  // N° du don dans son exercice (1er septembre → 31 août), comme dans « Médailles Don » : par date du don, puis de saisie.
  const liste = (dons ?? []) as (Don & { created_at: string | null })[];
  const exercice = (date: string) => (Number(date.slice(5, 7)) >= 9 ? Number(date.slice(0, 4)) : Number(date.slice(0, 4)) - 1);
  const numeros: Record<string, number> = {};
  const compteurs = new Map<number, number>();
  [...liste]
    .sort((a, b) => a.date_don.localeCompare(b.date_don) || (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id))
    .forEach((d) => {
      const n = (compteurs.get(exercice(d.date_don)) ?? 0) + 1;
      compteurs.set(exercice(d.date_don), n);
      numeros[d.id] = n;
    });
  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader title="Dons" subtitle="Consultation des dons. Cochez la médaille quand elle est posée sur le tableau des dons ; cliquez sur un donateur pour mettre à jour sa relation et ses coordonnées." />
      <GestionDons dons={liste} roleSlug={roleSlug} modeRecherche avecMedaille numeros={numeros}
        prenomRecherche="Directeur spirituel" demandes={(demandes ?? []) as DemandeRecu[]} />
    </div>
  );
}
