// Pistes de financement : suivi unifié des sources hors dons récurrents
// (mécénat d'entreprise, fondations/appels à projets, subventions, événements,
// legs). Même cycle de vie pour toutes : piste → contact → dossier → déposé →
// obtenu / refusé, avec une échéance de dépôt ou de décision.

import type { Tone } from "@/lib/statutDon";

export type AxeFin = "entreprise" | "fondation" | "subvention" | "evenement" | "legs" | "autre";
export type StatutFin = "piste" | "contact" | "dossier" | "depose" | "obtenu" | "refuse";

export type Financement = {
  id: string;
  intitule: string;
  axe: AxeFin;
  organisme: string | null;
  montant_vise: number | null;
  montant_obtenu: number;
  echeance: string | null;
  statut: StatutFin;
  responsable: string | null;
  contact_id: string | null;
  notes: string | null;
  supprime_le: string | null;
  supprime_par: string | null;
};

export const AXES: { key: AxeFin; label: string; court: string; tone: Tone }[] = [
  { key: "entreprise", label: "Mécénat d'entreprise", court: "Entreprise", tone: "blue" },
  { key: "fondation", label: "Fondation / appel à projets", court: "Fondation", tone: "violet" },
  { key: "subvention", label: "Subvention publique", court: "Subvention", tone: "amber" },
  { key: "evenement", label: "Événement / collecte", court: "Événement", tone: "green" },
  { key: "legs", label: "Legs / libéralité", court: "Legs", tone: "gray" },
  { key: "autre", label: "Autre", court: "Autre", tone: "gray" },
];

export const AXE_LABEL: Record<AxeFin, string> = Object.fromEntries(
  AXES.map((a) => [a.key, a.label]),
) as Record<AxeFin, string>;
export const AXE_TONE: Record<AxeFin, Tone> = Object.fromEntries(
  AXES.map((a) => [a.key, a.tone]),
) as Record<AxeFin, Tone>;

export const STATUTS: { key: StatutFin; label: string; tone: Tone; clos: boolean }[] = [
  { key: "piste", label: "Piste", tone: "gray", clos: false },
  { key: "contact", label: "Contacté", tone: "blue", clos: false },
  { key: "dossier", label: "Dossier en cours", tone: "amber", clos: false },
  { key: "depose", label: "Déposé", tone: "violet", clos: false },
  { key: "obtenu", label: "Obtenu", tone: "green", clos: true },
  { key: "refuse", label: "Refusé", tone: "red", clos: true },
];

export const STATUT_LABEL: Record<StatutFin, string> = Object.fromEntries(
  STATUTS.map((s) => [s.key, s.label]),
) as Record<StatutFin, string>;
export const STATUT_TONE: Record<StatutFin, Tone> = Object.fromEntries(
  STATUTS.map((s) => [s.key, s.tone]),
) as Record<StatutFin, Tone>;

/** Une piste close (obtenue ou refusée) sort du pipeline actif. */
export function estClos(f: Pick<Financement, "statut">): boolean {
  return f.statut === "obtenu" || f.statut === "refuse";
}

// Ordre d'avancement (la branche « refusé » est un abandon, hors flux linéaire).
const FLUX: StatutFin[] = ["piste", "contact", "dossier", "depose", "obtenu"];

/** Étape suivante du flux (null si terminal ou refusé). */
export function statutSuivant(s: StatutFin): StatutFin | null {
  if (s === "refuse" || s === "obtenu") return null;
  const i = FLUX.indexOf(s);
  return i >= 0 && i < FLUX.length - 1 ? FLUX[i + 1] : null;
}

/** Jours entre aujourd'hui (ISO) et une échéance ISO (négatif = passée). */
export function joursAvant(echeanceISO: string, todayISO: string): number {
  const [ay, am, ad] = todayISO.split("-").map(Number);
  const [by, bm, bd] = echeanceISO.split("-").map(Number);
  const a = Date.UTC(ay, am - 1, ad);
  const b = Date.UTC(by, bm - 1, bd);
  return Math.round((b - a) / 86400000);
}
