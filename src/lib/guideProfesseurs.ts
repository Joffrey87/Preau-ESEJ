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
    resume: "Votre menu comporte Notes & Bulletins (avec ses sous-entrées Conseil de classe et Archives), Appel & absences et Élèves.",
    etapes: [
      "En haut de la page, une seule barre : les onglets « Relevés de notes » (une période) et « Bulletins » (un trimestre), puis la liste de choix. Elle propose les périodes passées, la période en cours et la suivante ; dans « Bulletins », elle propose les trimestres.",
      "« Conseil de classe » et « Archives (périodes) » s'ouvrent depuis le menu de gauche, sous Notes & Bulletins.",
      "Tout s'enregistre de soi-même au fil de la frappe, même en cas de coupure ou de retour en arrière ; le bouton « Enregistrer », en bas de page, confirme et vous ramène en haut du relevé.",
      "Le bouton « Retour » du navigateur revient à l'écran précédent (onglet, classe, période, bulletin) ; il referme aussi une saisie ouverte.",
      "« + Évaluation » existe en bouton sur la page « Relevés de notes » et en sous-entrée du menu de gauche, sous Notes & Bulletins.",
    ],
    astuce: "L'ampoule, en bas à droite de l'écran, ouvre les fiches d'aide de la page où vous êtes.",
  },
  {
    id: "notes",
    titre: "Saisir des notes",
    icone: "crayon",
    resume: "Dans « Relevés de notes », chaque ligne est une matière et chaque colonne un élève ; la case affiche la moyenne de la matière pour la période.",
    etapes: [
      "Cliquez sur une case : la saisie de la matière s'ouvre sous le tableau, déjà placée sur l'élève (ses notes évaluation par évaluation, sa moyenne et son appréciation), prête à être modifiée. Le nom de la matière ouvre la même saisie. Les matières dont vous n'êtes pas responsable restent en lecture.",
      "Classe à plusieurs niveaux : les blocs « CE1 · 4 », « CE2 · 3 », « Tous les niveaux » limitent le tableau à un niveau (sur téléphone, un seul niveau s'affiche à l'ouverture).",
      "« + Évaluation » (sous les blocs de niveau, ou dans le menu de gauche) ouvre la saisie avec le formulaire déjà ouvert : titre, matière (la liste, à droite du titre, change de matière), date, coefficient, barème (noté sur 20, sur 10…) et niveau(x) concerné(s). Les cases de niveau et les blocs de niveau sont liés : cocher un niveau affiche ses élèves, et inversement.",
      "Sous le formulaire, saisissez tout de suite la note et l'appréciation des élèves des niveaux cochés ; un trait ambre sépare les niveaux. Sans note, l'élève est considéré absent (« abs »), hors de la moyenne.",
      "Une note : un nombre (la virgule est acceptée), ou abs (absent), disp (dispensé), nr (non rendu). « Créer » et « Annuler » restent affichés en bas de l'écran pendant le défilement ; « ← Retour Relevés de notes » referme la saisie.",
    ],
    astuce: "Les élèves sont regroupés par niveau ; les cases d'une évaluation d'un autre niveau sont grisées. Vous ne pouvez noter que les matières qui vous sont attribuées. Le champ d'appréciation garde deux lignes et s'agrandit au-delà.",
    schema: {
      src: "/guide/saisie-notes.svg",
      largeur: 820,
      hauteur: 720,
      titre: "Créer une évaluation et saisir les notes",
      legende: [
        "« + Évaluation », sous les blocs de niveau : la saisie s'ouvre avec le formulaire du devoir.",
        "Dans le tableau, la case affiche la moyenne ; un clic ouvre la saisie sur l'élève (notes, moyenne, appréciation).",
        "Titre, matière (la liste change de matière), date, coefficient, « Noté sur » et niveaux concernés, liés aux blocs de niveau.",
        "Un trait ambre ouvre chaque niveau : les élèves des niveaux cochés sont listés dessous.",
        "Note et appréciation saisies sur-le-champ ; sans note, l'élève est absent.",
        "« Créer » et « Annuler » restent visibles en bas pendant le défilement.",
      ],
    },
  },
  {
    id: "releve",
    titre: "Le relevé de la période",
    icone: "bulletin",
    resume: "Le relevé reprend la moyenne de chaque matière pour la période, et une appréciation générale.",
    etapes: [
      "Cliquez sur le nom d'un élève (en tête de colonne) pour rédiger son appréciation générale (titulaire de la classe) : le champ s'agrandit pour montrer tout le texte.",
      "Catéchisme : pas de note, une appréciation seule, réservée au Directeur spirituel ; les autres professeurs la lisent sans pouvoir la modifier.",
      "Le commutateur « En cours / Prêt » (en haut à droite) bascule toute la classe d'un clic. Le passage à « Prêt » demande une confirmation : il prévient la Directrice, et vous ne pouvez plus modifier ni ajouter de notes ni d'appréciations. La Directrice valide, puis publie aux familles. Le commutateur passe alors en « Publié » (en vert) et se fige ; il affiche aussi « Publié » pour une période passée.",
      "Dans le panneau d'un élève, ‹ et › passent à l'élève précédent ou suivant. Le PDF de la classe est réservé à la Directrice. Sur téléphone, les en-têtes d'élèves se réduisent au prénom et à l'initiale du nom.",
    ],
    astuce: "Un relevé publié verrouille les notes de l'élève pour la période (cadenas).",
    schema: {
      src: "/guide/appreciation-releve.svg",
      largeur: 820,
      hauteur: 450,
      titre: "Rédiger les appréciations du relevé",
      legende: [
        "Cliquez sur le nom de l'élève, en tête de colonne : ses appréciations s'ouvrent au-dessus du tableau.",
        "Rédigez l'appréciation générale ; elle s'enregistre en quittant le champ. Les flèches ‹ › du titre passent à l'élève voisin.",
        "Classe complète : le commutateur « En cours / Prêt » ; la Directrice valide, puis « Publier aux familles » (le commutateur affiche alors « Publié »).",
      ],
    },
  },
  {
    id: "bulletin",
    titre: "Le bulletin du trimestre",
    icone: "graduation",
    resume: "Le bulletin calcule seul les moyennes du trimestre à partir de toutes les notes de ses périodes.",
    etapes: [
      "Choisissez l'élève dans la barre des prénoms (un bouton par élève, regroupés par niveau). En haut de la fiche, les boutons ‹ et › (prénom et initiale du nom de l'élève voisin, avec « Vers CE2 » quand on change de niveau) passent au précédent ou au suivant ; l'élève en cours figure dessous, avec sa moyenne générale.",
      "Moyennes automatiques : moyenne simple sur 20 de chaque matière, puis de chaque ensemble (Français, Mathématiques…) et moyenne générale.",
      "Chaque matière a son appréciation, face à sa moyenne : écrivez celle de vos matières (la titulaire peut les écrire toutes).",
      "Titulaire : rédigez l'« Appréciation du trimestre » ; les appréciations des relevés ne sont pas reprises.",
      "Catéchisme : une appréciation seule, sans moyenne, hors de la moyenne générale, rédigée par le Directeur spirituel.",
      "Même circuit que le relevé : commutateur « En cours / Prêt », puis validation et publication par la Directrice (« Publié »). Le nom de la titulaire n'est pas répété sous les matières.",
    ],
    astuce: "Le bulletin porte la date de naissance de l'élève et un encart pour la signature des parents.",
    schema: {
      src: "/guide/appreciations-bulletin.svg",
      largeur: 820,
      hauteur: 560,
      titre: "Les appréciations du bulletin",
      legende: [
        "Boutons ‹ › : élève précédent ou suivant (prénom et initiale) ; « Vers CE2 » signale un changement de niveau.",
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
