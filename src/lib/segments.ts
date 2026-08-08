// Paramètres et règles de la stratégie donateurs (pipeline). Source unique :
// la page /mecenat/strategie les présente, et le calcul des profils les réutilise.
// Décidés avec le trésorier le 08/08/2026 — modifiables ici.

export const PARAMS = {
  seuilGrandDonateur: 1000, // cumul annuel (€) à partir duquel = grand donateur
  nouveauMois: 3, // 1er don de moins de N mois = nouveau
  sommeilMois: 12, // aucun don depuis N mois = en sommeil
  perduMois: 24, // aucun don depuis N mois = perdu
  fideleAnnees: 2, // a donné sur ≥ N années civiles = fidèle
  concentrationTop5Max: 25, // part des 5 premiers donateurs à ne pas dépasser (%)
  retentionCible: 45, // taux de rétention visé (%)
  collecteCible: 60000, // collecte annuelle visée (€)
} as const;

export type SegmentDef = {
  key: string;
  emoji: string;
  label: string;
  regle: string;
  action: string;
};

export const SEGMENTS: SegmentDef[] = [
  {
    key: "grand",
    emoji: "🔵",
    label: "Grand donateur",
    regle: `Cumul ≥ ${PARAMS.seuilGrandDonateur.toLocaleString("fr-FR")} €/an`,
    action: "Un rendez-vous par an, projet nominatif, argument IFI (75 %) si très gros don.",
  },
  {
    key: "fidele",
    emoji: "🟢",
    label: "Fidèle / récurrent",
    regle: `A donné sur ≥ ${PARAMS.fideleAnnees} années`,
    action: "Proposer le club de dons mensuels, fidéliser, envoyer le rapport d'impact.",
  },
  {
    key: "nouveau",
    emoji: "🆕",
    label: "Nouveau",
    regle: `Premier don il y a moins de ${PARAMS.nouveauMois} mois`,
    action: "Parcours d'accueil : remerciement sous 7 jours, présentation de l'école.",
  },
  {
    key: "sommeil",
    emoji: "🟠",
    label: "En sommeil",
    regle: `Aucun don depuis ${PARAMS.sommeilMois} mois`,
    action: "Campagne de réactivation (« vous nous avez soutenus en… »).",
  },
  {
    key: "perdu",
    emoji: "🔴",
    label: "Perdu",
    regle: `Aucun don depuis ${PARAMS.perduMois} mois`,
    action: "Dernière relance personnalisée, sinon archivage.",
  },
  {
    key: "ponctuel",
    emoji: "💶",
    label: "Ponctuel élevé",
    regle: `Un seul gros don isolé (≥ ${PARAMS.seuilGrandDonateur.toLocaleString("fr-FR")} €)`,
    action: "Convertir en donateur régulier (mensuel), inscrire dans la durée.",
  },
];

// Les 4 pics de générosité de l'année (audit des dons + plan V3).
export const PICS_ANNEE = [
  { mois: "Avril – mai", motif: "Campagne IFI (avant la déclaration)" },
  { mois: "Juillet", motif: "Pic d'été observé" },
  { mois: "Octobre", motif: "Campagne de rentrée" },
  { mois: "Décembre", motif: "Fin d'année fiscale (40 % des dons annuels en France)" },
];
