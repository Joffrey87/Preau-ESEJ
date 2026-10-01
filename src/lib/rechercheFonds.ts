/**
 * Recherche de fonds : idées (onglet « Axes de recherche ») et actions
 * (onglet « Suivi des actions »). Réservé au Président, au Trésorier et au
 * profil Recherche de fonds, dont les membres agissent sous leur prénom.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

/** Membres du groupe de recherche de fonds (profil partagé), par ordre alphabétique. */
export const MEMBRES = ["Alexis", "Axel", "Baptiste", "Pierre-Emmanuel", "Pierre-Louis"];

/** Rôles qui accèdent aux onglets de recherche de fonds. */
export const ROLES_RECHERCHE = ["president", "tresorier", "recherche-fonds"];

export type Pilier = "A" | "B" | "C" | "D" | "E" | "F";
export const PILIERS: { code: Pilier; titre: string; cible: string }[] = [
  { code: "A", titre: "Effectifs et scolarités", cible: "26 → 30 → 40 élèves · 1 élève = 2 145 €/an" },
  { code: "B", titre: "Maîtrise des coûts", cible: "Charges ≤ +3 %/an · personnel ≤ 70 % des produits" },
  { code: "C", titre: "Ventes et services", cible: "Marge ≥ 60 % par opération · ≥ 10 k€ nets/an" },
  { code: "D", titre: "Événements", cible: "Peu d'événements, ≥ 1 500 € nets chacun" },
  { code: "E", titre: "Dons et mécénat", cible: "≥ 70 k€ collectés · dons ≤ 48 % des produits" },
  { code: "F", titre: "Financements structurels", cible: "Réserve ≥ 1 mois de charges (≈ 11 900 €)" },
];
export const titrePilier = (p: string) => PILIERS.find((x) => x.code === p)?.titre ?? p;

export type StatutIdee = "retenue" | "en_reflexion" | "a_etudier" | "non_retenue";
/** Ordre d'affichage dans chaque pilier : retenues, en réflexion, à étudier, non retenues. */
export const STATUTS_IDEE: { v: StatutIdee; l: string; cls: string }[] = [
  { v: "retenue", l: "Retenue", cls: "border-positive/50 bg-positive/10 text-positive" },
  { v: "en_reflexion", l: "En réflexion", cls: "border-amber-500/50 bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
  { v: "a_etudier", l: "À étudier", cls: "border-border bg-surface-2 text-muted" },
  { v: "non_retenue", l: "Non retenue", cls: "border-border bg-surface-2 text-muted/70 line-through" },
];
export const libelleStatutIdee = (s: string) => STATUTS_IDEE.find((x) => x.v === s)?.l ?? s;

export type StatutAction = "en_cours" | "a_lancer" | "en_pause" | "terminee" | "abandonnee";
export const STATUTS_ACTION: { v: StatutAction; l: string; actif: boolean; cls: string }[] = [
  { v: "en_cours", l: "En cours", actif: true, cls: "bg-accent text-accent-fg" },
  { v: "a_lancer", l: "À lancer", actif: true, cls: "bg-amber-600 text-white" },
  { v: "en_pause", l: "En pause", actif: true, cls: "bg-surface-2 text-foreground" },
  { v: "terminee", l: "Terminée", actif: false, cls: "bg-positive text-white" },
  { v: "abandonnee", l: "Abandonnée", actif: false, cls: "bg-surface-2 text-muted" },
];
export const libelleStatutAction = (s: string) => STATUTS_ACTION.find((x) => x.v === s)?.l ?? s;

export type Idee = {
  id: string;
  pilier: Pilier;
  titre: string;
  description: string | null;
  nouvelle: boolean;
  cible_valeur: number | null;
  cible_unite: string | null;
  periode: string | null;
  statut: StatutIdee;
  auteur: string | null;
  responsable: string | null;
  source: string | null;
  ordre: number;
  cree_le: string;
  supprime_le: string | null;
};

export type Action = {
  id: string;
  idee_id: string | null;
  titre: string;
  porteur: string | null;
  contributeurs: string[];
  statut: StatutAction;
  objectif_valeur: number | null;
  objectif_unite: string | null;
  montant_obtenu: number | null;
  cree_le: string;
};

export type Etape = {
  id: string;
  action_id: string;
  texte: string;
  fait: boolean;
  fait_par: string | null;
  fait_le: string | null;
  ordre: number;
};

export type NoteJournal = { id: string; action_id: string; prenom: string | null; texte: string; le: string };

export type EcritureLiee = {
  id: string;
  action_id: string;
  operation_id: string | null;
  date_operation: string | null;
  libelle: string | null;
  montant: number | null;
  type: string | null;
  lie_par: string | null;
};

export type EvenementHistorique = {
  id: string;
  le: string;
  prenom: string | null;
  objet: "idee" | "action";
  objet_id: string | null;
  titre: string | null;
  evenement: string;
};

/** Cible lisible : « 2 600 € », « 6 inscriptions par an ». */
export function formatCible(valeur: number | null, unite: string | null): string | null {
  if (valeur == null) return null;
  const n = Number(valeur).toLocaleString("fr-FR", { maximumFractionDigits: 2 });
  return unite ? `${n} ${unite}` : n;
}

/** Trace un événement important (retenue, non retenue, porteur…) dans l'historique. */
export async function tracer(
  supabase: SupabaseClient,
  e: { prenom: string | null; objet: "idee" | "action"; objet_id: string | null; titre: string | null; evenement: string },
) {
  await supabase.from("recherche_historique").insert(e);
}

export const dateHeure = (iso: string) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" }).format(new Date(iso));
