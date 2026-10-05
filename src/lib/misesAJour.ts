// Résumé des mises à jour, affiché dans le menu latéral (profil Recherche de fonds) : encart « Mises à jour ».
// Une entrée par date, la plus récente en premier ; chaque point tient en une ligne, sans numéro, et renvoie
// à l'endroit de Préau où il se trouve (les paramètres d'adresse ouvrent directement le bon filtre ou volet).

export type PointMiseAJour = { texte: string; href: string };
export type MiseAJour = { depuis: string; points: PointMiseAJour[] };

export const MISES_A_JOUR: MiseAJour[] = [
  {
    depuis: "05/10",
    points: [
      { texte: "Nouvelle jauge des dons", href: "/mecenat/pipeline" },
      { texte: "Carte des donateurs « Alentours Reims »", href: "/mecenat/pipeline?filtre=alentours&carte=1" },
      { texte: "Information donateur « Bourse »", href: "/mecenat/pipeline?filtre=bourse" },
      { texte: "Tableau des prospects modifiable", href: "/mecenat/pipeline?volet=prospections" },
      { texte: "Import de la Liste prospect d'Axel", href: "/mecenat/pipeline?volet=prospections&liste=Liste%20Axel" },
    ],
  },
];
