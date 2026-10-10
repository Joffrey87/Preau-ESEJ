// Connexion d'une famille : son NOM DE FAMILLE sert d'identifiant (comme le rôle pour le bureau). Le compte est
// enregistré sous une adresse interne non routable ; Monsieur et Madame partagent donc le même mot de passe.
// Même règle que la fonction SQL `identifiant_famille` : sans accents, espaces ni tirets (« de Blic » → « deblic »).

const DOMAINE = "familles.esej";

export function identifiantFamille(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/œ/g, "o")
    .replace(/[^a-z0-9]+/g, "");
}

/** Adresse interne du compte d'une famille, d'après le nom saisi. */
export const emailConnexionFamille = (nom: string): string => `${identifiantFamille(nom)}@${DOMAINE}`;
