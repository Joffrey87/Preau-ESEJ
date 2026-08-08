// Pipeline grands donateurs & prospects — modèle du plan V2 (phases 3, 5, 8, 9).

export type Etape =
  | "identifie" | "qualifie" | "contacte" | "rencontre"
  | "sollicite" | "don_recu" | "remercie" | "fidelise" | "perdu";

export type Segment =
  | "cercle_interieur" | "particulier" | "grand_donateur"
  | "entreprise" | "fondation" | "reseau_catho" | "autre";

export type Capacite = "A" | "B" | "C";

export type Prospect = {
  id: string;
  nom: string;
  segment: Segment;
  etape: Etape;
  capacite: Capacite | null;
  montant_cible: number | null;
  montant_obtenu: number;
  responsable: string | null;
  prochaine_action: string | null;
  prochaine_action_date: string | null;
  contact_id: string | null;
  notes: string | null;
};

// Ordre du pipeline (le « moves management » du plan). « perdu » hors flux.
export const ETAPES: { key: Etape; label: string; court: string }[] = [
  { key: "identifie", label: "Identifié", court: "Ident." },
  { key: "qualifie", label: "Qualifié", court: "Qualif." },
  { key: "contacte", label: "Contacté", court: "Contact" },
  { key: "rencontre", label: "Rencontré", court: "RDV" },
  { key: "sollicite", label: "Sollicité", court: "Sollic." },
  { key: "don_recu", label: "Don reçu", court: "Don" },
  { key: "remercie", label: "Remercié", court: "Merci" },
  { key: "fidelise", label: "Fidélisé", court: "Fidèle" },
];

export const ETAPE_LABEL: Record<Etape, string> = {
  identifie: "Identifié", qualifie: "Qualifié", contacte: "Contacté", rencontre: "Rencontré",
  sollicite: "Sollicité", don_recu: "Don reçu", remercie: "Remercié", fidelise: "Fidélisé", perdu: "Perdu",
};

export const SEGMENT_LABEL: Record<Segment, string> = {
  cercle_interieur: "Cercle intérieur",
  particulier: "Particulier",
  grand_donateur: "Grand donateur",
  entreprise: "Entreprise",
  fondation: "Fondation / fonds",
  reseau_catho: "Réseau catholique",
  autre: "Autre",
};

// Fourchettes de potentiel par segment (plan V2, phase 3) — indicatif, à titre d'aide.
export const SEGMENT_POTENTIEL: Record<Segment, string> = {
  cercle_interieur: "15-25 k€/an",
  particulier: "5-10 k€/an",
  grand_donateur: "15-30 k€/an",
  entreprise: "8-15 k€/an",
  fondation: "5-20 k€/projet",
  reseau_catho: "3-8 k€/an",
  autre: "—",
};

export const CAPACITE_LABEL: Record<Capacite, string> = {
  A: "A — fort potentiel",
  B: "B — potentiel moyen",
  C: "C — à explorer",
};

/** Étape suivante dans le flux (null si terminal ou perdu). */
export function etapeSuivante(e: Etape): Etape | null {
  if (e === "perdu" || e === "fidelise") return null;
  const idx = ETAPES.findIndex((x) => x.key === e);
  return idx >= 0 && idx < ETAPES.length - 1 ? ETAPES[idx + 1].key : null;
}

/** Un prospect est « actif » tant qu'il n'est ni perdu ni pleinement fidélisé. */
export function estActif(p: Prospect): boolean {
  return p.etape !== "perdu";
}
