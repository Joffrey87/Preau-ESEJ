// État unifié des prospects : une seule échelle, à la place de l'étape (pipeline) et de l'état du Suivi.
// Les anciennes valeurs restent en base ; tant qu'aucun état unifié n'est choisi, une suggestion est proposée.

import type { Etape, Prospect } from "@/lib/pipeline";
import { ETAPE_LABEL } from "@/lib/pipeline";
import { etatCourant, type SuiviAction } from "@/lib/suiviDonateurs";

export const ETATS_PROSPECT = ["Pas contacté", "Contacté", "Promesse", "Donateur", "En pause", "Perdu"] as const;
export type EtatProspect = (typeof ETATS_PROSPECT)[number];

export const AIDE_ETAT: Record<EtatProspect, string> = {
  "Pas contacté": "Aucun contact pour l'instant",
  Contacté: "Premier contact établi ou don sollicité",
  Promesse: "Le prospect a promis un don",
  Donateur: "Un don est enregistré pour ce prospect (automatique)",
  "En pause": "À relancer plus tard",
  Perdu: "Refus ou ne plus solliciter",
};

export const TON_ETAT: Record<EtatProspect, string> = {
  "Pas contacté": "bg-surface-2 text-muted",
  Contacté: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  Promesse: "bg-gold-soft text-gold",
  Donateur: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  "En pause": "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  Perdu: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300",
};

const CORRESPONDANCE: Record<string, EtatProspect> = {
  // anciens états du Suivi
  "À contacter": "Pas contacté", Contacté: "Contacté", "En réflexion": "Contacté", "Promesse de don": "Promesse",
  "Don reçu": "Donateur", "À relancer": "En pause", Refus: "Perdu", "Ne plus solliciter": "Perdu",
  // anciennes étapes
  Identifié: "Pas contacté", Qualifié: "Pas contacté", Rencontré: "Contacté", Sollicité: "Contacté",
  Remercié: "Donateur", Fidélisé: "Donateur", Perdu: "Perdu",
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
  if (estEtatProspect(p.etat_unifie)) return { etat: p.etat_unifie, auto: false, ancien: null, suggestion: null, affiche: p.etat_unifie };
  if (aUnDon) return { etat: "Donateur", auto: true, ancien: null, suggestion: null, affiche: "Donateur" };
  return { etat: null, auto: false, ancien, suggestion, affiche: suggestion ?? "Pas contacté" };
}

/** Étape suivante (bouton « Avancer ») : Pas contacté → Contacté → Promesse → Donateur. */
export function etatSuivant(e: EtatProspect): EtatProspect | null {
  const flux: EtatProspect[] = ["Pas contacté", "Contacté", "Promesse", "Donateur"];
  const i = flux.indexOf(e);
  return i >= 0 && i < flux.length - 1 ? flux[i + 1] : null;
}
