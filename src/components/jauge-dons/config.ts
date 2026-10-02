/**
 * Jauge des dons — paramètres partagés.
 * Ce fichier n'a pas de directive "use client" : il peut être importé
 * aussi bien par un composant serveur que par le composant client.
 */

/** Taille d'un bloc de la jauge, en euros. */
export const BLOC = 10_000;
/** Échelle de départ (8 blocs, 0 → 80 000 €) ; au dépassement : 100 000 €, puis +20 000 € à chaque fois. */
export const ECHELLE_INITIALE = 80_000;
export const ECHELLE_SUIVANTE = 100_000;
export const PAS_ECHELLE = 20_000;
/** Équilibre précaire mensuel : pointillé du graphe et légende. */
export const EQUILIBRE_MENSUEL = 5_500;
/** Position du chevron ▼ sur la jauge (équilibre précaire sur l'année) = objectif annuel. */
export const EQUILIBRE = EQUILIBRE_MENSUEL * 12;
/** Seuil « confort » mensuel : légende. */
export const CONFORT_MENSUEL = 6_500;

/** Échelle de la jauge (en euros) pour un total donné. */
export const echelleDe = (total: number) =>
  total <= ECHELLE_INITIALE
    ? ECHELLE_INITIALE
    : ECHELLE_SUIVANTE + Math.ceil(Math.max(0, total - ECHELLE_SUIVANTE) / PAS_ECHELLE) * PAS_ECHELLE;

/** Première médaille 🥉 ; la suivante à 100 000 €, puis tous les 20 000 €. */
const PREMIERE_MEDAILLE = 76_000;

export type Recompense = { emoji: string; libelle: string };

/** Récompenses affichées à côté du total : 🏆 à l'équilibre précaire annuel, puis les médailles. */
export function recompensesDe(total: number): Recompense[] {
  const liste: Recompense[] = [];
  if (total >= EQUILIBRE) {
    liste.push({ emoji: "🏆", libelle: `Objectif atteint : ${EQUILIBRE.toLocaleString("fr-FR")} €` });
  }
  const seuils = [PREMIERE_MEDAILLE];
  for (let s = ECHELLE_SUIVANTE; s <= total; s += PAS_ECHELLE) seuils.push(s);
  for (const s of seuils) {
    if (total >= s) liste.push({ emoji: "🥉", libelle: `Palier de ${s.toLocaleString("fr-FR")} € atteint` });
  }
  return liste;
}

/** Bornes basses des tranches de moyenne mensuelle (€/mois). */
export const SEUILS = { orange: 4_500, jaune: 5_500, vert: 6_500 } as const;

export type Tranche = "rouge" | "orange" | "jaune" | "vert";

export const tranche = (moyenne: number): Tranche =>
  moyenne < SEUILS.orange
    ? "rouge"
    : moyenne < SEUILS.jaune
      ? "orange"
      : moyenne < SEUILS.vert
        ? "jaune"
        : "vert";

export const LIBELLES_TRANCHES: Record<Tranche, string> = {
  rouge: "Tranche rouge : moins de 4 500 €/mois",
  orange: "Tranche orange : 4 500 à 5 500 €/mois",
  jaune: "Tranche jaune : 5 500 à 6 500 €/mois",
  vert: "Tranche verte : 6 500 €/mois et plus",
};

/** Mois de l'exercice (1er septembre → 31 août). */
export const MOIS = [
  "Sept", "Oct", "Nov", "Déc", "Janv", "Févr",
  "Mars", "Avr", "Mai", "Juin", "Juil", "Août",
] as const;

/** Segment de la trace : euros cumulés de `de` à `a`, colorés selon la tranche. */
export type SegmentTrace = { de: number; a: number; tranche: Tranche };
