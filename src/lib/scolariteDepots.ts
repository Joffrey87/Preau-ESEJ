/**
 * Mois d'avance et frais de dossier, calculés depuis la Comptabilité.
 *
 * Règles (décidées le 20/09/2026) :
 * - le MOIS D'AVANCE est un dépôt versé UNE seule fois par enfant, l'été qui
 *   précède son entrée. La famille doit détenir en dépôt l'équivalent d'un mois
 *   à son tarif courant (220 pour 1 enfant, 430 pour 2, 630 pour 3…). Quand un
 *   enfant termine sa scolarité à l'école, son dernier mois n'est pas dû : le
 *   dépôt l'éponge (`avance_consommee` sur l'inscription de cette année-là).
 *   Si l'enfant part et que le dépôt n'est ni consommé ni rendu, il reste dans
 *   les comptes de l'école — à traiter (restitution ou don de la famille).
 * - les FRAIS DE DOSSIER sont de 60 € par enfant entrant.
 *
 * Les deux sont alimentés par les affectations `mois_avance` et `frais_dossier`
 * posées sur les opérations de la Comptabilité.
 */

export const FRAIS_DOSSIER_PAR_ENFANT = 60;

export type NatureAffectation = "don_association" | "mensualite" | "mois_avance" | "frais_dossier";

export const NATURES: { v: NatureAffectation; l: string; court: string }[] = [
  { v: "mensualite", l: "Mensualité de scolarité", court: "mensualité" },
  { v: "mois_avance", l: "Mois d'avance (dépôt)", court: "dépôt" },
  { v: "frais_dossier", l: "Frais de dossier", court: "frais de dossier" },
  { v: "don_association", l: "Don d'association fléché", court: "don" },
];

export function libelleNature(n: string): string {
  return NATURES.find((x) => x.v === n)?.court ?? n;
}

/** Inscription réduite à ce qui sert au calcul, toutes années confondues. */
export type InscriptionDepot = {
  id: string;
  annee_scolaire: string;
  famille_nom: string;
  nb_enfants: number | null;
  montant_mensuel: number;
  avance: number | null;
  avance_consommee: number | null;
  /** Dépôt versé avant les données de la comptabilité (saisi à la main). */
  depot_anterieur?: number | null;
};

/** Affectation enrichie de l'opération d'origine. */
export type AffectationDetail = {
  inscription_id: string;
  nature: NatureAffectation;
  montant: number;
  libelle: string;
  date_operation: string;
  /** Une dépense fléchée « mois d'avance » est une restitution. */
  type: "recette" | "depense";
  /** Qui a payé : « Amitié Sainte-Anne », une autre association, ou la famille. */
  origine?: string;
};

export type EtatDepot = {
  /** Dépôt que la famille doit détenir : un mois à son tarif courant. */
  du: number;
  /** Dépôt détenu : versements − restitutions − parts consommées. */
  detenu: number;
  /** Solde après consommation cumulée. */
  ecart: number;
  couleur: "vert" | "jaune" | "violet" | "gris";
  /** Enfants ayant quitté l'école depuis l'année précédente. */
  departs: number;
  details: AffectationDetail[];
  /** Report du classeur (colonne « Avance »), à titre indicatif. */
  reportClasseur: number;
  /** Dépôt antérieur aux données de la comptabilité, saisi à la main. */
  anterieur: number;
};

export type EtatFraisDossier = {
  nouveaux: number;
  du: number;
  paye: number;
  couleur: "vert" | "jaune" | "gris" | "bleu";
  details: AffectationDetail[];
};

const cle = (nom: string) => nom.trim().toLowerCase().replace(/\s+/g, " ");

function anneePrecedente(annee: string): string {
  const m = annee.match(/^(\d{4})-(\d{4})$/);
  return m ? `${Number(m[1]) - 1}-${Number(m[2]) - 1}` : "";
}

/**
 * État du dépôt d'une famille pour l'année consultée. Les versements sont pris
 * sur toutes les inscriptions de la famille jusqu'à cette année incluse, car le
 * dépôt suit la famille d'une année sur l'autre.
 */
