// Couples : une fiche pour « Monsieur & Madame François et Cécile Croison ».
//
// La fiche garde ses champs habituels : le titre vaut « Monsieur & Madame » et le prénom
// réunit les deux prénoms (« François et Cécile »). Aucun changement de schéma : les écrans
// de liste, la recherche, les reçus et les lettres lisent le même texte.

import { normaliser } from "@/lib/reconciliation";

export const TITRE_COUPLE = "Monsieur & Madame";

/** Le titre désigne-t-il un couple (« Monsieur & Madame », « M. et Mme »…) ? */
export function estCouple(titre: string | null | undefined): boolean {
  const t = normaliser(titre ?? "");
  return /^(monsieur|mr|m) (et )?(madame|mme)$/.test(t);
}

/** « François et Cécile » → { monsieur: « François », madame: « Cécile » }. */
export function prenomsDuCouple(prenom: string | null | undefined): { monsieur: string; madame: string } {
  const [monsieur = "", ...reste] = (prenom ?? "").split(/\s+(?:et|&)\s+/i);
  return { monsieur: monsieur.trim(), madame: reste.join(" et ").trim() };
}

export const composerPrenomsCouple = (monsieur: string, madame: string): string =>
  [monsieur.trim(), madame.trim()].filter(Boolean).join(" et ");

/**
 * Un couple peut avoir deux adresses électroniques : elles sont gardées dans le champ courriel,
 * séparées par une virgule (« monsieur@…, madame@… »), format que les messageries acceptent telles quelles.
 */
export function courrielsDuCouple(courriel: string | null | undefined): { monsieur: string; madame: string } {
  const [monsieur = "", ...reste] = (courriel ?? "").split(/\s*[,;]\s*/);
  return { monsieur: monsieur.trim(), madame: reste.join(", ").trim() };
}

export const composerCourrielsCouple = (monsieur: string, madame: string): string =>
  [monsieur.trim(), madame.trim()].filter(Boolean).join(", ");

/** Nom complet pour un courrier : « Monsieur & Madame François et Cécile Croison » (couple), sinon « Titre Prénom Nom ». */
export function nomComplet(d: { donateur_titre: string | null; donateur_prenom: string | null; donateur_nom: string | null }): string {
  const titre = estCouple(d.donateur_titre) ? TITRE_COUPLE : (d.donateur_titre ?? "").trim();
  return [titre, (d.donateur_prenom ?? "").trim(), (d.donateur_nom ?? "").trim()].filter(Boolean).join(" ");
}
