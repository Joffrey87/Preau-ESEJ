// Règles propres à l'import d'un relevé bancaire, en complément des
// Correspondances : elles portent sur des cas où la catégorie découle du sens
// même du libellé (impayé, frais de dossier, mois d'avance, scolarité) et sur
// le rattachement d'une écriture de scolarité à une famille de l'onglet Frais
// de scolarité.
//
// Tout est déterministe : aucune donnée ne quitte le navigateur.

import { FRAIS_DOSSIER_PAR_ENFANT, type NatureAffectation } from "@/lib/scolariteDepots";
import { CAT_SCOLARITE, CAT_MOIS_AVANCE, CAT_FRAIS_DOSSIER } from "@/lib/categoriesScolarite";

const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const norm = (s: string) =>
  sansAccent(s.toLowerCase())
    .replace(/[^a-z0-9' -]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** Mots d'un libellé, normalisés (sans accents, minuscules). */
function mots(s: string): Set<string> {
  return new Set(norm(s).replace(/[-']/g, " ").split(" ").filter(Boolean));
}

export type RegleImport = {
  libelle: string;
  /** Nom de la catégorie imposée (recherchée parmi les catégories du bon sens). */
  categorie: string;
};

/**
 * Règle prioritaire sur les Correspondances : « F FRAIS PRLV IMP » désigne les
 * frais bancaires d'un prélèvement impayé ; « IMP » devient « Impayé » dans
 * l'intitulé.
 */
export function regleImport(brut: string, type: "recette" | "depense"): RegleImport | null {
  const s = norm(brut);
  if (type === "depense" && /\bf frais prlv imp\b/.test(s)) {
    return {
      libelle: brut.trim().replace(/\bIMP\b/gi, "Impayé").replace(/\s{2,}/g, " "),
      categorie: "Frais bancaires",
    };
  }
  return null;
}

// --- Rattachement à une famille -------------------------------------------

export type InscriptionImport = {
  id: string;
  annee_scolaire: string;
  famille_nom: string;
  nb_enfants: number | null;
  montant_mensuel: number | null;
};

const PARTICULES = new Set(["de", "du", "des", "d", "le", "la", "l", "van", "von"]);

/**
 * Mots qui identifient une famille : « Picard A » → [picard] (l'initiale ne
 * sert qu'à distinguer deux familles homonymes, elle n'apparaît pas dans le
 * libellé bancaire) ; « de Blic » → [blic].
 */
export function motsFamille(nom: string): string[] {
  return [...mots(nom)].filter((m) => m.length > 1 && !PARTICULES.has(m));
}

/** Année scolaire d'un exercice : « Exercice 2026-2027 » → « 2026-2027 ». */
export function anneeDeLibelle(libelle: string | null | undefined): string | null {
  const m = (libelle ?? "").match(/(\d{4})\s*[-–]\s*(\d{4})/);
  return m ? `${m[1]}-${m[2]}` : null;
}

const anneeSuivante = (a: string) => {
  const [x, y] = a.split("-").map(Number);
  return `${x + 1}-${y + 1}`;
};

/**
 * Années scolaires à examiner, la plus probable d'abord.
 *
 * Règle du trésorier (28/09/2026) : un versement de JUILLET ou d'AOÛT vise
 * l'année scolaire suivante — mois d'avance d'une nouvelle famille, frais de
 * dossier de la rentrée ou mensualité de septembre. Jusqu'en juin, il vise
 * l'année en cours. L'autre année reste proposée en second choix.
 */
export function anneesCandidates(
  date: string,
  anneeExercice: string | null,
): string[] {
  if (!anneeExercice) return [];
  const suivante = anneeSuivante(anneeExercice);
  const mois = Number(date.slice(5, 7));
  return mois === 7 || mois === 8 ? [suivante, anneeExercice] : [anneeExercice, suivante];
}

export type ResultatFamille = {
  /** Familles reconnues dans le libellé, pour l'année retenue. */
  candidats: InscriptionImport[];
  /** Plusieurs familles portent ce nom : le choix doit être validé. */
  ambigu: boolean;
};

/**
 * Reconnaît la famille citée dans un libellé. Une famille est retenue quand
 * tous ses mots significatifs figurent dans le libellé. On s'arrête à la
 * première année qui donne un résultat.
 */
export function reconnaitreFamille(
  textes: string[],
  inscriptions: InscriptionImport[],
  annees: string[],
): ResultatFamille {
  const presents = new Set<string>();
  for (const t of textes) for (const m of mots(t)) presents.add(m);

  for (const annee of annees) {
    const candidats = inscriptions.filter((i) => {
      if (i.annee_scolaire !== annee) return false;
      const m = motsFamille(i.famille_nom);
      return m.length > 0 && m.every((x) => presents.has(x));
    });
    if (candidats.length > 0) return { candidats, ambigu: candidats.length > 1 };
  }
  return { candidats: [], ambigu: false };
}

/** Familles proposées au choix manuel : celles des années examinées, la plus probable d'abord. */
export function famillesProposees(inscriptions: InscriptionImport[], annees: string[]): InscriptionImport[] {
  return inscriptions
    .filter((i) => annees.includes(i.annee_scolaire))
    .sort(
      (a, b) =>
        annees.indexOf(a.annee_scolaire) - annees.indexOf(b.annee_scolaire) ||
        a.famille_nom.localeCompare(b.famille_nom, "fr"),
    );
}

/** Libellé d'une famille pour les listes : « Picard A · 2026-2027 (2 enf.) ». */
export function libelleFamille(i: InscriptionImport): string {
  return `${i.famille_nom} · ${i.annee_scolaire}${i.nb_enfants ? ` (${i.nb_enfants} enf.)` : ""}`;
}

// --- Reconnaissance des écritures de scolarité ------------------------------

export { CAT_SCOLARITE, CAT_MOIS_AVANCE, CAT_FRAIS_DOSSIER };

export type AnalyseScolarite = {
  /** Catégorie proposée pour la ligne. */
  categorie: string;
  /** Intitulé proposé quand la famille est connue avec certitude. */
  libelle: string | null;
  /** Doute à lever avant de valider (alerte ambre). */
  alerte: string | null;
  /** Familles retenues (ids) ; plusieurs = choix à valider. */
  candidats: string[];
  /** Répartition proposée quand le libellé mêle deux natures. */
  ventilation: { categorie: string; montant: number; libelle: string }[];
};

const ETIQUETTE: Record<string, string> = {
  [CAT_SCOLARITE]: "Frais de scolarité",
  [CAT_MOIS_AVANCE]: "Mois d'avance",
  [CAT_FRAIS_DOSSIER]: "Frais de dossier",
};

/** Nombre de mensualités que représente le montant (0 si ce n'en est pas un multiple, de 1 à 10). */
export function nbMensualites(montant: number, mensuel: number | null): number {
  if (!mensuel || mensuel <= 0) return 0;
  const k = montant / mensuel;
  const r = Math.round(k);
  return r >= 1 && r <= 10 && Math.abs(montant - r * mensuel) < 0.01 ? r : 0;
}

/** Le libellé parle-t-il d'un don ? La déduction par le montant est alors écartée. */
export function parleDeDon(brut: string): boolean {
  return /\bdons?\b/.test(norm(brut));
}

/**
 * Reconnaît une écriture de scolarité et la famille concernée.
 *
 * 1. Mots-clés explicites : « mois d'avance », « frais de dossier »,
 *    « scolarité ». La nature est certaine ; la famille vient du nom lu dans le
 *    libellé. Si les deux premiers figurent ensemble, une ventilation est
 *    proposée (frais de dossier + reste en mois d'avance).
 * 2. Sans mot-clé, le MONTANT sert d'indice : une somme égale à une ou
 *    plusieurs mensualités de la famille nommée, ou à la mensualité d'une
 *    famille quand aucun nom ne figure. C'est une déduction : alerte ambre.
 *    `deduction.avecNom` : nom + montant (écartée si le libellé parle d'un don
 *    ou si une Correspondance a fixé une autre catégorie) ; `deduction.sansNom` :
 *    montant seul (réservée aux lignes qu'aucune règle ni l'historique n'a su
 *    classer, pour ne pas écraser un donateur habituel).
 */
export function analyserScolarite(
  brut: string,
  type: "recette" | "depense",
  montant: number,
  date: string,
  anneeExercice: string | null,
  inscriptions: InscriptionImport[],
  deduction: { avecNom: boolean; sansNom: boolean },
): AnalyseScolarite | null {
  if (type !== "recette") return null;
  const s = norm(brut).replace(/'/g, " ");
  const kwAvance = /\bmois d ?avance\b/.test(s);
  // « Frais d'inscription » : comptés comme frais de dossier (décision du 28/09/2026).
  const kwInscription = /\bfrais d ?inscriptions?\b/.test(s);
  const kwDossier = /\bfrais (de |d )?dossiers?\b/.test(s) || kwInscription;
  const noteInscription = kwInscription ? " « Frais d'inscription » comptés en frais de dossier." : "";
  const kwScolarite = /\bscolarit/.test(s);

  const parNom = () =>
    reconnaitreFamille([brut], inscriptions, anneesCandidates(date, anneeExercice));
  const parId = new Map(inscriptions.map((i) => [i.id, i]));
  // Homonymes (« Picard A », « Picard H ») : l'initiale rapprochée d'un prénom
  // du libellé oriente le choix, sans le trancher.
  const nomsDe = (ids: string[]) => {
    const noms = ids.map((id) => parId.get(id)?.famille_nom ?? "?");
    const presents = [...mots(brut)];
    const indices = noms.filter((n) => {
      const init = n.match(/\s([A-Za-z])$/)?.[1]?.toLowerCase();
      const famille = motsFamille(n);
      return !!init && presents.some((m) => m.length > 1 && m.startsWith(init) && !famille.includes(m));
    });
    return noms.join(" ou ") + (indices.length === 1 ? ` — l'initiale suggère ${indices[0]}` : "");
  };

  /** Intitulé, alerte et familles pour une nature donnée par un mot-clé. */
  const explicite = (categorie: string, nature: NatureAffectation): AnalyseScolarite => {
    const r = parNom();
    const ids = r.candidats.map((c) => c.id);
    let alerte: string | null = null;
    if (ids.length === 0) alerte = "Famille non reconnue dans le libellé : à rattacher.";
    else if (r.ambigu) alerte = `Plusieurs familles portent ce nom (${nomsDe(ids)}) : à valider.`;
    else if (nature === "mensualite") {
      const i = r.candidats[0];
      if (!nbMensualites(montant, i.montant_mensuel)) {
        alerte = `Montant différent des mensualités de la famille ${i.famille_nom} (${i.montant_mensuel ?? "?"} €) : à vérifier.`;
      }
    }
    return {
      categorie,
      libelle: ids.length === 1 ? `${ETIQUETTE[categorie]} — ${r.candidats[0].famille_nom}` : null,
      alerte,
      candidats: ids,
      ventilation: [],
    };
  };

  if (kwAvance && kwDossier) {
    const base = explicite(CAT_FRAIS_DOSSIER, "frais_dossier");
    const nom = base.candidats.length === 1 ? parId.get(base.candidats[0])?.famille_nom : null;
    const suffixe = nom ? ` — ${nom}` : "";
    // Nombre d'enfants entrants : celui qui laisse exactement une mensualité
    // de la famille en mois d'avance (270 = 60 + 210). À défaut, un enfant.
    const famille = base.candidats.length === 1 ? parId.get(base.candidats[0]) : undefined;
    const mensuel = famille?.montant_mensuel ?? 0;
    const enfants =
      [1, 2, 3, 4].find((n) => mensuel > 0 && Math.abs(montant - n * FRAIS_DOSSIER_PAR_ENFANT - mensuel) < 0.01) ?? 0;
    const dossier = (enfants || 1) * FRAIS_DOSSIER_PAR_ENFANT;
    const reste = Math.round((montant - dossier) * 100) / 100;
    const ventilation =
      montant > dossier
        ? [
            { categorie: CAT_FRAIS_DOSSIER, montant: dossier, libelle: `Frais de dossier${suffixe}` },
            { categorie: CAT_MOIS_AVANCE, montant: reste, libelle: `Mois d'avance${suffixe}` },
          ]
        : [];
    return {
      ...base,
      libelle: nom ? `Frais de dossier et mois d'avance${suffixe}` : null,
      alerte:
        ventilation.length > 0 && !enfants
          ? `Ventilation proposée : ${dossier} € de frais de dossier + ${reste} € de mois d'avance (un enfant supposé) — à vérifier.${base.alerte ? " " + base.alerte : ""}${noteInscription}`
          : `${base.alerte ?? ""}${noteInscription}`.trim() || null,
      ventilation,
    };
  }
  if (kwDossier) {
    const r = explicite(CAT_FRAIS_DOSSIER, "frais_dossier");
    return noteInscription ? { ...r, alerte: `${r.alerte ?? ""}${noteInscription}`.trim() } : r;
  }
  if (kwAvance) return explicite(CAT_MOIS_AVANCE, "mois_avance");
  if (kwScolarite) return explicite(CAT_SCOLARITE, "mensualite");

  if (!deduction.avecNom) return null;

  // Sans mot-clé : déduction par le montant, appuyée sur le nom s'il figure.
  const annees = anneesCandidates(date, anneeExercice);
  const r = reconnaitreFamille([brut], inscriptions, annees);
  if (r.candidats.length > 0) {
    const concordants = r.candidats.filter((c) => nbMensualites(montant, c.montant_mensuel) > 0);
    if (concordants.length === 0) return null; // famille citée, mais montant sans rapport
    const ids = concordants.map((c) => c.id);
    const k = nbMensualites(montant, concordants[0].montant_mensuel);
    return {
      categorie: CAT_SCOLARITE,
      libelle: ids.length === 1 ? `Frais de scolarité — ${concordants[0].famille_nom}` : null,
      alerte:
        ids.length === 1
          ? `Déduit du nom et du montant (${k} mensualité${k > 1 ? "s" : ""} de ${concordants[0].montant_mensuel} €) : à confirmer, ce peut être un don.`
          : `Montant d'une mensualité, plusieurs familles possibles (${nomsDe(ids)}) : à valider.`,
      candidats: ids,
      ventilation: [],
    };
  }

  // Aucun nom : la mensualité exacte d'une famille de l'année de l'exercice.
  if (!deduction.sansNom) return null;
  const memeMontant = inscriptions.filter(
    (i) => i.annee_scolaire === annees[0] && nbMensualites(montant, i.montant_mensuel) === 1,
  );
  if (memeMontant.length === 0) return null;
  const ids = memeMontant.map((i) => i.id);
  return {
    categorie: CAT_SCOLARITE,
    libelle: null,
    alerte:
      ids.length === 1
        ? `Montant égal à la mensualité de la famille ${memeMontant[0].famille_nom}, sans nom dans le libellé : à confirmer.`
        : `Montant égal à une mensualité (${ids.length} familles possibles : ${nomsDe(ids)}) : famille à identifier.`,
    candidats: ids,
    ventilation: [],
  };
}

// --- Tiers payeurs ------------------------------------------------------------

/** Amitié Sainte Anne : frais de scolarité payés pour une ou plusieurs familles (pas un don). */
export function estAmitieSainteAnne(brut: string): boolean {
  return /\bamitie sainte anne\b/.test(norm(brut));
}

export type RepartitionTiers = {
  date: string;
  total: number;
  parts: { famille_nom: string; montant: number; nature: NatureAffectation }[];
};

/**
 * Répartition proposée pour un nouveau versement d'Amitié Sainte Anne, d'après
 * le dernier versement réparti : mêmes familles ; mêmes montants si le total
 * est identique, sinon au prorata (arrondi au centime, le reste sur la
 * dernière part).
 */
export function proposerRepartition(
  derniere: RepartitionTiers | null,
  montant: number,
): { famille_nom: string; montant: number; nature: NatureAffectation }[] {
  if (!derniere || derniere.parts.length === 0 || derniere.total <= 0) return [];
  if (Math.abs(derniere.total - montant) < 0.005) return derniere.parts.map((p) => ({ ...p }));
  const parts = derniere.parts.map((p) => ({
    ...p,
    montant: Math.round((p.montant / derniere.total) * montant * 100) / 100,
  }));
  const ecart = Math.round((montant - parts.reduce((s, p) => s + p.montant, 0)) * 100) / 100;
  parts[parts.length - 1].montant = Math.round((parts[parts.length - 1].montant + ecart) * 100) / 100;
  return parts;
}

// --- Mémoire des choix ----------------------------------------------------------

/**
 * Mots propres au payeur dans un libellé bancaire : sans le vocabulaire de la
 * banque ni celui de l'objet (scolarité, don…), sans références chiffrées.
 * « VIR INST MME COTTEL CYNTHIA FRAIS DOSSIER PAUL COTTEL » → cottel, cynthia, paul.
 */
const VOCABULAIRE = new Set([
  "vir", "inst", "instantane", "virement", "sepa", "recu", "prlv", "rem", "chq", "cheque", "ref", "rel",
  "reference", "non", "transmise", "not", "provided", "mandat", "carte", "paiement", "remise",
  "mr", "mme", "mlle", "monsieur", "madame", "ou", "et", "de", "du", "des", "la", "le", "les", "pour", "par", "au", "aux",
  "frais", "scolarite", "scolarites", "dossier", "dossiers", "inscription", "mois", "avance", "don", "dons",
  "janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre",
  "ecole", "annee", "enfant", "enfants", "famille", "solde", "acompte",
]);

export function motsPayeur(textes: string[]): Set<string> {
  const out = new Set<string>();
  for (const t of textes) {
    for (const m of mots(t)) {
      if (m.length < 3 || /\d/.test(m) || VOCABULAIRE.has(m)) continue;
      out.add(m);
    }
  }
  return out;
}

export type Souvenir = { mots: string[]; valeur: string };

/**
 * Choix déjà faits pour un libellé ressemblant : famille rattachée ou donateur
 * relié. Retenu seulement si tous les souvenirs concordants désignent la même
 * valeur (sinon, rien : les payeurs multiples comme Amitié Sainte Anne ne
 * doivent pas être tranchés par la mémoire).
 */
export function rappeler(textes: string[], souvenirs: Souvenir[]): string | null {
  const presents = motsPayeur(textes);
  if (presents.size === 0) return null;
  const valeurs = new Set<string>();
  for (const s of souvenirs) {
    if (s.mots.length === 0) continue;
    const communs = s.mots.filter((m) => presents.has(m)).length;
    if (communs >= Math.min(2, s.mots.length) && communs / s.mots.length >= 0.75) valeurs.add(s.valeur);
  }
  return valeurs.size === 1 ? [...valeurs][0] : null;
}
