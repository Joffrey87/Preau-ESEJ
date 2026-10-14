/** Suivi des relations donateurs : historique des actions (table suivi_actions, écriture par RPC). */

export const TYPES_ACTION = [
  "Envoi courrier Bienfaiteur",
  "Courrier envoyé",
  "Appel téléphonique",
  "Rencontre en personne",
  "Invitation à un événement",
  "Relance à faire",
  "Pas de réponse",
] as const;

/** Actions proposées pour les prospects (+ Autre, texte libre). */
export const TYPES_ACTION_PROSPECT = [
  "Envoi courrier Bienfaiteur",
  "Appel téléphonique",
  "Rencontre",
  "Invitation à un événement",
  "Relance",
  "Remercié",
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
  /** Date de l'action choisie (sinon cree_le). */
  date_action?: string | null;
  /** Dons du donateur au moment de l'action : lien stable (renommage, regroupement de fiches). */
  dons_ids?: string[];
};

/** Profils d'Administration proposés dans « Réservé à » (après les prénoms de la Recherche de fonds). */
export const PROFILS_ADMIN_RESERVE = ["Directeur spirituel", "Président", "Trésorier"];

/**
 * Historique par donateur : une entrée suit les dons qu'elle référence (dons_ids), quel que soit le nom actuel ;
 * à défaut (dons supprimés), la clé du donateur enregistrée. Du plus récent au plus ancien.
 */
export function suiviParDonateur(lignes: SuiviAction[], cleDeDon: Map<string, string>): Map<string, SuiviAction[]> {
  const m = new Map<string, SuiviAction[]>();
  for (const l of [...lignes].sort((a, b) => b.cree_le.localeCompare(a.cree_le))) {
    if (l.cible_type !== "donateur") continue;
    const cles = new Set((l.dons_ids ?? []).map((id) => cleDeDon.get(id)).filter((c): c is string => !!c));
    if (cles.size === 0) cles.add(l.cible_cle);
    for (const c of cles) (m.get(c) ?? m.set(c, []).get(c)!).push(l);
  }
  return m;
}

/** Rôles qui ajoutent des actions (même règle que la base : peut_suivre_donateurs). */
export const ROLES_SUIVI = ["recherche-fonds", "tresorier", "administrateur", "directeur-spirituel"];

/** Historique par prospect (clé = id du prospect), du plus récent au plus ancien. */
export function suiviParCle(lignes: SuiviAction[]): Map<string, SuiviAction[]> {
  const m = new Map<string, SuiviAction[]>();
  for (const l of [...lignes].sort((a, b) => b.cree_le.localeCompare(a.cree_le))) {
    if (l.cible_type !== "prospect") continue;
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
