// Absences et retards : un élève, une demi-journée (appel du matin ou de l'après-midi).
//
// Règles (13/10/2026, reprises d'École Futée) :
//  - la titulaire fait l'appel de sa classe ; la Directrice corrige et justifie ;
//  - le bulletin porte le total de la période : demi-journées d'absence (dont justifiées) et retards ;
//  - la famille lit le détail dans l'onglet « Absences » de son espace.

export type DemiJournee = "matin" | "apres_midi";
export type TypeAbsence = "absence_injustifiee" | "absence_justifiee" | "rdv_medical" | "imperatif_familial" | "retard" | "retard_excuse";
export type Absence = {
  id: string;
  eleve_id: string;
  date: string;
  demi_journee: DemiJournee;
  type: TypeAbsence;
  remarque: string | null;
  source?: string | null;
};
export type Appel = { id: string; classe_id: string; date: string; demi_journee: DemiJournee; fait_par: string | null; fait_le: string };
export type ResumeAbsences = { demiJournees: number; justifiees: number; retards: number };

export const TYPES_ABSENCE: { v: TypeAbsence; label: string; retard: boolean; justifiee: boolean }[] = [
  { v: "absence_injustifiee", label: "Absence non justifiée", retard: false, justifiee: false },
  { v: "absence_justifiee", label: "Absence justifiée", retard: false, justifiee: true },
  { v: "rdv_medical", label: "Rendez-vous médical", retard: false, justifiee: true },
  { v: "imperatif_familial", label: "Impératif familial", retard: false, justifiee: true },
  { v: "retard", label: "Retard", retard: true, justifiee: false },
  { v: "retard_excuse", label: "Retard excusé", retard: true, justifiee: true },
];
export const typeAbsence = (t: TypeAbsence) => TYPES_ABSENCE.find((x) => x.v === t) ?? TYPES_ABSENCE[0];
export const estRetard = (t: TypeAbsence) => typeAbsence(t).retard;

export const DEMI_JOURNEES: { v: DemiJournee; label: string }[] = [
  { v: "matin", label: "Matin" },
  { v: "apres_midi", label: "Après-midi" },
];
export const libelleDemiJournee = (d: DemiJournee) => (d === "matin" ? "matin" : "après-midi");

/** Demi-journée en cours : le matin jusqu'à 13 h. */
export const demiJourneeCourante = (h = new Date().getHours()): DemiJournee => (h < 13 ? "matin" : "apres_midi");

/** Total d'une liste d'absences (déjà filtrée sur l'élève et la période). */
export function resumeAbsences(liste: Pick<Absence, "type">[]): ResumeAbsences {
  const r = { demiJournees: 0, justifiees: 0, retards: 0 };
  for (const a of liste) {
    const t = typeAbsence(a.type);
    if (t.retard) r.retards++;
    else {
      r.demiJournees++;
      if (t.justifiee) r.justifiees++;
    }
  }
  return r;
}

const pluriel = (n: number, mot: string, motPluriel = `${mot}s`) => `${n} ${n > 1 ? motPluriel : mot}`;

/** « 3 demi-journées d'absence (dont 2 justifiées) · 1 retard » ; « Aucune absence ». */
export function texteAbsences(r: ResumeAbsences): string {
  const parts: string[] = [];
  if (r.demiJournees) {
    const dont = r.justifiees === r.demiJournees ? (r.demiJournees > 1 ? "toutes justifiées" : "justifiée") : r.justifiees ? `dont ${pluriel(r.justifiees, "justifiée")}` : "non justifiée" + (r.demiJournees > 1 ? "s" : "");
    parts.push(`${pluriel(r.demiJournees, "demi-journée")} d'absence (${dont})`);
  }
  if (r.retards) parts.push(pluriel(r.retards, "retard"));
  return parts.join(" · ") || "Aucune absence";
}

/** Année scolaire d'une date (à partir d'août). */
export const anneeScolaireDe = (iso: string) => {
  const a = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 8 ? `${a}-${a + 1}` : `${a - 1}-${a}`;
};

/** « mardi 18 septembre 2026 ». */
export const dateLongue = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
