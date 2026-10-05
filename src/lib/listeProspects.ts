// Lecture d'une liste de prospects au format du « Listing » du comité : un classeur Excel avec une
// feuille par lettre (A, B, C…), chacune ayant une ligne d'en-tête NOM / PRENOM / ADRESSE / CP / VILLE
// (et une colonne de civilité sans titre). Les lignes de total, les feuilles vides et les récapitulatifs
// sont ignorés.

import { normaliser } from "@/lib/reconciliation";
import { formaterNomParticulier } from "@/lib/nomPropre";

export type LigneListe = {
  titre: string | null;
  nom: string;
  prenom: string | null;
  adresse: string | null;
  cp_ville: string | null;
  /** Annotation libre trouvée à droite de la ville (ex. « DG BRUNO PAILLARD »). */
  note: string | null;
};

const MOTS_PETITS = new Set(["en", "de", "du", "des", "la", "le", "les", "sur", "sous", "lès", "les", "et", "aux", "au", "d", "l"]);

const texte = (v: unknown): string => (v == null ? "" : String(v).replace(/\s+/g, " ").trim());

/** « REIMS » → « Reims », « CHÂLONS EN CHAMPAGNE » → « Châlons en Champagne », « VILLERS-ALLERAND » → « Villers-Allerand ». */
export function formaterVille(ville: string): string {
  return ville
    .toLocaleLowerCase("fr-FR")
    .split(" ")
    .map((mot, i) =>
      i > 0 && MOTS_PETITS.has(mot)
        ? mot
        : mot
            .split("-")
            .map((p) => (p ? p.charAt(0).toLocaleUpperCase("fr-FR") + p.slice(1) : p))
            .join("-"),
    )
    .join(" ");
}

/** « 51100 Reims » → « Reims (51) » ; sans code postal reconnu, la ville seule. */
export function villeEtDepartement(cpVille: string | null | undefined): string {
  const t = texte(cpVille);
  const m = /^(\d{5})\s+(.+)$/.exec(t);
  if (!m) return t;
  // Outre-mer : département sur trois chiffres (971, 974…) ; Corse : 2A / 2B non gérés (code postal 20xxx).
  const dep = m[1].startsWith("97") || m[1].startsWith("98") ? m[1].slice(0, 3) : m[1].slice(0, 2);
  return `${m[2]} (${dep})`;
}

/** « 02200 » (déjà texte) ou 51100 (nombre) ; un code de 4 chiffres perd son zéro initial dans Excel. */
function codePostal(v: unknown): string {
  const t = texte(v).replace(/\.0$/, "");
  return /^\d{4}$/.test(t) ? "0" + t : t;
}

/** Civilité de la liste : « M MME » = le couple, « M » = monsieur, « MME » = madame. */
function titreDe(c: string): string | null {
  const t = normaliser(c);
  if (t === "m mme" || t === "m et mme" || t === "mr mme") return "M. & Mme";
  if (t === "m" || t === "mr") return "M.";
  if (t === "mme") return "Mme";
  return c ? c : null;
}

/** Prénom : espaces et casse nettoyés (« phillippe », « Éric » inchangés ; « JEAN LUC » → « Jean Luc »). */
function formaterPrenom(p: string): string {
  const t = texte(p);
  return t && t === t.toLocaleUpperCase("fr-FR")
    ? t.toLocaleLowerCase("fr-FR").replace(/(^|[\s-])(\S)/g, (_, a, b) => a + b.toLocaleUpperCase("fr-FR"))
    : t;
}

/** Lignes d'un tableau de lignes (feuille Excel convertie en `header: 1`). */
export function lignesDeFeuille(rows: unknown[][]): LigneListe[] {
  // En-tête : première ligne qui contient à la fois NOM et PRENOM.
  const idxEntete = rows.findIndex((r) => {
    const m = r.map((c) => normaliser(texte(c)));
    return m.includes("nom") && m.includes("prenom");
  });
  if (idxEntete < 0) return [];
  const entete = rows[idxEntete].map((c) => normaliser(texte(c)));
  const col = (nom: string, dernier = false) => (dernier ? entete.lastIndexOf(nom) : entete.indexOf(nom));
  const cNom = col("nom");
  const cPrenom = col("prenom");
  const cAdresse = col("adresse");
  const cCp = col("cp");
  const cVille = col("ville");
  const cNote = cVille >= 0 ? cVille + 1 : -1;

  const res: LigneListe[] = [];
  for (const r of rows.slice(idxEntete + 1)) {
    const nom = texte(r[cNom]);
    // Les lignes de total n'ont ni nom (texte) ni prénom ; un nom purement numérique n'est pas un nom.
    if (!nom || /^\d+$/.test(nom) || normaliser(nom) === "total" || normaliser(texte(r[0])) === "total") continue;
    const prenom = cPrenom >= 0 ? formaterPrenom(texte(r[cPrenom])) : "";
    const cp = cCp >= 0 ? codePostal(r[cCp]) : "";
    const ville = cVille >= 0 ? formaterVille(texte(r[cVille])) : "";
    const note = cNote >= 0 && cNote < r.length ? texte(r[cNote]) : "";
    res.push({
      titre: titreDe(texte(r[0] ?? "")),
      nom: formaterNomParticulier(nom),
      prenom: prenom || null,
      adresse: (cAdresse >= 0 ? texte(r[cAdresse]) : "") || null,
      cp_ville: [cp, ville].filter(Boolean).join(" ") || null,
      note: note && !/^\d+$/.test(note) ? note : null,
    });
  }
  return res;
}

/** Toutes les feuilles d'un classeur (`feuilles` : nom → lignes). */
export function lignesDuClasseur(feuilles: Record<string, unknown[][]>): LigneListe[] {
  return Object.values(feuilles).flatMap(lignesDeFeuille);
}
