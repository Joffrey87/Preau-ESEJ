// Tâches personnelles par rôle, organisées en matrice d'Eisenhower.
// Une tâche « non classée » a urgent OU important à null (cadran à trier).

export type Tache = {
  id: string;
  role: string;
  titre: string;
  description: string | null;
  urgent: boolean | null;
  important: boolean | null;
  date_echeance: string | null;
  fait: boolean;
  ordre: number;
};

export type QuadrantKey = "faire" | "planifier" | "deleguer" | "limiter" | "non_classe";

export type QuadrantDef = {
  key: QuadrantKey;
  titre: string;
  sousTitre: string;
  conseil: string;
  urgent: boolean | null;
  important: boolean | null;
  // Classes de couleur (bordure du cadran + bandeau d'entête).
  bordure: string;
  entete: string;
};

// Les 4 cadrans classiques. « non_classe » est géré à part (bac de tri).
export const QUADRANTS: QuadrantDef[] = [
  {
    key: "faire",
    titre: "À faire",
    sousTitre: "Urgent & important",
    conseil: "Traiter en premier",
    urgent: true,
    important: true,
    bordure: "border-negative/40",
    entete: "bg-negative/10 text-negative",
  },
  {
    key: "planifier",
    titre: "À planifier",
    sousTitre: "Important, pas urgent",
    conseil: "Fixer une date",
    urgent: false,
    important: true,
    bordure: "border-accent/40",
    entete: "bg-accent-soft text-accent",
  },
  {
    key: "deleguer",
    titre: "À déléguer",
    sousTitre: "Urgent, pas important",
    conseil: "Confier si possible",
    urgent: true,
    important: false,
    bordure: "border-gold/40",
    entete: "bg-gold-soft text-gold",
  },
  {
    key: "limiter",
    titre: "À limiter",
    sousTitre: "Ni urgent ni important",
    conseil: "Réduire ou reporter",
    urgent: false,
    important: false,
    bordure: "border-border",
    entete: "bg-surface-2 text-muted",
  },
];

export const NON_CLASSE: Omit<QuadrantDef, "urgent" | "important"> & {
  urgent: null;
  important: null;
} = {
  key: "non_classe",
  titre: "À trier",
  sousTitre: "Urgence et importance à définir",
  conseil: "Glissez chaque tâche dans un cadran",
  urgent: null,
  important: null,
  bordure: "border-dashed border-border",
  entete: "bg-surface-2 text-muted",
};

/** Cadran d'une tâche selon urgent/important (null → non classé). */
export function quadrantDe(t: Pick<Tache, "urgent" | "important">): QuadrantKey {
  if (t.urgent == null || t.important == null) return "non_classe";
  if (t.urgent && t.important) return "faire";
  if (!t.urgent && t.important) return "planifier";
  if (t.urgent && !t.important) return "deleguer";
  return "limiter";
}

/** Valeurs urgent/important cibles d'un cadran (pour drop & création). */
export function axesDe(key: QuadrantKey): { urgent: boolean | null; important: boolean | null } {
  if (key === "non_classe") return { urgent: null, important: null };
  const q = QUADRANTS.find((x) => x.key === key)!;
  return { urgent: q.urgent, important: q.important };
}
