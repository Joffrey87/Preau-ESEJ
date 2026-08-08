// Tableau de bord Mécénat : agrégats (fonction SQL mecenat_stats) confrontés aux
// cibles du plan global de financement V3 (palier 1, 26-30 élèves).

export type ExerciceStat = {
  id: string;
  libelle: string;
  date_debut: string;
  date_fin: string;
  dons: number;
  ventes_brut: number;
  ventes_fournitures: number;
  total_recettes: number;
  total_depenses: number;
};

export type SaisonStat = { mois: number; dons: number; nb: number };

export type MecenatStats = {
  exercices: ExerciceStat[];
  saisonnalite: SaisonStat[];
};

// Cibles issues du plan V3 (tableau de bord palier 1).
export const CIBLES = {
  collecteDons: 60000, // ≥ 60 k€/an
  partDonsMax: 47, // dépendance aux dons à ramener vers ~47 %
  margeVentes: 10000, // marge nette ventes + événements + périscolaire ≥ 10 k€
  partTop5Max: 25, // part des 5 premiers donateurs < 25 %
} as const;

export const num = (v: unknown) => Number(v ?? 0) || 0;

/** Marge nette des ventes au profit de l'école (pilier C) pour un exercice. */
export function margeVentes(e: ExerciceStat): number {
  return num(e.ventes_brut) - num(e.ventes_fournitures);
}

/** Part des dons dans les produits (%) — indicateur de dépendance. */
export function partDons(e: ExerciceStat): number {
  const t = num(e.total_recettes);
  return t > 0 ? (num(e.dons) / t) * 100 : 0;
}
