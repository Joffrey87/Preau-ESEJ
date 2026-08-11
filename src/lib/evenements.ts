// Événements partagés, visibles selon un GROUPE de rôles.
// Groupes décidés avec l'utilisateur (08/08/2026). Les rôles « enseignant » et
// « benevole » n'ont pas encore de compte : listés d'avance, ils deviendront
// actifs dès leur création dans lib/roles.ts.

export type Evenement = {
  id: string;
  titre: string;
  description: string | null;
  groupe: string;
  date_debut: string;
  date_fin: string | null;
  heure: string | null;
  lieu: string | null;
  created_by_role: string | null;
};

export type GroupeDef = {
  slug: string;
  label: string;
  court: string;
  roles: string[]; // rôles qui voient (et peuvent créer) ces événements
  point: string; // classe de couleur d'une pastille
  puce: string; // classe de couleur d'un badge (fond + texte)
};

export const GROUPES: GroupeDef[] = [
  {
    slug: "ca",
    label: "Conseil d'administration",
    court: "CA",
    roles: ["president", "tresorier", "secretaire", "administrateur", "directeur-spirituel", "directrice"],
    point: "bg-accent",
    puce: "bg-accent-soft text-accent",
  },
  {
    slug: "ecole",
    label: "École (enseignants, directrice, bénévoles)",
    court: "École",
    roles: ["directrice", "enseignant", "benevole"],
    point: "bg-positive",
    puce: "bg-positive/15 text-positive",
  },
  {
    slug: "tous",
    label: "Tout le monde",
    court: "Tous",
    roles: [], // vide = visible par tous (voir peutVoirEvenement)
    point: "bg-gold",
    puce: "bg-gold-soft text-gold",
  },
];

export const GROUPE_LABEL: Record<string, string> = Object.fromEntries(
  GROUPES.map((g) => [g.slug, g.label]),
);
export const GROUPE_COURT: Record<string, string> = Object.fromEntries(
  GROUPES.map((g) => [g.slug, g.court]),
);
export const GROUPE_POINT: Record<string, string> = Object.fromEntries(
  GROUPES.map((g) => [g.slug, g.point]),
);
export const GROUPE_PUCE: Record<string, string> = Object.fromEntries(
  GROUPES.map((g) => [g.slug, g.puce]),
);

/** Le rôle voit-il cet événement ? (« tous » = tout le monde) */
export function peutVoirEvenement(ev: Pick<Evenement, "groupe">, roleSlug: string | undefined): boolean {
  if (ev.groupe === "tous") return true;
  const g = GROUPES.find((x) => x.slug === ev.groupe);
  if (!g) return false;
  return !!roleSlug && g.roles.includes(roleSlug);
}

/** Groupes pour lesquels le rôle peut créer un événement (ceux qu'il voit). */
export function groupesCreables(roleSlug: string | undefined): GroupeDef[] {
  return GROUPES.filter((g) => g.slug === "tous" || (!!roleSlug && g.roles.includes(roleSlug)));
}
