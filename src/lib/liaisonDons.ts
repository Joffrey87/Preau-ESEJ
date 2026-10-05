// Liaison des sous-écritures « Don » de la comptabilité aux dons de l'onglet Dons
// (donc aux reçus fiscaux) : propositions classées, jamais appliquées d'office.
//
// Critères : le nom du donateur retrouvé dans les libellés de l'écriture, la date
// (à ±1 mois de l'écriture) et le montant. Seuls les dons encore « hors compta »
// (sans écriture reliée) sont proposés.

import { normaliser } from "@/lib/reconciliation";
import { nomDonateur } from "@/lib/statutDon";
import type { DonCompta } from "@/components/PastilleDon";

/** Fenêtre de recherche autour de la date de l'écriture. */
export const FENETRE_JOURS = 35;

const PARTICULES = new Set(["de", "du", "des", "la", "le", "les", "van", "von", "et", "mme", "mr", "monsieur", "madame"]);

/** Clé d'identité d'un donateur : nom et prénom (ou raison sociale), en minuscules. */
const cleIdentite = (d: DonCompta): string =>
  (d.est_personne_morale ? (d.raison_sociale ?? d.donateur_nom ?? "") : `${d.donateur_nom ?? ""}|${d.donateur_prenom ?? ""}`).toLowerCase().replace(/\s+/g, " ").trim();

const ecartJours = (a: string, b: string): number => {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.abs(Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000));
};

const motsDe = (s: string | null | undefined): string[] =>
  normaliser(s ?? "")
    .split(" ")
    .filter((m) => m.length > 2 && !PARTICULES.has(m));

/** Part des mots du nom du donateur (nom, prénom ou raison sociale) retrouvés dans le texte : de 0 à 1. */
export function ressemblanceNom(texte: string | null, don: DonCompta): number {
  const donateur = [don.est_personne_morale ? don.raison_sociale : null, don.donateur_nom, don.donateur_prenom];
  const mots = [...new Set(donateur.flatMap(motsDe))].filter((m) => m !== "verrouille");
  if (mots.length === 0 || !texte) return 0;
  const presents = new Set(motsDe(texte));
  return mots.filter((m) => presents.has(m)).length / mots.length;
}

export type Cible = { date: string; montant: number; texte: string | null };

/** Donateur connu de la base (nom et prénom, ou organisme), pour reconnaître un nom dans un intitulé. */
export type IdentiteConnue = { cle: string; don: DonCompta };

/** Identités distinctes des dons : une entrée par donateur (nom + prénom, ou raison sociale). */
export function construireIdentites(dons: DonCompta[]): IdentiteConnue[] {
  const res = new Map<string, IdentiteConnue>();
  for (const d of dons) {
    const complete = d.est_personne_morale ? !!(d.raison_sociale ?? "").trim() : !!(d.donateur_nom ?? "").trim() && !!(d.donateur_prenom ?? "").trim();
    if (!complete) continue;
    const cle = cleIdentite(d);
    if (!res.has(cle)) res.set(cle, { cle, don: d });
  }
  return [...res.values()];
}

const nomDeFamille = (d: DonCompta) => normaliser(d.donateur_nom ?? "").replace(/\s+/g, " ").trim();

/**
 * Cet intitulé permet-il de lier ce don ? Si l'intitulé porte le nom ET le prénom d'un donateur connu, seul
 * un don de ce donateur est possible : jamais un donateur d'un autre nom. Un don d'un autre donateur de la
 * même famille (même nom de famille, autre prénom) reste seulement suspecté. Un intitulé sans nom
 * de donateur connu ne limite rien.
 */
