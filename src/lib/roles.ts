// Connexion par rôle : chaque rôle = un compte Supabase avec une adresse
// « interne » (non routable, aucun e-mail n'est envoyé) et son mot de passe.
// L'utilisateur choisit son rôle dans la liste puis saisit le mot de passe.

export type Role = { slug: string; label: string; email: string };

const DOMAIN = "roles.esej";

export const ROLES: Role[] = [
  { slug: "president", label: "Président", email: `president@${DOMAIN}` },
  { slug: "tresorier", label: "Trésorier", email: `tresorier@${DOMAIN}` },
  { slug: "secretaire", label: "Secrétaire", email: `secretaire@${DOMAIN}` },
  { slug: "administrateur", label: "Administrateur", email: `administrateur@${DOMAIN}` },
  { slug: "directrice", label: "Directrice", email: `directrice@${DOMAIN}` },
  {
    slug: "directeur-spirituel",
    label: "Directeur spirituel",
    email: `directeur-spirituel@${DOMAIN}`,
  },
  { slug: "resp-mecenat", label: "Resp. Mécénat", email: `resp-mecenat@${DOMAIN}` },
  { slug: "recherche-fonds", label: "Recherche de fonds", email: `recherche-fonds@${DOMAIN}` },
];

/**
 * Profils cantonnés à quelques pages : toute autre adresse les ramène à la
 * première. (La base restreint aussi leurs lectures : voir les politiques RLS.)
 */
export const PAGES_RESTREINTES: Record<string, string[]> = {
  "recherche-fonds": ["/recherche/axes", "/recherche/suivi", "/mecenat/pipeline"],
  // Directeur spirituel : lecture du carnet, des dons et des relations donateurs ; bulletins (il enseigne le catéchisme).
  "directeur-spirituel": ["/carnet", "/dons", "/mecenat/pipeline", "/bulletins"],
  // Président : Comptabilité, Budget, Frais de scolarité, Dons, Carnet (ni Tableau de bord, ni En cours).
  president: ["/comptabilite", "/budget", "/scolarite", "/dons", "/carnet"],
  // Profils pas encore configurés : rien de visible (une page d'attente) tant que leurs accès ne sont pas définis.
  secretaire: ["/en-attente"],
  administrateur: ["/en-attente"],
  directrice: ["/bulletins"],
  "resp-mecenat": ["/en-attente"],
};

/**
 * Profil partagé « Recherche de fonds » : le prénom est choisi sur l'écran
 * d'accueil et gardé dans un cookie de session (effacé à la fermeture du
 * navigateur). Sans lui, la session est fermée : chaque nouvelle visite repasse
 * par l'écran d'accueil (ces membres peuvent aussi vouloir leur Espace famille).
 */
export const COOKIE_PRENOM = "recherche_prenom";
export const ROLES_PRENOM_A_L_ACCES = ["recherche-fonds"];

/** Pages réservées à certains rôles (les autres sont renvoyés à l'accueil). */
export const PAGES_RESERVEES: { prefixe: string; roles: string[] }[] = [
  { prefixe: "/recherche", roles: ["president", "tresorier", "recherche-fonds"] },
  { prefixe: "/courriers", roles: ["secretaire", "tresorier", "president", "administrateur"] },
];

export function pageReserveeInterdite(email: string | null | undefined, chemin: string): boolean {
  const slug = roleByEmail(email)?.slug ?? "";
  return PAGES_RESERVEES.some(
    (r) => (chemin === r.prefixe || chemin.startsWith(r.prefixe + "/")) && !r.roles.includes(slug),
  );
}

/** Comptes nominatifs des professeurs : <identifiant>@professeurs.esej, cantonnés aux bulletins. */
export const DOMAINE_PROFESSEURS = "professeurs.esej";
export const estProfesseur = (email?: string | null) => !!email?.endsWith(`@${DOMAINE_PROFESSEURS}`);
export const PAGES_PROFESSEURS = ["/bulletins"];

/** Pages autorisées pour ce compte ; null = pas de restriction. */
export function pagesAutorisees(email?: string | null): string[] | null {
  if (estProfesseur(email)) return PAGES_PROFESSEURS;
  const slug = roleByEmail(email)?.slug;
  return (slug && PAGES_RESTREINTES[slug]) || null;
}

export function roleByEmail(email?: string | null): Role | undefined {
  return ROLES.find((r) => r.email === email);
}
