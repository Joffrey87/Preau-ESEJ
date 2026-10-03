// Catégories de scolarité : une seule famille « Frais de scolarité », précisée
// par sa caractéristique (mensualités, mois d'avance, frais de dossier). La
// caractéristique fait la colonne de l'onglet Frais de scolarité ; le préfixe
// commun regroupe les trois lignes dans le Bilan.

import type { NatureAffectation } from "@/lib/scolariteDepots";

export const CAT_SCOLARITE = "Frais de scolarité : Mensualités";
export const CAT_MOIS_AVANCE = "Frais de scolarité : Mois d'avance";
export const CAT_FRAIS_DOSSIER = "Frais de scolarité : Dossier";
export const CAT_DON_ASSOCIATION = "Don d'Association";

/**
 * Noms en vigueur avant le 28/09/2026. Tant que la base n'est pas renommée
 * (renommage appliqué au déploiement), les deux jeux de noms sont reconnus.
 */
const ANCIENS_NOMS: Record<string, string> = {
  "Paiement frais de scolarité": CAT_SCOLARITE,
  "Mois d'avance (dépôts)": CAT_MOIS_AVANCE,
  "Frais de dossier": CAT_FRAIS_DOSSIER,
  "Frais de scolarité : Frais de dossier": CAT_FRAIS_DOSSIER,
};

/** Nom canonique d'une catégorie (ancien nom de scolarité → nouveau). */
export function nomCanonique(nom: string | null | undefined): string | null {
  if (!nom) return null;
  return ANCIENS_NOMS[nom] ?? nom;
}

const NATURE_PAR_CATEGORIE: Record<string, NatureAffectation> = {
  [CAT_SCOLARITE]: "mensualite",
  [CAT_MOIS_AVANCE]: "mois_avance",
  [CAT_FRAIS_DOSSIER]: "frais_dossier",
};
export const CATS_SCOLARITE = Object.keys(NATURE_PAR_CATEGORIE);

/** Nature imposée par la catégorie de l'écriture (null : catégorie hors scolarité). */
export function natureParCategorie(nomCategorie: string | null | undefined): NatureAffectation | null {
  const nom = nomCanonique(nomCategorie);
  return nom ? (NATURE_PAR_CATEGORIE[nom] ?? null) : null;
}
export const estCategorieScolarite = (nom: string | null | undefined) => natureParCategorie(nom) !== null;

/** Catégorie portant ce nom canonique, quel que soit le jeu de noms en base. */
export function trouverCategorie<C extends { nom: string; type: string }>(
  categories: C[],
  nom: string,
  type?: string,
): C | undefined {
  return categories.find((c) => nomCanonique(c.nom) === nom && (!type || c.type === type));
}
