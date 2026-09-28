// Retard de paiement des frais de scolarité, au jour J.
//
// Règles (trésorier, 29/09/2026) :
//  - une mensualité se règle au plus tard à la fin de son mois (septembre → juin) ;
//  - EN RETARD : ce qui était dû avant le mois en cours et n'est pas réglé ;
//  - À RÉGLER AVANT LA FIN DU MOIS : à partir du 27, la mensualité du mois
//    en cours pas encore réglée (signal orange).
// La part de juin non due (enfant en CM2) est retirée du dû de juin.

/** Mensualités échues au jour J, mois en cours compris (0 avant septembre, 10 après juin). */
export function moisEchus(annee: string, aujourdhui: string): number {
  const debut = Number(annee.slice(0, 4));
  const y = Number(aujourdhui.slice(0, 4));
  const m = Number(aujourdhui.slice(5, 7));
  if (y < debut || (y === debut && m < 9)) return 0;
  if (y > debut + 1 || (y === debut + 1 && m > 6)) return 10;
  return y === debut ? m - 8 : m + 4;
}

export type EtatPaiement = {
  /** Montant en retard (dû avant le mois en cours, non réglé). */
  retard: number;
  /** Reste de la mensualité du mois en cours, signalé à partir du 27. */
  aReglerFinDeMois: number;
  /** Trop-perçu sur l'année (réglé au-delà du dû). */
  tropPercu: number;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

export function etatPaiement(
  annee: string,
  mensuel: number,
  du: number,
  regle: number,
  aujourdhui: string,
  partJuin = 0,
): EtatPaiement {
  const echus = moisEchus(annee, aujourdhui);
  const apresJuin = moisEchus(annee, aujourdhui) === 10 && aujourdhui.slice(5, 7) !== "06";
  // Dû avant le mois en cours ; après juin, tout est échu.
  const moisClos = apresJuin ? 10 : Math.max(0, echus - 1);
  const duAvant = Math.min(du, moisClos * mensuel - (moisClos === 10 ? partJuin : 0));
  const duFinMois = Math.min(du, echus * mensuel - (echus === 10 ? partJuin : 0));
  const retard = arrondi(Math.max(0, duAvant - regle));
  const jour = Number(aujourdhui.slice(8, 10));
  const aReglerFinDeMois =
    !apresJuin && echus > 0 && retard === 0 && jour >= 27 ? arrondi(Math.max(0, duFinMois - regle)) : 0;
  return { retard, aReglerFinDeMois, tropPercu: arrondi(Math.max(0, regle - du)) };
}
