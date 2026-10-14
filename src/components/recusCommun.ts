// Éléments partagés par la liste des reçus fiscaux et la fiche « Reçu fiscal donateur ».

import type { SupabaseClient } from "@supabase/supabase-js";
import { ETAT_PASSE_SECRETAIRE, etatEnvoye } from "@/lib/envoiRecu";
import { formatDate } from "@/lib/format";

/** Où en est un reçu (ou un groupe de dons sans reçu). */
export type StatutRecu = "envoye" | "edite" | "passer" | "verifier" | "attente" | "a_faire" | "sans";

export const LIBELLE: Record<StatutRecu, string> = {
  envoye: "Envoyé",
  edite: "À envoyer",
  passer: "À passer",
  verifier: "Vérifier envoi postal",
  attente: "Attente fin d'année",
  a_faire: "À établir",
  sans: "Reçu non demandé",
};

export const TON: Record<StatutRecu, string> = {
  envoye: "bg-positive/15 text-positive",
  edite: "bg-transparent text-positive ring-1 ring-inset ring-border",
  passer: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  verifier: "bg-violet-500/15 text-violet-700 dark:text-violet-300",
  attente: "bg-gold-soft text-gold",
  a_faire: "bg-gold-soft text-gold",
  sans: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

/**
 * À partir de cette année, un numéro de reçu ne prouve pas que le reçu a été édité : il est
 * seulement « réservé » tant qu'aucun don du reçu ne porte de date d'édition et qu'il n'est
 * pas envoyé. Avant, tout reçu numéroté est considéré comme édité (données historiques).
 */
export const EDITION_EXIGEE_DEPUIS = 2026;

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
    .update(nb === 0 ? { total: 0, nb_dons: 0, annule_le: new Date().toISOString() } : { total, nb_dons: nb, telecharge_le: null })
    .eq("recu_numero", numero);
}

/** Étapes d'un reçu à poster, après son établissement : dans cet ordre, et réversibles. */
export type EtapePostale = "passer" | "verifier" | "envoye";

export const ETAPES_POSTALES: { cle: EtapePostale; libelle: string; aide: string }[] = [
  { cle: "passer", libelle: "À passer", aide: "Reçu établi (avec sa lettre), pas encore remis au secrétaire." },
  { cle: "verifier", libelle: "Vérifier envoi postal", aide: "Remis au secrétaire : à valider quand le courrier est posté." },
  { cle: "envoye", libelle: "Envoyé", aide: "Courrier posté (date d'envoi à indiquer)." },
];

/**
 * Place un reçu à poster sur l'une des étapes du parcours, dans un sens comme dans l'autre.
 * L'état est porté par tous les dons du reçu ; le registre garde la date et le mode d'envoi.
 * Chaque changement d'état d'un don est consigné par la base (table dons_etat_historique).
 */
export async function placerEtapePostale(
  supabase: SupabaseClient,
  numero: string,
  idsDons: string[],
  etape: EtapePostale,
  dateEnvoi?: string,
): Promise<string | null> {
  const envoye = etape === "envoye";
  const { error: errRecu } = await supabase
    .from("recus")
    .update(envoye ? { envoye_le: dateEnvoi, envoi_mode: "courrier", envoi_precision: null } : { envoye_le: null, envoi_mode: null, envoi_precision: null })
    .eq("recu_numero", numero);
  if (errRecu) return "Registre des reçus non mis à jour : " + errRecu.message;
  const etat = envoye ? etatEnvoye(formatDate(dateEnvoi as string), "courrier") : etape === "verifier" ? ETAT_PASSE_SECRETAIRE : null;
  const { error } = await supabase.from("dons").update({ recu_etat: etat }).in("id", idsDons);
  return error ? "Mise à jour des dons impossible : " + error.message : null;
}
