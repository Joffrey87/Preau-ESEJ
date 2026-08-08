// Carnet d'adresses partagé + filtrage par rôle.
// Modèle : un contact porte une ou plusieurs CATÉGORIES. Un rôle voit un contact
// s'il a le droit d'au moins une de ses catégories. Ainsi un donateur qui est
// aussi parent devient visible des rôles « école » via la catégorie « parent ».
// Règles de départ « évidentes » — à affiner ensemble.

export type Contact = {
  id: string;
  civilite: string | null;
  est_personne_morale: boolean;
  nom: string;
  prenom: string | null;
  raison_sociale: string | null;
  categories: string[];
  courriel: string | null;
  telephone: string | null;
  adresse: string | null;
  cp_ville: string | null;
  iban: string | null;
  notes: string | null;
};

export type CategorieSlug =
  | "donateur"
  | "parent"
  | "enseignant"
  | "bureau"
  | "vendeur"
  | "partenaire"
  | "autre";

export type Tone = "blue" | "green" | "amber" | "violet" | "coral" | "teal" | "gray";

export const CATEGORIES: { slug: CategorieSlug; label: string; tone: Tone }[] = [
  { slug: "donateur", label: "Donateur", tone: "violet" },
  { slug: "parent", label: "Parent / famille", tone: "blue" },
  { slug: "enseignant", label: "Enseignant", tone: "teal" },
  { slug: "bureau", label: "Bureau ARIL", tone: "green" },
  { slug: "vendeur", label: "Vendeur / prestataire", tone: "amber" },
  { slug: "partenaire", label: "Partenaire", tone: "coral" },
  { slug: "autre", label: "Autre contact", tone: "gray" },
];

export const CATEGORIE_LABEL: Record<string, string> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.label]),
);
export const CATEGORIE_TONE: Record<string, Tone> = Object.fromEntries(
  CATEGORIES.map((c) => [c.slug, c.tone]),
);

export const TONE_CLASSES: Record<Tone, string> = {
  blue: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  green: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950/70 dark:text-amber-300",
  violet: "bg-violet-100 text-violet-700 dark:bg-violet-950 dark:text-violet-300",
  coral: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300",
  teal: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300",
  gray: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300",
};

const ALL = "all" as const;
type Acces = typeof ALL | CategorieSlug[];

// Catégories visibles par rôle (slug de rôle défini dans lib/roles.ts).
export const ACCES_PAR_ROLE: Record<string, Acces> = {
  president: ALL,
  tresorier: ALL,
  administrateur: ALL,
  "resp-mecenat": ["donateur", "partenaire", "bureau", "autre"],
  secretaire: ["parent", "enseignant", "bureau", "vendeur", "partenaire", "autre"],
  directrice: ["parent", "enseignant", "bureau", "autre"],
  "directeur-spirituel": ["bureau", "enseignant", "autre"],
};

// Seuls ces rôles voient les IBAN (données bancaires sensibles).
const ROLES_IBAN = new Set(["president", "tresorier", "administrateur"]);

export function accesRole(roleSlug: string | undefined): Acces {
  return (roleSlug && ACCES_PAR_ROLE[roleSlug]) || [];
}

export function peutVoirIban(roleSlug: string | undefined): boolean {
  return !!roleSlug && ROLES_IBAN.has(roleSlug);
}

/** Catégories qu'un rôle peut manipuler (pour le formulaire). */
export function categoriesAutorisees(roleSlug: string | undefined): CategorieSlug[] {
  const a = accesRole(roleSlug);
  return a === ALL ? CATEGORIES.map((c) => c.slug) : a;
}

/** Le rôle voit-il ce contact ? (au moins une catégorie autorisée) */
export function peutVoirContact(contact: Contact, roleSlug: string | undefined): boolean {
  const a = accesRole(roleSlug);
  if (a === ALL) return true;
  if (!contact.categories?.length) return false; // sans catégorie = réservé aux accès complets
  return contact.categories.some((c) => a.includes(c as CategorieSlug));
}

export function nomAffiche(c: Contact): string {
  return c.est_personne_morale
    ? c.raison_sociale ?? c.nom
    : [c.civilite, c.nom, c.prenom].filter(Boolean).join(" ");
}
