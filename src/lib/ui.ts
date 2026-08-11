// Petits utilitaires de style partagés.

// Élément cliquable « discret » (un nom de donateur, un intitulé…) : pas de
// soulignement de lien, mais une surbrillance douce au survol. À réutiliser
// partout où l'on rend un libellé cliquable pour ouvrir une fiche/un détail.
export const nomCliquableCls =
  "-mx-1 rounded px-1 text-left font-medium transition-colors hover:bg-accent-soft hover:text-accent";
