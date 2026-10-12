import GestionDons, { type Don } from "@/components/GestionDons";
import { createClient } from "@/lib/supabase/server";
import { emailVue } from "@/lib/vueRoleServeur";
import { roleByEmail } from "@/lib/roles";
import type { ModeleRecuRow } from "@/lib/modeleRecu";
import JaugeDons, { type DonsExercice } from "@/components/JaugeDons";
import { todayISO } from "@/lib/format";

export default async function DonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(await emailVue(user?.email))?.slug ?? null;

  // On charge aussi les dons supprimés (corbeille) : le composant sépare actifs
  // et supprimés via `supprime_le`.
  const { data: dons } = await supabase
    .from("dons")
    .select(
      "id, exercice_id, origine, categorie_donateur, est_personne_morale, donateur_titre, donateur_nom, donateur_prenom, raison_sociale, adresse, cp_ville, courriel, pii_chiffre, montant, date_don, mode_paiement, recu_numero, recu_etat, recu_emis_le, envoi_prefere, observations, supprime_le, supprime_par, operation_id, operation:operations!dons_operation_id_fkey(date_operation)",
    )
    .order("date_don", { ascending: false });

  // L'opération reliée arrive en tableau ou en objet selon la relation : on la ramène à un objet.
  const donsNormalises = ((dons ?? []) as unknown as (Don & { operation: unknown })[]).map((d) => ({
    ...d,
    operation: (Array.isArray(d.operation) ? d.operation[0] : d.operation) as Don["operation"],
  })) as Don[];

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
        relations={relations} modeleRecu={(modeleRecu ?? null) as ModeleRecuRow | null}
        sousEntete={roleSlug === "recherche-fonds" ? undefined : <JaugeDons donnees={jauge} aujourdhui={todayISO()} />} />
    </div>
  );
}
