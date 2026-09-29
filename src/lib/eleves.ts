// Élèves : classe actuelle, fin de scolarité, part de juin non due.
//
// Règles (trésorier, 29/09/2026) :
//  - la classe se déduit de la classe et de l'année d'entrée à l'ESEJ, corrigée
//    d'un éventuel redoublement ou saut de classe (`decalage`) ;
//  - un enfant en CM2 termine sa scolarité à l'école en juin : pour la famille,
//    le mois de juin n'est pas dû pour CET enfant (sa part est couverte par le
//    mois d'avance). La part = mensuel de la famille − mensuel avec un enfant
//    de moins (barème de l'année).
//  - le prénom est enregistré en clair : l'accès aux élèves est réservé au
//    bureau, et chaque famille ne voit que ses propres enfants.

export const CLASSES = ["PS", "MS", "GS", "CP", "CE1", "CE2", "CM1", "CM2"] as const;
export type Classe = (typeof CLASSES)[number];

export type Eleve = {
  id: string;
  famille_id?: string;
  prenom?: string | null;
  initiale: string | null;
  classe_entree: Classe;
  annee_entree: string;
  decalage: number;
  sorti_le: string | null;
};

const debut = (annee: string) => Number(annee.slice(0, 4));

/** Prénom de l'élève ; à défaut, son initiale. */
export const prenomEleve = (e: Pick<Eleve, "prenom" | "initiale">): string =>
  e.prenom?.trim() || (e.initiale ? `${e.initiale}.` : "Enfant");

/** Classe de l'élève pour une année scolaire ; null s'il n'est pas (ou plus) à l'école. */
export function classeEn(e: Eleve, annee: string): Classe | null {
  if (e.sorti_le && e.sorti_le < `${debut(annee)}-09-01`) return null;
  const i = CLASSES.indexOf(e.classe_entree) + debut(annee) - debut(e.annee_entree) + (e.decalage ?? 0);
  if (debut(annee) < debut(e.annee_entree) || i < 0 || i >= CLASSES.length) return null;
  return CLASSES[i];
}

/** Dernière année à l'école : l'élève est en CM2. */
export const termineEnJuin = (e: Eleve, annee: string) => classeEn(e, annee) === "CM2";

/** « depuis la PS (2019-2020) ». */
export const depuis = (e: Eleve) =>
  `depuis ${["PS", "MS", "GS"].includes(e.classe_entree) ? "la" : "le"} ${e.classe_entree} (${e.annee_entree})`;

/** Élèves scolarisés à l'école cette année-là. */
export const scolarises = (eleves: Eleve[], annee: string) => eleves.filter((e) => classeEn(e, annee) !== null);

/**
 * Part du mois de juin non due : pour chaque enfant en CM2, la différence
 * entre le mensuel de la famille et celui qu'elle paierait avec un enfant de
 * moins (barème de l'année). À défaut de barème, une part égale par enfant.
 */
export function partJuinNonDue(
  inscription: { annee_scolaire: string; montant_mensuel: number; nb_enfants: number | null },
  eleves: Eleve[],
  bareme: Record<number, number>,
): { montant: number; enfants: Eleve[] } {
  const enfants = eleves.filter((e) => termineEnJuin(e, inscription.annee_scolaire));
  if (enfants.length === 0) return { montant: 0, enfants };
  const nb = inscription.nb_enfants ?? scolarises(eleves, inscription.annee_scolaire).length;
  const mensuel = Number(inscription.montant_mensuel) || 0;
  const reste = Math.max(0, nb - enfants.length);
  const apres = reste === 0 ? 0 : bareme[reste];
  const montant =
    apres !== undefined ? Math.max(0, mensuel - apres) : nb > 0 ? (mensuel / nb) * enfants.length : 0;
  return { montant: Math.round(montant * 100) / 100, enfants };
}
