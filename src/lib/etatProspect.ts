// État unifié des prospects : une seule échelle, à la place de l'étape (pipeline) et de l'état du Suivi.
// Les anciennes valeurs restent en base ; tant qu'aucun état unifié n'est choisi, une suggestion est proposée.

import type { Etape, Prospect } from "@/lib/pipeline";
import { ETAPE_LABEL } from "@/lib/pipeline";
import { etatCourant, type SuiviAction } from "@/lib/suiviDonateurs";

export const ETATS_PROSPECT = ["Pas contacté", "Contacté", "Promesse", "Donateur", "Sans réponse, à relancer", "Pas intéressé"] as const;
export type EtatProspect = (typeof ETATS_PROSPECT)[number];

export const AIDE_ETAT: Record<EtatProspect, string> = {
  "Pas contacté": "Aucun contact pour l'instant",
  Contacté: "Premier contact établi ou don sollicité",
  Promesse: "Le prospect a promis un don",
  Donateur: "Un don est enregistré pour ce prospect (automatique)",
  "Sans réponse, à relancer": "Pas de réponse : à relancer plus tard",
  "Pas intéressé": "Refus ou ne plus solliciter",
};

export const TON_ETAT: Record<EtatProspect, string> = {
  "Pas contacté": "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
  Contacté: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Promesse: "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  Donateur: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "Sans réponse, à relancer": "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  "Pas intéressé": "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const CORRESPONDANCE: Record<string, EtatProspect> = {
  // anciens états du Suivi
  "À contacter": "Pas contacté", Contacté: "Contacté", "En réflexion": "Contacté", "Promesse de don": "Promesse",
  "Don reçu": "Donateur", "À relancer": "Sans réponse, à relancer", Refus: "Pas intéressé", "Ne plus solliciter": "Pas intéressé",
  // anciennes étapes
  Identifié: "Pas contacté", Qualifié: "Pas contacté", Rencontré: "Contacté", Sollicité: "Contacté",
  Remercié: "Donateur", Fidélisé: "Donateur", Perdu: "Pas intéressé",
  // libellés unifiés antérieurs
  "En pause": "Sans réponse, à relancer",
};

export const estEtatProspect = (v: string | null | undefined): v is EtatProspect => !!v && (ETATS_PROSPECT as readonly string[]).includes(v);

export type EtatCalcule = {
  /** État retenu (choisi, ou Donateur automatique) ; null = pas encore choisi. */
  etat: EtatProspect | null;
  auto: boolean;
  /** Ancienne valeur affichée (état du Suivi, sinon étape) et suggestion, quand aucun état n'est choisi. */
  ancien: string | null;
  suggestion: EtatProspect | null;
  /** État pour les filtres et compteurs : retenu, sinon suggéré. */
  affiche: EtatProspect;
};

export function etatProspect(p: Pick<Prospect, "etat_unifie" | "etape">, h: SuiviAction[] | undefined, aUnDon: boolean): EtatCalcule {
  const ancien = etatCourant(h) ?? ETAPE_LABEL[p.etape as Etape] ?? null;
  const suggestion = ancien ? CORRESPONDANCE[ancien] ?? null : null;
  const choisi = p.etat_unifie === "En pause" ? "Sans réponse, à relancer" : p.etat_unifie === "Perdu" ? "Pas intéressé" : p.etat_unifie;
  if (estEtatProspect(choisi)) return { etat: choisi, auto: false, ancien: null, suggestion: null, affiche: choisi };
  if (aUnDon) return { etat: "Donateur", auto: true, ancien: null, suggestion: null, affiche: "Donateur" };
  return { etat: null, auto: false, ancien, suggestion, affiche: suggestion ?? "Pas contacté" };
}

/** Étape suivante (bouton « Avancer ») : Pas contacté → Contacté → Promesse → Donateur. */
export function etatSuivant(e: EtatProspect): EtatProspect | null {
  const flux: EtatProspect[] = ["Pas contacté", "Contacté", "Promesse", "Donateur"];
  const i = flux.indexOf(e);
  return i >= 0 && i < flux.length - 1 ? flux[i + 1] : null;
}

// ————— Donateurs : états automatiques (règles de lib/segments.ts) et manuels (portés par le Suivi) —————

export const ETATS_DONATEUR_AUTO = ["Actif", "Grand donateur", "En sommeil", "Perdu"] as const;
export const ETATS_DONATEUR_MANUELS = ["Sans réponse, à relancer", "Ne plus solliciter"] as const;
// « Remercié » est devenu une action du Suivi ; les anciennes lignes d'état « Remercié » restent dans l'historique.
export type EtatDonateurAffiche = (typeof ETATS_DONATEUR_AUTO)[number] | (typeof ETATS_DONATEUR_MANUELS)[number];

export const TON_ETAT_DONATEUR: Record<EtatDonateurAffiche, string> = {
  Actif: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "Grand donateur": "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  "En sommeil": "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  Perdu: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
  "Sans réponse, à relancer": "bg-yellow-100 text-yellow-800 dark:bg-yellow-950 dark:text-yellow-300",
  "Ne plus solliciter": "bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

/** État manuel courant : dernier état manuel du Suivi (« Aucun » l'efface). */
export function etatManuelDonateur(h: SuiviAction[] | undefined): (typeof ETATS_DONATEUR_MANUELS)[number] | null {
  const l = h?.find((x) => x.etat === "Aucun" || (ETATS_DONATEUR_MANUELS as readonly string[]).includes(x.etat ?? ""));
  return l && l.etat !== "Aucun" ? (l.etat as (typeof ETATS_DONATEUR_MANUELS)[number]) : null;
}
