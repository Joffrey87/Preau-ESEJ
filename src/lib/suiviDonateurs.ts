/** Suivi des relations donateurs : historique des actions (table suivi_actions, écriture par RPC). */

export const TYPES_ACTION = [
  "Courrier envoyé",
  "Appel téléphonique",
  "Rencontre en personne",
  "Invitation à un événement",
  "Relance à faire",
  "Pas de réponse",
] as const;

export const ETATS_SUIVI = [
  "À contacter",
  "Contacté",
  "En réflexion",
  "Promesse de don",
  "Don reçu",
  "À relancer",
  "Refus",
  "Ne plus solliciter",
] as const;

export type SuiviAction = {
  id: string;
  cible_type: "donateur" | "prospect";
  cible_cle: string;
  actions: string[];
  etat: string | null;
  note: string | null;
  auteur: string;
  cree_le: string;
};

/** Rôles qui ajoutent des actions (même règle que la base : peut_suivre_donateurs). */
export const ROLES_SUIVI = ["recherche-fonds", "tresorier", "administrateur"];

/** Historique par clé, du plus récent au plus ancien. */
export function suiviParCle(lignes: SuiviAction[]): Map<string, SuiviAction[]> {
  const m = new Map<string, SuiviAction[]>();
  for (const l of [...lignes].sort((a, b) => b.cree_le.localeCompare(a.cree_le))) {
    (m.get(l.cible_cle) ?? m.set(l.cible_cle, []).get(l.cible_cle)!).push(l);
  }
  return m;
}

/** État courant = dernier état renseigné. */
export const etatCourant = (h: SuiviAction[] | undefined) => h?.find((l) => l.etat)?.etat ?? null;
/** Dernier commentaire renseigné. */
export const dernierCommentaire = (h: SuiviAction[] | undefined) => h?.find((l) => l.note)?.note ?? null;

export const formatDateHeure = (iso: string) =>
  new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Paris" });
