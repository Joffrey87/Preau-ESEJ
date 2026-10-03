import Link from "next/link";
import PageHeader from "@/components/PageHeader";
import GestionDons, { type Don } from "@/components/GestionDons";
import { createClient } from "@/lib/supabase/server";
import { roleByEmail } from "@/lib/roles";
import ModeleRecuBouton from "@/components/ModeleRecuBouton";
import type { ModeleRecuRow } from "@/lib/modeleRecu";

export default async function DonsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const roleSlug = roleByEmail(user?.email)?.slug ?? null;

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

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      <PageHeader
        title="Dons"
        subtitle="Suivi des dons reçus et génération des reçus fiscaux."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <ModeleRecuBouton initial={(modeleRecu ?? null) as ModeleRecuRow | null} />
            <Link
              href="/dons/depuis-compta"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Importer depuis Comptabilité
            </Link>
            <Link
              href="/dons/import"
              className="rounded-lg border border-border px-4 py-2 text-sm font-medium hover:bg-surface-2"
            >
              Importer (.xlsx)
            </Link>
          </div>
        }
      />
      <GestionDons dons={donsNormalises} roleSlug={roleSlug}
        relations={relations} />
    </div>
  );
}
