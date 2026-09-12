// Catégories de donateurs. « Professionnel » et « Société », rencontrés dans
// d'anciens fichiers, désignent la même chose qu'« Entreprise ».

export const CATEGORIES_DONATEUR = [
  "Particulier",
  "Association",
  "Entreprise",
  "Communauté religieuse",
] as const;

const SYNONYMES: Record<string, string> = {
  professionnel: "Entreprise",
  professionnelle: "Entreprise",
  pro: "Entreprise",
  societe: "Entreprise",
  société: "Entreprise",
  sté: "Entreprise",
  entreprise: "Entreprise",
  particulier: "Particulier",
  particuliers: "Particulier",
  association: "Association",
  asso: "Association",
  "communauté religieuse": "Communauté religieuse",
  "communaute religieuse": "Communauté religieuse",
};

/** Ramène une saisie libre à l'une des catégories retenues (ou la laisse telle quelle). */
export function normaliserCategorieDonateur(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return SYNONYMES[t.toLowerCase()] ?? t;
}
