import { tranche, type SegmentTrace } from "./config";

/** Un don tel que Préau le connaît : date de réception et montant en euros. */
export type Don = { date: Date | string; montant: number };

export type DonneesJauge = {
  total: number;
  /** Moyenne annuelle en €/mois (non arrondie). */
  moyenne: number;
  /** 12 valeurs de septembre à août ; null pour les mois pas encore commencés. */
  moyennesMensuelles: (number | null)[];
  trace: SegmentTrace[];
};

const JOUR = 86_400_000;
const JOURS_PAR_MOIS = 365.25 / 12; // 30,4375

/** Ramène une date à minuit UTC du même jour calendaire (insensible aux changements d'heure). */
function versJour(d: Date | string): number {
  if (typeof d === "string") {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
    if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
    d = new Date(d);
  }
  return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/**
 * Calcule les données de la jauge à partir des dons de l'exercice.
 *
 * Moyenne = total reçu ÷ jours écoulés (inclus) × 30,44 jours.
 * Chaque mois, les euros reçus prennent la couleur de la moyenne en fin de mois
 * (ou à aujourd'hui pour le mois en cours) : c'est ce qui dessine la trace.
 *
 * @param dons           dons reçus (les dates hors exercice sont ignorées)
 * @param debutExercice  1er jour de l'exercice, ex. "2026-09-01"
 * @param aujourdhui     date de calcul (par défaut : maintenant)
 */
export function preparerJaugeDons(
  dons: Don[],
  debutExercice: Date | string,
  aujourdhui: Date | string = new Date(),
): DonneesJauge {
  const d0 = versJour(debutExercice);
  const debut = new Date(d0);
  const an = debut.getUTCFullYear();
  const mois0 = debut.getUTCMonth();
  const finExercice = Date.UTC(an + 1, mois0, 1) - JOUR;
  const auj = Math.min(versJour(aujourdhui), finExercice);

  if (auj < d0) {
    return { total: 0, moyenne: 0, moyennesMensuelles: Array(12).fill(null), trace: [] };
  }

  const liste = dons
    .map((d) => ({ jour: versJour(d.date), montant: d.montant }))
    .filter((d) => d.jour >= d0 && d.jour <= auj);

  const cumulAu = (jour: number) =>
    liste.reduce((somme, d) => (d.jour <= jour ? somme + d.montant : somme), 0);
  const moyenneAu = (jour: number, cumul: number) =>
    (cumul / ((jour - d0) / JOUR + 1)) * JOURS_PAR_MOIS;

  const moyennesMensuelles: (number | null)[] = [];
  const trace: SegmentTrace[] = [];
  let cumulPrecedent = 0;

  for (let m = 0; m < 12; m++) {
    if (Date.UTC(an, mois0 + m, 1) > auj) {
      moyennesMensuelles.push(null);
      continue;
    }
    const borne = Math.min(Date.UTC(an, mois0 + m + 1, 1) - JOUR, auj);
    const cumul = cumulAu(borne);
    const moyenne = moyenneAu(borne, cumul);
    moyennesMensuelles.push(moyenne);

    if (cumul > cumulPrecedent) {
      const t = tranche(moyenne);
      const dernier = trace[trace.length - 1];
      if (dernier && dernier.tranche === t) dernier.a = cumul;
      else trace.push({ de: cumulPrecedent, a: cumul, tranche: t });
    }
    cumulPrecedent = cumul;
  }

  return {
    total: cumulPrecedent,
    moyenne: moyenneAu(auj, cumulPrecedent),
    moyennesMensuelles,
    trace,
  };
}
