// Catégories de donateurs. La catégorie fait foi : toute catégorie autre que
// « Particulier » désigne une personne morale (le reçu est alors établi à sa
// raison sociale, le nom et le prénom désignent le contact).
// « Professionnel » et « Société », rencontrés dans d'anciens fichiers,
// désignent la même chose qu'« Entreprise ».

export const CATEGORIES_DONATEUR = [
  "Particulier",
  "Entreprise",
  "Association",
  "Fondation",
  "Fonds de dotation",
  "Communauté religieuse",
  "Collectivité ou organisme public",
] as const;

export const CATEGORIE_PARTICULIER = "Particulier";

const SYNONYMES: Record<string, string> = {
  professionnel: "Entreprise",
  professionnelle: "Entreprise",
  "profession liberale": "Entreprise",
  "profession libérale": "Entreprise",
  pro: "Entreprise",
  societe: "Entreprise",
  société: "Entreprise",
  sté: "Entreprise",
  entreprise: "Entreprise",
  particulier: "Particulier",
  particuliers: "Particulier",
  association: "Association",
  asso: "Association",
  fondation: "Fondation",
  "fonds de dotation": "Fonds de dotation",
  "fond de dotation": "Fonds de dotation",
  "communauté religieuse": "Communauté religieuse",
  "communaute religieuse": "Communauté religieuse",
  paroisse: "Communauté religieuse",
  diocèse: "Communauté religieuse",
  diocese: "Communauté religieuse",
  congrégation: "Communauté religieuse",
  congregation: "Communauté religieuse",
  collectivité: "Collectivité ou organisme public",
  collectivite: "Collectivité ou organisme public",
  mairie: "Collectivité ou organisme public",
  commune: "Collectivité ou organisme public",
  "organisme public": "Collectivité ou organisme public",
};

/** Ramène une saisie libre à l'une des catégories retenues (ou la laisse telle quelle). */
export function normaliserCategorieDonateur(v: string | null | undefined): string | null {
  const t = (v ?? "").trim();
  if (!t) return null;
  return SYNONYMES[t.toLowerCase()] ?? t;
}

/** Une catégorie désigne-t-elle une personne morale ? (vide = particulier) */
export function estCategoriePersonneMorale(categorie: string | null | undefined): boolean {
  const c = normaliserCategorieDonateur(categorie);
  return !!c && c !== CATEGORIE_PARTICULIER;
}

/**
 * Catégorie en contradiction avec le type de personne enregistré (ex. « Association »
 * saisie comme particulier). Null si cohérent ou catégorie vide.
 */
export function incoherenceCategorie(d: {
  categorie_donateur: string | null;
  est_personne_morale: boolean;
}): string | null {
  if (!d.categorie_donateur?.trim()) return null;
  const pm = estCategoriePersonneMorale(d.categorie_donateur);
  if (pm === d.est_personne_morale) return null;
  return pm
    ? `Catégorie « ${d.categorie_donateur} » mais saisi comme particulier : renseigner la raison sociale.`
    : "Catégorie « Particulier » mais saisi comme personne morale.";
}
