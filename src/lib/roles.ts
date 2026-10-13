// Connexion par rôle : chaque rôle = un compte Supabase avec une adresse
// « interne » (non routable, aucun e-mail n'est envoyé) et son mot de passe.
// L'utilisateur choisit son rôle dans la liste puis saisit le mot de passe.

/**
 * `prenom` : la personne qui tient le profil, saluée sur le Tableau de bord (Recherche de fonds : le prénom de la visite).
 * `titre` : la fonction, affichée sous le salut (« Président de l'ARIL »).
 */
export type Role = { slug: string; label: string; email: string; prenom?: string; titre: string };

const DOMAIN = "roles.esej";

export const ROLES: Role[] = [
  { slug: "president", label: "Président", email: `president@${DOMAIN}`, prenom: "Jean-François", titre: "Président de l'ARIL" },
  { slug: "tresorier", label: "Trésorier", email: `tresorier@${DOMAIN}`, titre: "Trésorier de l'ARIL" },
  { slug: "secretaire", label: "Secrétaire", email: `secretaire@${DOMAIN}`, prenom: "Cécile", titre: "Secrétaire de l'ARIL" },
  { slug: "administrateur", label: "Administrateur", email: `administrateur@${DOMAIN}`, titre: "Administrateur de Préau" },
  { slug: "directrice", label: "Directrice", email: `directrice@${DOMAIN}`, prenom: "Marie", titre: "Directrice de l'École du Saint-Enfant-Jésus" },
  {
    slug: "directeur-spirituel",
    label: "Directeur spirituel",
    email: `directeur-spirituel@${DOMAIN}`,
    prenom: "Monsieur le Chanoine",
    titre: "Directeur spirituel de l'École du Saint-Enfant-Jésus",
  },
  { slug: "resp-mecenat", label: "Resp. Mécénat", email: `resp-mecenat@${DOMAIN}`, titre: "Responsable du mécénat de l'ARIL" },
  { slug: "recherche-fonds", label: "Recherche de fonds", email: `recherche-fonds@${DOMAIN}`, titre: "Recherche de fonds de l'ARIL" },
];

/**
 * Profils cantonnés à quelques pages : toute autre adresse les ramène à la
 * première. (La base restreint aussi leurs lectures : voir les politiques RLS.)
 */
export const PAGES_RESTREINTES: Record<string, string[]> = {
  // Chaque profil arrive sur son Tableau de bord (« / »), qui résume ses onglets.
  "recherche-fonds": ["/", "/recherche/axes", "/recherche/suivi", "/mecenat/pipeline"],
  // Directeur spirituel : lecture du carnet, des dons et des relations donateurs ; bulletins (il enseigne le catéchisme).
  "directeur-spirituel": ["/", "/carnet", "/dons", "/mecenat/pipeline", "/bulletins"],
  // Président : Tableau de bord, Comptabilité (lecture), Budget, Frais de scolarité, Dons, Relations donateurs. Son
  // Espace famille s'ouvre par le logo (bascule vers le compte de la famille Antona), comme pour les autres familles.
  president: ["/", "/evenement", "/evenement/membres", "/evenement/facturation", "/evenement/carnet", "/comptabilite", "/budget", "/scolarite", "/dons", "/mecenat/pipeline", "/remerciements"],
  // Profils pas encore configurés : rien de visible (une page d'attente) tant que leurs accès ne sont pas définis.
  secretaire: ["/en-attente"],
  administrateur: ["/en-attente"],
  directrice: ["/", "/bulletins", "/evenement", "/evenement/membres", "/evenement/facturation", "/evenement/carnet"],
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
  { prefixe: "/remerciements", roles: ["president", "tresorier", "administrateur"] },
  // Accès des familles à leur espace (comptes, invitations) : Administrateur (aujourd'hui le Trésorier).
  { prefixe: "/acces-familles", roles: ["tresorier", "administrateur"] },
  // Comptabilité : le Président la consulte seulement (pas d'import de relevé ni de règles de correspondance).
  { prefixe: "/comptabilite/import", roles: ["tresorier", "administrateur"] },
  { prefixe: "/comptabilite/correspondances", roles: ["tresorier", "administrateur"] },
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

/** Comptes du profil Événement : <identifiant>@evenement.esej, cantonnés à leurs quatre onglets. */
export const DOMAINE_EVENEMENT = "evenement.esej";
export const estEvenement = (email?: string | null) => !!email?.endsWith(`@${DOMAINE_EVENEMENT}`);
export const PAGES_EVENEMENT = ["/evenement", "/evenement/membres", "/evenement/facturation", "/evenement/carnet"];

/** Pages autorisées pour ce compte ; null = pas de restriction. */
export function pagesAutorisees(email?: string | null): string[] | null {
  if (estProfesseur(email)) return PAGES_PROFESSEURS;
  if (estEvenement(email)) return PAGES_EVENEMENT;
  const slug = roleByEmail(email)?.slug;
  return (slug && PAGES_RESTREINTES[slug]) || null;
}

export function roleByEmail(email?: string | null): Role | undefined {
  return ROLES.find((r) => r.email === email);
}