export function compatibleAvecIntitule(texte: string | null, don: DonCompta, identites: IdentiteConnue[] | undefined): "ok" | "famille" | "non" {
  if (!texte || !identites || identites.length === 0) return "ok";
  const nommes = identites.filter((i) => ressemblanceNom(texte, i.don) >= 0.999);
  if (nommes.length === 0) return "ok";
  const propre = cleIdentite(don);
  if (nommes.some((n) => n.cle === propre)) return "ok";
  if (!don.est_personne_morale && nomDeFamille(don) && nommes.some((n) => !n.don.est_personne_morale && nomDeFamille(n.don) === nomDeFamille(don))) return "famille";
  return "non";
}

export type Candidat = {
  don: DonCompta;
  /** Écart de jours entre le don et l'écriture. */
  jours: number;
  /** Montant du don moins celui de l'écriture. */
  ecart: number;
  /** Ressemblance du nom, de 0 à 1. */
  nom: number;
  /** Score de classement, de 0 à 100. */
  score: number;
};

function noter(cible: Cible, don: DonCompta): Candidat {
  const jours = ecartJours(don.date_don, cible.date);
  const ecart = Number(don.montant) - cible.montant;
  const nom = ressemblanceNom(cible.texte, don);
  const montant = Math.abs(ecart) < 0.005 ? 30 : Math.max(0, 30 - (30 * Math.abs(ecart)) / Math.max(cible.montant, 1));
  const date = Math.max(0, 20 - (20 * jours) / FENETRE_JOURS);
  return { don, jours, ecart, nom, score: Math.round(nom * 50 + montant + date) };
}

/** Jours d'écart tolérés pour un rapprochement « fort ». */
export const JOURS_LIEN_FORT = 3;

/**
 * Correspondance forte : le nom du donateur est retrouvé en entier dans l'intitulé, la date est à
 * ±3 jours et le montant est exact. Elle suffit à lier sans demander, et elle écarte les
 * propositions plus faibles (date à +10 ou +30 jours, montant approché, nom partiel).
 */
export const estFort = (c: Candidat): boolean => c.nom >= 0.999 && c.jours <= JOURS_LIEN_FORT && Math.abs(c.ecart) < 0.005;

/**
 * Dons « hors compta » à proposer pour une écriture : à ±1 mois, classés par
 * score. Un don n'est retenu que s'il a au moins un point commun fort (nom
 * reconnu, ou montant exact).
 */
export function candidatsPour(cible: Cible, libres: DonCompta[], max = 8, identites?: IdentiteConnue[]): Candidat[] {
  const trouves = libres
    .filter((d) => !d.operation_id && ecartJours(d.date_don, cible.date) <= FENETRE_JOURS && compatibleAvecIntitule(cible.texte, d, identites) !== "non")
    .map((d) => noter(cible, d))
    .filter((c) => c.nom > 0 || Math.abs(c.ecart) < 0.005)
    .sort((a, b) => b.score - a.score);
  // Une correspondance forte écarte les propositions qui ont moins d'informations en commun.
  const forts = trouves.filter(estFort);
  return (forts.length > 0 ? forts : trouves).slice(0, max);
}

export type Proposition = {
  dons: Candidat[];
  somme: number;
  /** Somme du lot moins le montant à ventiler. */
  ecart: number;
  /** La somme tombe juste. */
  exacte: boolean;
  score: number;
};

/**
 * Lots de dons « hors compta » (jusqu'à 4) dont la somme égale ou approche le
 * montant à ventiler : exacte d'abord, sinon à moins de 5 % (2 € minimum). Les
 * lots dont aucun don ne ressemble à l'écriture ne sont gardés que si la somme
 * est exacte.
 */
