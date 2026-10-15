// Guide d'utilisation de Préau pour les Professeurs : un seul contenu, lu dans la page « Guide » et mis en PDF.

export type SectionGuide = {
  id: string;
  titre: string;
  icone: string;
  /** Ce que permet la page, en une phrase. */
  resume: string;
  etapes: string[];
  /** Encadré « Bon à savoir ». */
  astuce?: string;
  /** Schéma annoté de l'écran (public/guide, données fictives) et la légende de ses pastilles numérotées. */
  schema?: { src: string; largeur: number; hauteur: number; titre: string; legende: string[] };
};

export const GUIDE_PROFESSEURS: SectionGuide[] = [
  {
    id: "menu",
    titre: "Se repérer",
    icone: "dashboard",
    resume: "Votre menu tient en trois entrées : Notes & Bulletins, Appel & absences, Élèves.",
    etapes: [
      "En haut de chaque page, choisissez la classe puis la période (Période 1, 2… regroupées par trimestre).",
      "Notes & Bulletins comporte deux onglets : « Relevés de notes » (chaque période) et « Bulletins » (chaque trimestre).",
      "Tout s'enregistre de soi-même au fil de la frappe, même en cas de coupure ou de retour en arrière ; le bouton « Enregistrer », en bas de page, confirme et vous ramène en haut du relevé.",
    ],
    astuce: "L'ampoule, en bas à droite de l'écran, ouvre les fiches d'aide de la page où vous êtes.",
  },
  {
    id: "notes",
    titre: "Saisir des notes",
    icone: "crayon",
    resume: "Dans « Relevés de notes », chaque ligne est une matière et chaque colonne un élève.",
    etapes: [
      "Cliquez sur le nom d'une matière, ou sur une case : la saisie s'ouvre sous le tableau, où l'on peut ajouter une évaluation ou une note.",
      "« + Évaluation » crée un devoir : titre, date, coefficient, barème (noté sur 20, sur 10…) et, dans une classe à plusieurs niveaux, le ou les niveaux concernés (CE1, CE2… à cocher). Cliquez sur l'en-tête d'un devoir pour le modifier.",
      "Tapez la note dans la case de l'élève : un nombre (la virgule est acceptée), ou abs (absent), disp (dispensé), nr (non rendu).",
      "Chaque note s'enregistre d'elle-même. En bas, « Enregistrer et revenir au relevé » confirme et referme la saisie ; « ← Retour Relevés de notes », au centre en haut, la referme aussi.",
    ],
    astuce: "Les élèves sont regroupés par niveau ; les cases d'une évaluation d'un autre niveau sont grisées. Vous ne pouvez noter que les matières qui vous sont attribuées.",
    schema: {
      src: "/guide/saisie-notes.svg",
      largeur: 820,
      hauteur: 610,
      titre: "Créer une évaluation et saisir les notes",
      legende: [
        "Cliquez sur la matière, ou sur une case : la saisie s'ouvre sous le tableau.",
        "« + Évaluation » ouvre le formulaire du devoir.",
        "Titre, date, coefficient et barème (« Noté sur »), puis « Créer ».",
        "Tapez les notes dans la nouvelle colonne : un nombre, ou abs, disp, nr. Chacune s'enregistre d'elle-même.",
        "« ← Retour Relevés de notes » referme la saisie.",
        "« Enregistrer et revenir au relevé » confirme les saisies et referme la saisie.",
      ],
    },
  },
  {
    id: "releve",
    titre: "Le relevé de la période",
    icone: "bulletin",
    resume: "Le relevé reprend les notes de la période, sans moyenne, et une appréciation générale.",
    etapes: [
      "Cliquez sur le nom d'un élève (en tête de colonne) pour rédiger son appréciation générale (titulaire de la classe) : le champ s'agrandit pour montrer tout le texte.",
      "Catéchisme : pas de note, une appréciation seule, rédigée dans le même panneau que l'appréciation générale.",
      "Quand la classe est prête, « Marquer prêt » : la Directrice valide, puis publie aux familles.",
      "« PDF de la classe » télécharge tous les relevés ; cochez des élèves en tête de colonne pour n'imprimer que ceux-là.",
    ],
    astuce: "Un relevé publié verrouille les notes de l'élève pour la période (cadenas).",
    schema: {
      src: "/guide/appreciation-releve.svg",
      largeur: 820,
      hauteur: 450,
      titre: "Rédiger les appréciations du relevé",
      legende: [
        "Cliquez sur le nom de l'élève, en tête de colonne : ses appréciations s'ouvrent au-dessus du tableau.",
        "Rédigez l'appréciation générale (et celle du Catéchisme) ; elle s'enregistre en quittant le champ.",
        "Classe complète : « Marquer prêt » ; la Directrice valide, puis « Publier aux familles ».",
        "« PDF de la classe » (ou des élèves cochés) : les relevés, à imprimer.",
        "« Enregistrer et revenir au relevé » : confirme les saisies et referme le panneau (elles s'enregistrent aussi d'elles-mêmes).",
      ],
    },
  },
  {
    id: "bulletin",
    titre: "Le bulletin du trimestre",
    icone: "graduation",
    resume: "Le bulletin calcule seul les moyennes du trimestre à partir de toutes les notes de ses périodes.",
    etapes: [
      "Choisissez l'élève dans la barre du haut (un bouton par élève, regroupés par niveau ; ‹ › pour passer au suivant) ; « Tous » affiche la liste complète.",
      "Moyennes automatiques : moyenne simple sur 20 de chaque matière, puis de chaque ensemble (Français, Mathématiques…) et moyenne générale.",
      "Chaque matière a son appréciation, face à sa moyenne : écrivez celle de vos matières (la titulaire peut les écrire toutes).",
      "Titulaire : rédigez l'« Appréciation du trimestre » ; les appréciations des relevés ne sont pas reprises.",
      "Catéchisme : une appréciation seule, sans moyenne, hors de la moyenne générale, rédigée par le Directeur spirituel.",
      "Même circuit que le relevé : « Marquer prêt », puis validation et publication par la Directrice.",
    ],
    astuce: "Le bulletin porte la date de naissance de l'élève et un encart pour la signature des parents.",
    schema: {
      src: "/guide/appreciations-bulletin.svg",
      largeur: 820,
      hauteur: 510,
      titre: "Les appréciations du bulletin",
      legende: [
        "Les moyennes sont calculées seules : rien à saisir.",
        "L'appréciation de chaque matière, face à sa moyenne (son professeur ou la titulaire).",
        "Catéchisme : une appréciation seule, sans moyenne.",
        "Titulaire : l'appréciation du trimestre.",
        "« Enregistrer », en bas des bulletins : confirme les saisies.",
      ],
    },
  },
  {
    id: "appel",
    titre: "Faire l'appel",
    icone: "calendar",
    resume: "« Appel & absences » : l'appel du jour, puis le récapitulatif de la période.",
    etapes: [
      "Choisissez la date (aujourd'hui par défaut) ; cochez « Préciser par demi-journée » pour distinguer matin et après-midi.",
      "Pour chaque élève : Présent, Absent ou Retard ; en cas d'absence ou de retard, précisez le type et une remarque.",
      "« Enregistrer l'appel » (puis « Mettre à jour l'appel » pour corriger).",
      "Le calendrier montre les jours où l'appel est fait ; le récapitulatif de la période est repris sur le bulletin.",
    ],
    astuce: "L'appel est fait par la titulaire de la classe (ou la Directrice) ; les autres professeurs le consultent.",
  },
  {
    id: "eleves",
    titre: "Vos élèves",
    icone: "users",
    resume: "« Élèves » : le trombinoscope et la liste de la classe.",
    etapes: [
      "Consultez les photos, les dates de naissance et les coordonnées utiles de la classe.",
      "Téléchargez le trombinoscope ou la liste des élèves en PDF pour l'imprimer.",
    ],
  },
];