export function etatDepot(
  inscription: InscriptionDepot,
  toutes: InscriptionDepot[],
  affectations: AffectationDetail[],
): EtatDepot {
  const k = cle(inscription.famille_nom);
  const famille = toutes.filter((i) => cle(i.famille_nom) === k && i.annee_scolaire <= inscription.annee_scolaire);
  const ids = new Set(famille.map((i) => i.id));
  const details = affectations
    .filter((a) => a.nature === "mois_avance" && ids.has(a.inscription_id))
    .sort((a, b) => a.date_operation.localeCompare(b.date_operation));
  const verse = details.reduce((s, a) => s + (a.type === "depense" ? -a.montant : a.montant), 0);
  const consomme = famille.reduce((s, i) => s + (Number(i.avance_consommee) || 0), 0);
  const anterieur = famille.reduce((s, i) => s + (Number(i.depot_anterieur) || 0), 0);
  const detenu = Math.round((verse + anterieur - consomme) * 100) / 100;
  const du = Number(inscription.montant_mensuel) || 0;

  const prec = toutes.find(
    (i) => cle(i.famille_nom) === k && i.annee_scolaire === anneePrecedente(inscription.annee_scolaire),
  );
  const departs = prec ? Math.max(0, (prec.nb_enfants ?? 0) - (inscription.nb_enfants ?? 0)) : 0;

  let couleur: EtatDepot["couleur"] = "gris";
  if (details.length > 0 || consomme > 0 || anterieur > 0) {
    if (departs > 0 && detenu > du + 0.005) couleur = "violet";
    else if (detenu >= du - 0.005) couleur = "vert";
    else couleur = "jaune";
  } else if (du > 0) {
    couleur = "jaune";
  }
  return {
    du,
    detenu,
    ecart: Math.round((detenu - du) * 100) / 100,
    couleur,
    departs,
    details,
    reportClasseur: Number(inscription.avance) || 0,
    anterieur,
  };
}

/** Familles présentes l'année précédente et absentes cette année, avec un dépôt encore détenu. */
export function famillesParties(
  annee: string,
  toutes: InscriptionDepot[],
  affectations: AffectationDetail[],
): { famille_nom: string; detenu: number; details: AffectationDetail[] }[] {
  const prec = anneePrecedente(annee);
  const presentes = new Set(toutes.filter((i) => i.annee_scolaire === annee).map((i) => cle(i.famille_nom)));
  const out: { famille_nom: string; detenu: number; details: AffectationDetail[] }[] = [];
  for (const i of toutes.filter((x) => x.annee_scolaire === prec)) {
    if (presentes.has(cle(i.famille_nom))) continue;
    const e = etatDepot(i, toutes, affectations);
    if (e.detenu > 0.005) out.push({ famille_nom: i.famille_nom, detenu: e.detenu, details: e.details });
  }
  return out;
}

/** Frais de dossier dus et réglés pour l'année : 60 € par enfant entrant. */
export function etatFraisDossier(
  inscription: InscriptionDepot,
  toutes: InscriptionDepot[],
  affectations: AffectationDetail[],
): EtatFraisDossier {
  const k = cle(inscription.famille_nom);
  const prec = toutes.find(
    (i) => cle(i.famille_nom) === k && i.annee_scolaire === anneePrecedente(inscription.annee_scolaire),
  );
  const nouveaux = prec
    ? Math.max(0, (inscription.nb_enfants ?? 0) - (prec.nb_enfants ?? 0))
    : inscription.nb_enfants ?? 0;
  const du = nouveaux * FRAIS_DOSSIER_PAR_ENFANT;
  const details = affectations
    .filter((a) => a.nature === "frais_dossier" && a.inscription_id === inscription.id)
    .sort((a, b) => a.date_operation.localeCompare(b.date_operation));
  const paye = details.reduce((s, a) => s + (a.type === "depense" ? -a.montant : a.montant), 0);
  let couleur: EtatFraisDossier["couleur"] = "gris";
  if (du > 0 && paye >= du - 0.005) couleur = "vert";
  else if (du > 0) couleur = "jaune";
  else if (paye > 0) couleur = "bleu";
  return { nouveaux, du, paye, couleur, details };
}
