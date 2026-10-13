// Messagerie interne : types, pastilles de profil et identité du participant connecté.
// L'identité est décidée par la base (fonction msg_cle) à partir de la session ; le prénom de visite
// (Recherche de fonds, compte partagé) est passé en plus à chaque appel.

import { COOKIE_PRENOM } from "@/lib/roles";

export type Participant = {
  cle: string;
  type: string;
  libelle: string;
  detail: string | null;
  admin?: boolean;
  bloque?: boolean;
  ordre?: number;
  motif?: string | null;
};

export type Moi = Participant & { moderateur: boolean; bloque: boolean };

export type PieceJointe = { path: string; nom: string; type: string; taille: number };

export type Conversation = {
  id: string;
  type: "direct" | "groupe";
  titre: string | null;
  description: string | null;
  cree_par: string;
  moi_membre: boolean;
  admin: boolean;
  sourdine: boolean;
  bloque: boolean;
  membres: Participant[] | null;
  dernier: { auteur: string; auteur_libelle: string; corps: string; pj: number } | null;
  dernier_le: string;
  non_lus: number;
};

export type Message = {
  id: string;
  auteur: string;
  auteur_libelle: string;
  type: string;
  cree_le: string;
  masque: boolean;
  supprime: boolean;
  corps: string;
  pj: PieceJointe[];
};

/** Familles de profils, pour le filtre « par rôle ». */
export const FAMILLES_PROFIL: { v: string; label: string; types: string[] }[] = [
  { v: "famille", label: "Familles", types: ["famille"] },
  { v: "admin", label: "Administration", types: ["president", "tresorier", "secretaire", "administrateur", "directrice", "directeur-spirituel", "resp-mecenat"] },
  { v: "recherche-fonds", label: "Recherche de fonds", types: ["recherche-fonds"] },
  { v: "evenement", label: "Événement", types: ["evenement"] },
  { v: "professeur", label: "Professeurs", types: ["professeur"] },
];

const VIOLET = "bg-[color-mix(in_srgb,var(--negative)_12%,var(--accent-soft))] text-[color-mix(in_srgb,var(--negative)_55%,var(--accent))]";

/** Pastille de couleur par type de profil (jetons du thème : clair et sombre). */
export const PROFILS: Record<string, { label: string; pastille: string; avatar: string }> = {
  famille: { label: "Famille", pastille: "bg-positive/15 text-positive", avatar: "bg-positive text-white" },
  tresorier: { label: "Trésorier", pastille: "bg-accent text-accent-fg", avatar: "bg-accent text-accent-fg" },
  president: { label: "Président", pastille: "bg-gold/20 text-gold", avatar: "bg-gold text-white" },
  directrice: { label: "Directrice", pastille: "bg-accent-soft text-accent", avatar: "bg-accent-soft text-accent ring-1 ring-accent/40" },
  secretaire: { label: "Secrétaire", pastille: "bg-surface-2 text-foreground", avatar: "bg-surface-2 text-foreground ring-1 ring-border" },
  administrateur: { label: "Administrateur", pastille: "bg-surface-2 text-muted", avatar: "bg-muted text-white" },
  "directeur-spirituel": { label: "Directeur spirituel", pastille: "bg-surface-2 text-muted", avatar: "bg-muted text-white" },
  "resp-mecenat": { label: "Resp. Mécénat", pastille: "bg-gold-soft text-gold", avatar: "bg-gold-soft text-gold ring-1 ring-gold/40" },
  "recherche-fonds": { label: "Recherche de fonds", pastille: VIOLET, avatar: VIOLET + " ring-1 ring-border" },
  evenement: { label: "Événement", pastille: "bg-gold-soft text-gold", avatar: "bg-gold-soft text-gold ring-1 ring-gold/50" },
  professeur: { label: "Professeur", pastille: "bg-jauge/15 text-jauge", avatar: "bg-jauge text-white" },
  inconnu: { label: "?", pastille: "bg-surface-2 text-muted", avatar: "bg-surface-2 text-muted" },
};

export const profil = (type?: string) => PROFILS[type ?? ""] ?? PROFILS.inconnu;

export function initiales(libelle: string): string {
  const mots = libelle.replace(/^(Famille|M\.|Mme|Mlle|Monsieur|Madame)\s+/i, "").split(/[\s-]+/).filter(Boolean);
  return ((mots[0]?.[0] ?? "?") + (mots[1]?.[0] ?? "")).toUpperCase();
}

/** Prénom de visite (Recherche de fonds) lu dans le cookie de session ; null ailleurs. */
export function prenomVisite(): string | null {
  if (typeof document === "undefined") return null;
  const m = document.cookie.match(new RegExp(`(?:^|; )${COOKIE_PRENOM}=([^;]*)`));
  return m ? decodeURIComponent(m[1]) || null : null;
}

export const BUCKET = "messagerie";
export const TYPES_PJ = ["image/jpeg", "image/png", "image/webp", "image/gif", "image/heic", "application/pdf"];
export const TAILLE_MAX_PJ = 10 * 1024 * 1024;

/** Titre d'une conversation vue par `moi` : nom du groupe, ou l'autre personne. */
export function autres(c: Conversation, moi: string): Participant[] {
  return (c.membres ?? []).filter((m) => m.cle !== moi);
}
export function titreConversation(c: Conversation, moi: string): string {
  if (c.type === "groupe") return c.titre ?? "Groupe";
  const a = autres(c, moi);
  return a.map((p) => p.libelle).join(", ") || "Conversation";
}

export function heureCourte(iso: string): string {
  const d = new Date(iso);
  const auj = new Date();
  if (d.toDateString() === auj.toDateString()) return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  const hier = new Date(auj.getTime() - 86400000);
  if (d.toDateString() === hier.toDateString()) return "Hier";
  return d.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
