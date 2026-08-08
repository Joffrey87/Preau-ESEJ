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
];

export function roleByEmail(email?: string | null): Role | undefined {
  return ROLES.find((r) => r.email === email);
}