export function propositionsVentilation(cible: Cible, libres: DonCompta[], max = 3): Proposition[] {
  const reste = cible.montant;
  const pool = libres
    .filter((d) => !d.operation_id && ecartJours(d.date_don, cible.date) <= FENETRE_JOURS && Number(d.montant) <= reste + Math.max(2, reste * 0.05))
    .map((d) => noter({ ...cible, montant: Number(d.montant) }, d))
    .sort((a, b) => b.nom - a.nom || a.jours - b.jours)
    .slice(0, 14);
  const tolerance = Math.max(2, reste * 0.05);
  const resultats: Proposition[] = [];

  const explorer = (debut: number, choisis: Candidat[], somme: number) => {
    if (choisis.length > 0) {
      const ecart = Math.round((somme - reste) * 100) / 100;
      const exacte = Math.abs(ecart) < 0.005;
      if (exacte || Math.abs(ecart) <= tolerance) {
        const nomMoyen = choisis.reduce((s, c) => s + c.nom, 0) / choisis.length;
        const joursMoyen = choisis.reduce((s, c) => s + c.jours, 0) / choisis.length;
        if (nomMoyen > 0 || exacte) {
          resultats.push({
            dons: choisis,
            somme,
            ecart,
            exacte,
            score: Math.round(nomMoyen * 50 + (exacte ? 30 : 10) + Math.max(0, 20 - (20 * joursMoyen) / FENETRE_JOURS) - choisis.length),
          });
        }
      }
    }
    if (choisis.length === 4) return;
    for (let i = debut; i < pool.length; i++) {
      const s = somme + Number(pool[i].don.montant);
      if (s > reste + tolerance) continue;
      explorer(i + 1, [...choisis, pool[i]], s);
    }
  };
  explorer(0, [], 0);

  return resultats.sort((a, b) => b.score - a.score).slice(0, max);
}

/** Libellé court d'un don pour les listes de choix. */
export const libelleDonLie = (d: DonCompta): string => nomDonateur(d) || "—";

// ---------------------------------------------------------------------------
// Rapprochement global (toutes les années) : liens sûrs et catégories de doute.
// ---------------------------------------------------------------------------

export type EcritureDon = { id: string; date: string; montant: number; texte: string | null; exerciceId: string | null };

export type LienSur = {
  ecriture: EcritureDon;
  don: DonCompta;
  /** Écart de jours entre le don et l'écriture. */
  jours: number;
  /** Date à ±3 jours : coché par défaut. Plus éloignée : à cocher après vérification. */
  proche: boolean;
  /** Ressemblance du nom (de 0 à 1) et écart de montant (don moins écriture), pour le tableau. */
  nom: number;
  ecart: number;
};

export type CleDoute = "plusieurs_dons" | "don_pour_plusieurs" | "nom_different" | "montant_different" | "aucun_don";

export const LIBELLE_DOUTE: Record<CleDoute, string> = {
  plusieurs_dons: "Plusieurs dons possibles pour une même écriture (à lier manuellement)",
  don_pour_plusieurs: "Un même don possible pour plusieurs écritures (à lier manuellement)",
  nom_different: "Montant exact, mais le nom de l'intitulé ne correspond pas à celui du don (à lier manuellement)",
  montant_different: "Nom reconnu, mais montant différent (à lier manuellement)",
  aucun_don: "Aucun don correspondant (don à créer, ou don hors compta sans écriture)",
};

export type Doute = { ecriture: EcritureDon; cle: CleDoute; dons: Candidat[] };

/**
 * Liens que la fonction peut poser pour des écritures « Don » sans don, et doutes pour les autres.
 * Conditions : le nom du donateur figure en entier dans l'intitulé bancaire (un don sans nom lisible ne
 * se lie pas), le montant est exact, la date est à ±35 jours, et il n'y a qu'un don possible pour
 * l'écriture comme qu'une écriture possible pour ce don. Un nom différent ou un montant inexact ne
 * se lient jamais ici : c'est à faire à la main. Si des dons sont à ±3 jours, les plus éloignés sont écartés.
 */
