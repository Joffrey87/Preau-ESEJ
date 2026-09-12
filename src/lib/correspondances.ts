// Règles de correspondance : transforment un libellé bancaire brut en un
// intitulé lisible, et proposent une catégorie ou une alerte de vérification.
//
// Deux étages :
//   1. NORMALISATION, appliquée à tout libellé (casse, bruit bancaire, références) ;
//   2. RÈGLES, définies par le trésorier dans Comptabilité → Correspondances.
//
// Les règles vivent en base (table `correspondances`) et non dans le code, pour
// que le prochain trésorier puisse les faire évoluer sans développeur.

export type ModeMotif = "contient" | "commence" | "regex";
export type NiveauAlerte = "ambre" | "rouge";

export type Correspondance = {
  id: string;
  ordre: number;
  actif: boolean;
  motif: string;
  mode: ModeMotif;
  type_operation: "recette" | "depense" | null;
  montant_min: number | null;
  montant_max: number | null;
  libelle_modele: string | null;
  categorie_id: string | null;
  alerte: NiveauAlerte | null;
  alerte_message: string | null;
  notes: string | null;
};

export type OperationBrute = {
  libelle_origine: string;
  montant: number;
  type: "recette" | "depense";
  date_operation: string;
};

export type Resultat = {
  libelle: string;
  categorie_id: string | null;
  alerte: NiveauAlerte | null;
  alerte_message: string | null;
  regle: Correspondance | null;
};

export const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Particules qui restent en minuscules au milieu d'un intitulé (usage français). */
const PARTICULES = new Set([
  "de", "du", "des", "le", "la", "les", "et", "d", "l", "au", "aux",
  "en", "sur", "pour", "par", "chez", "sous", "a", "à",
]);

/** Sigles conservés en capitales : une liste explicite est plus sûre qu'une
 *  heuristique sur la longueur du mot (« URSSAF » ≠ « Urssaf », mais « DON » → « Don »). */
const SIGLES = new Set([
  "ARIL", "ESEJ", "URSSAF", "FIDES", "FIDEM", "B2V", "AKTO", "DGFIP", "CAF", "MSA",
  "CB", "TPE", "IBAN", "BIC", "SEPA", "RIB", "TVA", "SIRET", "SIREN", "IFI", "IR",
  "SAS", "SARL", "SCI", "EURL", "SA", "GIE", "EDF", "GDF", "SNCF", "RATP", "OGEC",
]);

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Comparaison insensible à la casse et aux accents. */
export const normaliserPourComparaison = (s: unknown) =>
  sansAccent(String(s ?? "").toLowerCase()).trim();

/**
 * Casse titre française : « COMMANDE CALENDRIER » → « Commande Calendrier ».
 * Les mots déjà correctement capitalisés sont laissés tels quels ; seules les
 * suites tout en majuscules sont retouchées, pour ne pas défaire une saisie
 * manuelle soignée.
 */
export function enCasseTitre(s: string): string {
  return s
    .split(/(\s+|-)/)
    .map((mot, i) => {
      if (/^\s+$/.test(mot) || mot === "-") return mot;
      // On ne touche pas aux mots qui contiennent déjà une minuscule.
      if (/[a-zà-ÿ]/.test(mot)) return mot;
      const bas = mot.toLowerCase();
      // Sigles connus : conservés tels quels (URSSAF, FIDES, CB…).
      if (SIGLES.has(mot.replace(/[^A-Z0-9]/g, ""))) return mot;
      if (i > 0 && PARTICULES.has(bas)) return bas;
      return bas.charAt(0).toUpperCase() + bas.slice(1);
    })
    .join("");
}

/**
 * Retire le bruit bancaire : préfixes d'opération, numéros de série,
 * références longues, dates collées.
 */
export function retirerBruit(s: string): string {
  let out = s.trim();
  // Préfixes d'opération de la banque.
  out = out.replace(
    /^(VIR(EMENT)?( SEPA| INST| INSTANTANE| RECU)?|PRLV( SEPA)?|CB|PAIEMENT( CB)?|RETRAIT|REM(ISE)? CHQ|VRST)\s+/i,
    "",
  );
  // Références explicites : REF..., N°..., MDT..., ECH...
  out = out.replace(/\b(REF|N|NO|MDT|ECH|ID|RUM)\s*°?\s*[A-Z0-9-]{5,}\b/gi, " ");
  // Suites de chiffres longues (numéros de série, identifiants).
  out = out.replace(/\b[\d][\d\s./-]{5,}\d\b/g, " ");
  out = out.replace(/\s{2,}/g, " ").trim();
  return out;
}

