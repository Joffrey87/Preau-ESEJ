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
  "recherche-fonds": ["/mecenat/pipeline"],
};

/** Pages autorisées pour ce compte ; null = pas de restriction. */
export function pagesAutorisees(email?: string | null): string[] | null {
  const slug = roleByEmail(email)?.slug;
  return (slug && PAGES_RESTREINTES[slug]) || null;
}

export function roleByEmail(email?: string | null): Role | undefined {
  return ROLES.find((r) => r.email === email);
}
