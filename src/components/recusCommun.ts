// Éléments partagés par la liste des reçus fiscaux et la fiche « Reçu fiscal donateur ».

import type { SupabaseClient } from "@supabase/supabase-js";

/** Où en est un reçu (ou un groupe de dons sans reçu). */
export type StatutRecu = "envoye" | "edite" | "courrier" | "attente" | "a_faire" | "sans";

export const LIBELLE: Record<StatutRecu, string> = {
  envoye: "Envoyé",
  edite: "Établi, à envoyer",
  courrier: "Établi, à poster",
  attente: "Attente fin d'année",
  a_faire: "À établir",
  sans: "Reçu non demandé",
};

export const TON: Record<StatutRecu, string> = {
  envoye: "bg-positive/15 text-positive",
  edite: "bg-accent-soft text-accent",
  courrier: "bg-emerald-500/15 text-emerald-700",
  attente: "bg-gold-soft text-gold",
  a_faire: "bg-negative/10 text-negative",
  sans: "bg-surface-2 text-muted",
};

/**
 * Années dont les reçus ne sont plus modifiables (verrouillage prévu une fois toutes les
 * données vérifiées). `null` : rien n'est verrouillé. Exemple : 2026 verrouille 2025 et avant.
 */
export const VERROUILLER_ANNEES_AVANT: number | null = null;

/**
 * Recalcule au registre le total et le nombre de dons d'un reçu à partir des dons qui
 * portent encore son numéro ; un reçu vidé est marqué annulé (son numéro reste consommé).
 */
export async function recalculerRegistre(supabase: SupabaseClient, numero: string) {
  const { data } = await supabase.from("dons").select("montant").eq("recu_numero", numero).is("supprime_le", null);
  const nb = data?.length ?? 0;
  const total = (data ?? []).reduce((s, d) => s + Number(d.montant), 0);
  await supabase
    .from("recus")
    .update(nb === 0 ? { total: 0, nb_dons: 0, annule_le: new Date().toISOString() } : { total, nb_dons: nb })
    .eq("recu_numero", numero);
}