/** Nettoyage des seules références, en conservant le préfixe bancaire. */
function retirerReferences(s: string): string {
  return s
    .replace(/\b(REF|N|NO|MDT|ECH|ID|RUM)\s*°?\s*[A-Z0-9-]{5,}\b/gi, " ")
    .replace(/\b[\d][\d\s./-]{5,}\d\b/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Étage 1 : normalisation systématique, avant toute règle.
 * Repli en cascade : un libellé entièrement composé de références (« REM CHQ
 * N9315786 REF1027802633 ») ne doit pas retomber sur le brut en capitales.
 */
export function normaliserLibelle(brut: string): string {
  const complet = retirerBruit(brut);
  if (complet) return enCasseTitre(complet);
  const partiel = retirerReferences(brut);
  if (partiel) return enCasseTitre(partiel);
  return enCasseTitre(brut.trim());
}

/** Une règle s'applique-t-elle à cette opération ? Renvoie les captures regex. */
function correspond(r: Correspondance, op: OperationBrute): RegExpMatchArray | true | null {
  if (!r.actif) return null;
  if (r.type_operation && r.type_operation !== op.type) return null;
  if (r.montant_min !== null && op.montant < r.montant_min) return null;
  if (r.montant_max !== null && op.montant > r.montant_max) return null;

  const cible = normaliserPourComparaison(op.libelle_origine);
  const motif = normaliserPourComparaison(r.motif);

  if (r.mode === "contient") return cible.includes(motif) ? true : null;
  if (r.mode === "commence") return cible.startsWith(motif) ? true : null;
  try {
    // Le motif regex garde sa casse d'origine ; on compare sans accent.
    const m = sansAccent(op.libelle_origine).match(new RegExp(r.motif, "i"));
    return m ?? null;
  } catch {
    return null; // regex invalide → règle ignorée plutôt que page cassée
  }
}

/**
 * Remplace les jetons d'un modèle d'intitulé :
 *   {mois} {annee} {mois_annee} {montant} {origine} {1} {2}…
 */
export function appliquerModele(
  modele: string,
  op: OperationBrute,
  captures: RegExpMatchArray | true | null,
): string {
  const [y, m] = op.date_operation.split("-").map(Number);
  const mois = MOIS_FR[(m || 1) - 1] ?? "";
  return modele
    .replace(/\{mois_annee\}/gi, `${mois} ${y}`)
    .replace(/\{mois\}/gi, mois)
    .replace(/\{annee\}/gi, String(y))
    .replace(/\{montant\}/gi, op.montant.toFixed(2).replace(".", ",") + " €")
    .replace(/\{origine\}/gi, normaliserLibelle(op.libelle_origine))
    .replace(/\{(\d+)\}/g, (_, n) => {
      const i = Number(n);
      const brut = Array.isArray(captures) ? (captures[i] ?? "") : "";
      return enCasseTitre(brut.trim());
    })
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Étage 2 : applique la première règle qui correspond (par ordre croissant).
 * Sans règle, on renvoie le libellé simplement normalisé.
 */
export function appliquerCorrespondances(
  op: OperationBrute,
  regles: Correspondance[],
): Resultat {
  const triees = [...regles].sort((a, b) => a.ordre - b.ordre);
  for (const r of triees) {
    const m = correspond(r, op);
    if (!m) continue;
    return {
      libelle: r.libelle_modele ? appliquerModele(r.libelle_modele, op, m) : normaliserLibelle(op.libelle_origine),
      categorie_id: r.categorie_id,
      alerte: r.alerte,
      alerte_message: r.alerte_message,
      regle: r,
    };
  }
  return {
    libelle: normaliserLibelle(op.libelle_origine),
    categorie_id: null,
    alerte: null,
    alerte_message: null,
    regle: null,
  };
}
