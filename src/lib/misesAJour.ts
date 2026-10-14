// Résumé des mises à jour, affiché dans le menu latéral (profil Recherche de fonds) : encart « Mises à jour ».
// Une entrée par date, la plus récente en premier ; chaque point tient en une ligne, sans numéro, et renvoie
// à l'endroit de Préau où il se trouve (les paramètres d'adresse ouvrent directement le bon filtre ou volet).

export type PointMiseAJour = { texte: string; href: string };
/** `depuis` : date affichée (jj/mm) ; `date` : la même en ISO, pour savoir si la mise à jour est récente. */
/** `titre` : en-tête à la place de « Depuis le jj/mm » (facultatif). */
export type MiseAJour = { depuis: string; date: string; titre?: string; points: PointMiseAJour[] };

/** Durée pendant laquelle le titre « Mises à jour » est en ambre après la dernière mise à jour (jour de la mise à jour compris). */
export const JOURS_AMBRE = 5;

/** Une entrée est en ambre pendant JOURS_AMBRE jours à partir de sa date (jour compris : 14/10 → 18/10 inclus). */
export function entreeEnAmbre(m: MiseAJour, aujourdhui: string): boolean {
  const jours = Math.floor((Date.parse(aujourdhui) - Date.parse(m.date)) / 86_400_000);
  return jours >= 0 && jours < JOURS_AMBRE;
}

/** Le titre est en ambre tant que la mise à jour la plus récente date de moins de JOURS_AMBRE jours ; un nouvel ajout le rallume. */
export function titreEnAmbre(aujourdhui: string): boolean {
  const recente = MISES_A_JOUR.map((m) => m.date).sort().at(-1);
  if (!recente) return false;
  const jours = Math.floor((Date.parse(aujourdhui) - Date.parse(recente)) / 86_400_000);
  return jours >= 0 && jours < JOURS_AMBRE;
}

export const MISES_A_JOUR: MiseAJour[] = [
  {
    depuis: "14/10",
    date: "2026-10-14",
    titre: "MAJ du 14/10",
    points: [
      { texte: "Suivi des actions à cocher, avec la date", href: "/mecenat/pipeline?volet=prospections" },
      { texte: "Fiche prospect : clic sur le nom", href: "/mecenat/pipeline?volet=prospections" },
      { texte: "États des prospects", href: "/mecenat/pipeline?volet=prospections" },
      { texte: "Onglet Dons et demande de reçu fiscal", href: "/recherche/dons" },
      { texte: "« Responsable » en ambre, « Réservé à » en orange", href: "/mecenat/pipeline" },
    ],
  },
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
