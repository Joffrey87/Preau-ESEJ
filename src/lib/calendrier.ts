// Calendrier scolaire du journal d'appel : jours sans école (fériés, mercredis, week-ends, vacances de la zone B
// enregistrées dans `calendrier_scolaire`) et taux de présentiel.
//
// Règle (14/10/2026) : le taux de présentiel ne compte que les demi-journées où l'appel a été fait.
// Un retard compte comme une présence.

import { estRetard, type Absence, type Appel } from "@/lib/absences";

export type PeriodeSansEcole = { id: string; annee_scolaire: string; debut: string; fin: string; libelle: string; type: "vacances" | "pont" | "sans_ecole" };

const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const ajouter = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Dimanche de Pâques (algorithme de Meeus). */
function paques(a: number): Date {
  const b = a % 19, c = Math.floor(a / 100), d = a % 100, e = Math.floor(c / 4), f = c % 4, g = Math.floor((c + 8) / 25);
  const h = (19 * b + c - e - Math.floor((c - g + 1) / 3) + 15) % 30, i = Math.floor(d / 4), k = d % 4;
  const l = (32 + 2 * f + 2 * i - h - k) % 7, m = Math.floor((b + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31), jour = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(a, mois - 1, jour);
}

/** Jours fériés français d'une année civile : date ISO → libellé. */
export function joursFeries(a: number): Map<string, string> {
  const p = paques(a);
  return new Map([
    [`${a}-01-01`, "Jour de l'an"],
    [iso(ajouter(p, 1)), "Lundi de Pâques"],
    [`${a}-05-01`, "Fête du Travail"],
    [`${a}-05-08`, "Victoire 1945"],
    [iso(ajouter(p, 39)), "Ascension"],
    [iso(ajouter(p, 50)), "Lundi de Pentecôte"],
    [`${a}-07-14`, "Fête nationale"],
    [`${a}-08-15`, "Assomption"],
    [`${a}-11-01`, "Toussaint"],
    [`${a}-11-11`, "Armistice"],
    [`${a}-12-25`, "Noël"],
  ]);
}

export type Jour = { date: string; ecole: boolean; motif: string | null };

/** Le jour est-il un jour d'école ? Sinon, pourquoi. */
export function jourScolaire(date: string, calendrier: PeriodeSansEcole[]): Jour {
  const d = new Date(`${date}T12:00:00`);
  const js = d.getDay();
  if (js === 0) return { date, ecole: false, motif: "Dimanche" };
  if (js === 6) return { date, ecole: false, motif: "Samedi" };
  if (js === 3) return { date, ecole: false, motif: "Mercredi" };
  const ferie = joursFeries(d.getFullYear()).get(date);
  if (ferie) return { date, ecole: false, motif: `Férié — ${ferie}` };
  const p = calendrier.find((c) => c.debut <= date && date <= c.fin);
  if (p) return { date, ecole: false, motif: p.libelle };
  return { date, ecole: true, motif: null };
}

/** Les jours (ISO) d'un mois, du 1er au dernier. */
export function joursDuMois(annee: number, mois0: number): string[] {
  const n = new Date(annee, mois0 + 1, 0).getDate();
  return Array.from({ length: n }, (_, i) => iso(new Date(annee, mois0, i + 1)));
}

/** Bornes approximatives d'une année scolaire « 2026-2027 » : 1er septembre → 31 juillet. */
export const bornesAnnee = (annee: string) => {
  const a = Number(annee.slice(0, 4));
  return { debut: `${a}-09-01`, fin: `${a + 1}-07-31` };
};

export type Presentiel = { demiJourneesAppel: number; absences: number; justifiees: number; retards: number; taux: number | null };

/**
 * Taux de présentiel d'un élève : demi-journées d'appel de sa classe (jusqu'à sa sortie éventuelle) moins ses
 * demi-journées d'absence relevées ces jours-là, rapportées aux demi-journées d'appel.
 */
export function presentiel(appels: Pick<Appel, "date" | "demi_journee">[], absences: Pick<Absence, "date" | "demi_journee" | "type">[], sortiLe?: string | null): Presentiel {
  const faits = new Set(appels.filter((a) => !sortiLe || a.date < sortiLe).map((a) => `${a.date}|${a.demi_journee}`));
  let abs = 0, just = 0, ret = 0;
  for (const a of absences) {
    if (!faits.has(`${a.date}|${a.demi_journee}`)) continue;
    if (estRetard(a.type)) ret++;
    else {
      abs++;
      if (a.type !== "absence_injustifiee") just++;
    }
  }
  const n = faits.size;
  return { demiJourneesAppel: n, absences: abs, justifiees: just, retards: ret, taux: n ? (n - abs) / n : null };
}

export const tauxTexte = (t: number | null) => (t === null ? "–" : `${(t * 100).toFixed(1).replace(".", ",")} %`);