export function analyserLiaisons(ecritures: EcritureDon[], libres: DonCompta[], identites?: IdentiteConnue[]): { surs: LienSur[]; doutes: Doute[] } {
  type Eval = { ecriture: EcritureDon; cands: Candidat[]; nomDifferent: Candidat[]; montantDifferent: Candidat[] };
  const evals: Eval[] = ecritures.map((e) => {
    const cible: Cible = { date: e.date, montant: e.montant, texte: e.texte };
    const proches = libres
      .filter((d) => ecartJours(d.date_don, e.date) <= FENETRE_JOURS && compatibleAvecIntitule(e.texte, d, identites) !== "non")
      .map((d) => noter(cible, d));
    const exacts = proches.filter((c) => Math.abs(c.ecart) < 0.005);
    const avecNom = exacts.filter((c) => c.nom >= 0.999);
    const tresProches = avecNom.filter((c) => c.jours <= JOURS_LIEN_FORT);
    return {
      ecriture: e,
      cands: tresProches.length > 0 ? tresProches : avecNom,
      nomDifferent: exacts.filter((c) => c.nom < 0.999 && c.jours <= JOURS_LIEN_FORT),
      montantDifferent: proches.filter((c) => c.nom >= 0.999 && Math.abs(c.ecart) >= 0.005),
    };
  });

  const ecrituresDe = new Map<string, string[]>();
  for (const ev of evals) for (const c of ev.cands) ecrituresDe.set(c.don.id, [...(ecrituresDe.get(c.don.id) ?? []), ev.ecriture.id]);

  const surs: LienSur[] = [];
  const doutes: Doute[] = [];
  for (const ev of evals) {
    if (ev.cands.length === 1 && (ecrituresDe.get(ev.cands[0].don.id)?.length ?? 0) === 1) {
      const c = ev.cands[0];
      surs.push({ ecriture: ev.ecriture, don: c.don, jours: c.jours, proche: c.jours <= JOURS_LIEN_FORT, nom: c.nom, ecart: c.ecart });
    } else if (ev.cands.length > 1) doutes.push({ ecriture: ev.ecriture, cle: "plusieurs_dons", dons: ev.cands });
    else if (ev.cands.length === 1) doutes.push({ ecriture: ev.ecriture, cle: "don_pour_plusieurs", dons: ev.cands });
    else if (ev.nomDifferent.length > 0) doutes.push({ ecriture: ev.ecriture, cle: "nom_different", dons: ev.nomDifferent });
    else if (ev.montantDifferent.length > 0) doutes.push({ ecriture: ev.ecriture, cle: "montant_different", dons: ev.montantDifferent });
    else doutes.push({ ecriture: ev.ecriture, cle: "aucun_don", dons: [] });
  }
  return { surs, doutes };
}

// ---------------------------------------------------------------------------
// Depuis un don : écritures comptables « Don » qui pourraient lui correspondre.
// ---------------------------------------------------------------------------

export type EcritureCandidate = {
  ecriture: EcritureDon;
  /** Écart de jours entre le don et l'écriture. */
  jours: number;
  /** Montant du don moins celui de l'écriture. */
  ecart: number;
  /** Ressemblance du nom du donateur avec l'intitulé de l'écriture, de 0 à 1. */
  nom: number;
  score: number;
};

/**
 * Écritures « Don » (sans don) proches de ce don, classées par score : nom retrouvé dans l'intitulé,
 * montant, date. Ne sont retenues que celles qui ont un point commun fort (nom reconnu ou montant exact).
 */
export function ecrituresPour(don: DonCompta, ecritures: EcritureDon[], fenetre = FENETRE_JOURS, max = 10, identites?: IdentiteConnue[]): EcritureCandidate[] {
  return ecritures
    .filter((e) => ecartJours(don.date_don, e.date) <= fenetre && compatibleAvecIntitule(e.texte, don, identites) !== "non")
    .map((e) => {
      const c = noter({ date: e.date, montant: e.montant, texte: e.texte }, don);
      return { ecriture: e, jours: c.jours, ecart: c.ecart, nom: c.nom, score: c.score };
    })
    .filter((c) => c.nom > 0 || Math.abs(c.ecart) < 0.005)
    .sort((a, b) => b.score - a.score)
    .slice(0, max);
}
