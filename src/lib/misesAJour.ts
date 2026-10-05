// Résumé des mises à jour, affiché dans le menu latéral (profil Recherche de fonds) : encart « Mises à jour ».
// Une entrée par date, la plus récente en premier ; chaque point tient en une ligne, sans numéro, et renvoie
// à l'endroit de Préau où il se trouve (les paramètres d'adresse ouvrent directement le bon filtre ou volet).

export type PointMiseAJour = { texte: string; href: string };
/** `depuis` : date affichée (jj/mm) ; `date` : la même en ISO, pour savoir si la mise à jour est récente. */
export type MiseAJour = { depuis: string; date: string; points: PointMiseAJour[] };

/** Durée pendant laquelle le titre « Mises à jour » est en ambre après la dernière mise à jour (jour de la mise à jour compris). */
export const JOURS_AMBRE = 3;

/** Le titre est en ambre tant que la mise à jour la plus récente date de moins de 3 jours ; un nouvel ajout le rallume. */
export function titreEnAmbre(aujourdhui: string): boolean {
  const recente = MISES_A_JOUR.map((m) => m.date).sort().at(-1);
  if (!recente) return false;
  const jours = Math.floor((Date.parse(aujourdhui) - Date.parse(recente)) / 86_400_000);
  return jours >= 0 && jours < JOURS_AMBRE;
}

export const MISES_A_JOUR: MiseAJour[] = [
  {
    depuis: "05/10",
    date: "2026-10-05",
    points: [
      { texte: "Nouvelle jauge des dons", href: "/mecenat/pipeline" },
      { texte: "Carte des donateurs « Alentours Reims »", href: "/mecenat/pipeline?filtre=alentours&carte=1" },
      { texte: "Information donateur « Bourse »", href: "/mecenat/pipeline?filtre=bourse" },
      { texte: "Tableau des prospects modifiable", href: "/mecenat/pipeline?volet=prospections" },
      { texte: "Import de la Liste prospect d'Axel", href: "/mecenat/pipeline?volet=prospections&liste=Liste%20Axel" },
    ],
  },
];
