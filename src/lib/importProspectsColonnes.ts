// Import de prospects depuis Excel ou CSV : lecture des feuilles, détection des en-têtes et correspondance
// des colonnes avec les champs d'un prospect, puis conversion en lignes (LigneListe).

import { normaliser } from "@/lib/reconciliation";
import { formaterNomParticulier } from "@/lib/nomPropre";
import { codePostal, formaterPrenom, formaterVille, texte, titreDe, type LigneListe } from "@/lib/listeProspects";
import { SEGMENT_LABEL, TYPES_PROSPECT, type Segment } from "@/lib/pipeline";

export type Champ = "" | "civilite" | "nom" | "prenom" | "adresse" | "cp" | "ville" | "cp_ville" | "email" | "telephone" | "relation" | "segment" | "notes";

export const CHAMPS: { key: Exclude<Champ, "">; label: string }[] = [
  { key: "civilite", label: "Civilité" },
  { key: "nom", label: "Nom" },
  { key: "prenom", label: "Prénom" },
  { key: "adresse", label: "Adresse" },
  { key: "cp", label: "Code postal" },
  { key: "ville", label: "Ville" },
  { key: "cp_ville", label: "CP + ville" },
  { key: "email", label: "Email" },
  { key: "telephone", label: "Téléphone" },
  { key: "relation", label: "Relation (qui l'a amené)" },
  { key: "segment", label: "Type" },
  { key: "notes", label: "Notes" },
];

/** En-têtes reconnus (normalisés : sans accents, minuscules). */
const SYNONYMES: Record<Exclude<Champ, "">, string[]> = {
  civilite: ["civilite", "titre", "civ", "m mme", "genre"],
  nom: ["nom", "nom de famille", "last name", "lastname", "raison sociale", "organisme", "societe", "nom ou raison sociale"],
  prenom: ["prenom", "prenoms", "first name", "firstname"],
  adresse: ["adresse", "adresse 1", "adresse1", "rue", "voie", "address"],
  cp: ["cp", "code postal", "codepostal", "zip", "postal"],
  ville: ["ville", "commune", "localite", "city"],
  cp_ville: ["cp ville", "code postal ville", "cp et ville"],
  email: ["email", "e mail", "mail", "courriel", "adresse email", "adresse mail"],
  telephone: ["telephone", "tel", "portable", "mobile", "phone", "gsm", "tel portable"],
  relation: ["relation", "apporte par", "amene par", "introduit par", "parrain", "contact de", "recommande par"],
  segment: ["segment", "type", "categorie", "type de contact", "type de donateur", "particulier entreprise"],
  notes: ["notes", "note", "commentaire", "commentaires", "remarque", "remarques", "observations", "fonction"],
};

export function detecterChamp(entete: string): Champ {
  const e = normaliser(entete);
  if (!e) return "";
  for (const [k, syn] of Object.entries(SYNONYMES)) if (syn.includes(e)) return k as Champ;
  for (const [k, syn] of Object.entries(SYNONYMES)) if (syn.some((s) => s.length >= 4 && e.includes(s))) return k as Champ;
  return "";
}

export type Tableau = {
  /** En-têtes (libellé affiché) dans l'ordre des colonnes. */
  entetes: string[];
  /** Correspondance proposée pour chaque colonne. */
  champs: Champ[];
  /** Lignes de données (cellules en texte), avec le numéro de ligne d'origine pour les messages. */
  lignes: { feuille: string; numero: number; cellules: string[] }[];
};

/**
 * Feuilles → un tableau unique. Sur chaque feuille, l'en-tête est la première ligne qui contient au moins un en-tête
 * reconnu (sinon la première ligne non vide). Les colonnes sont réunies par libellé d'en-tête. Format « Listing » du comité :
 * une première colonne sans titre = civilité, une colonne sans titre juste après la ville = notes.
 */
export function tableauDesFeuilles(feuilles: Record<string, unknown[][]>): Tableau {
  const entetes: string[] = [];
  const champs: Champ[] = [];
  const lignes: Tableau["lignes"] = [];
  const indexDe = (libelle: string, champ: Champ) => {
    let i = entetes.indexOf(libelle);
    if (i < 0) {
      i = entetes.push(libelle) - 1;
      champs.push(champ);
    }
    return i;
  };
  for (const [nomFeuille, rows] of Object.entries(feuilles)) {
    const nonVide = (r: unknown[]) => r.some((c) => texte(c));
    let idx = rows.findIndex((r) => r.filter((c) => detecterChamp(texte(c))).length >= 2);
    if (idx < 0) idx = rows.findIndex(nonVide);
    if (idx < 0) continue;
    const brut = rows[idx].map((c) => texte(c));
    const detectes = brut.map(detecterChamp);
    const iVille = detectes.indexOf("ville");
    const cols = brut.map((h, c) => {
      if (h) return indexDe(h, detectes[c]);
      if (c === 0) return indexDe("(colonne A, sans titre)", "civilite");
      if (iVille >= 0 && c === iVille + 1) return indexDe("(après la ville, sans titre)", "notes");
      return indexDe(`(colonne ${c + 1}, sans titre)`, "");
    });
    rows.slice(idx + 1).forEach((r, k) => {
      if (!nonVide(r)) return;
      const cellules: string[] = [];
      r.forEach((v, c) => {
        if (c < cols.length) cellules[cols[c]] = texte(v);
      });
      lignes.push({ feuille: nomFeuille, numero: idx + k + 2, cellules });
    });
  }
  // Un même champ ne peut être choisi qu'une fois : les colonnes suivantes repassent en « ignorée ».
  const vus = new Set<Champ>();
  for (let i = 0; i < champs.length; i++) {
    if (!champs[i]) continue;
    if (vus.has(champs[i]) && champs[i] !== "notes") champs[i] = "";
    else vus.add(champs[i]);
  }
  return { entetes, champs, lignes };
}

/** Ligne importée : champs de la liste + coordonnées, relation et segment (null = segment par défaut de l'import). */
export type LigneImport = LigneListe & {
  /** Nom tel que dans le fichier (organismes : pas de mise en forme « Nom de famille »). */
  nomBrut: string;
  email: string | null;
  telephone: string | null;
  relation: string | null;
  segment: Segment | null;
};

export type LigneConvertie = { ligne: LigneImport; source: string; avertissement?: string } | { invalide: string; source: string };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Segment d'après le texte du fichier : libellé ou code du segment, ou mots usuels (« société », « asso »…). */
export function segmentDe(v: string): Segment | null {
  const t = normaliser(v);
  if (!t) return null;
  for (const { key, label } of TYPES_PROSPECT) if (t === normaliser(label) || t === normaliser(key)) return key;
  for (const [k, l] of Object.entries(SEGMENT_LABEL)) if (t === normaliser(l) || t === normaliser(k)) return k as Segment;
  if (/(entreprise|societe|sarl|sas|sa |eurl|commerce|pme|pro\b|professionnel)/.test(t + " ")) return "pro";
  if (/(fondation|fonds|association|asso)/.test(t)) return "association";
  if (/(paroisse|diocese|congregation|eglise|catho|communaute|monastere|abbaye)/.test(t)) return "communaute";
  if (/(grand donateur|mecene)/.test(t)) return "particulier";
  if (/(particulier|famille|personne|individu)/.test(t)) return "particulier";
  return null;
}

/** Conversion d'une ligne selon la correspondance des colonnes ; ligne invalide si le nom manque ou n'en est pas un. Un email mal formé est écarté, la ligne gardée. */
export function convertir(t: Tableau, champs: Champ[]): LigneConvertie[] {
  const col = (k: Champ) => champs.map((c, i) => (c === k ? i : -1)).filter((i) => i >= 0);
  const val = (cel: string[], k: Champ) => col(k).map((i) => cel[i] ?? "").filter(Boolean).join(" ").trim();
  return t.lignes.map(({ feuille, numero, cellules }) => {
    const source = `${feuille} · ligne ${numero}`;
    const nom = val(cellules, "nom");
    if (!nom) return { invalide: "nom manquant", source };
    if (/^\d+$/.test(nom) || normaliser(nom) === "total" || normaliser(cellules[0] ?? "") === "total") return { invalide: "ligne de total", source };
    const emailBrut = val(cellules, "email");
    const emailOk = !emailBrut || EMAIL.test(emailBrut);
    const cpVille = val(cellules, "cp_ville") || [codePostal(val(cellules, "cp")), formaterVille(val(cellules, "ville"))].filter(Boolean).join(" ");
    const notes = col("notes").map((i) => cellules[i] ?? "").filter(Boolean).join(" · ");
    const prenom = formaterPrenom(val(cellules, "prenom"));
    return {
      source,
      ...(emailOk ? {} : { avertissement: `email mal formé écarté (« ${emailBrut} »)` }),
      ligne: {
        titre: titreDe(val(cellules, "civilite")),
        nom: formaterNomParticulier(nom),
        nomBrut: nom,
        prenom: prenom || null,
        adresse: val(cellules, "adresse") || null,
        cp_ville: cpVille || null,
        note: notes && !/^\d+$/.test(notes) ? notes : null,
        email: emailOk && emailBrut ? emailBrut.toLowerCase() : null,
        telephone: val(cellules, "telephone") || null,
        relation: val(cellules, "relation") || null,
        segment: segmentDe(val(cellules, "segment")),
      },
    };
  });
}

/** Lecture d'un fichier .xlsx / .xls / .csv en feuilles (CSV : séparateur « ; » ou « , » détecté). */
export async function lireFichier(f: File): Promise<Record<string, unknown[][]>> {
  const XLSX = await import("xlsx");
  const csv = /\.csv$/i.test(f.name) || f.type === "text/csv";
  const wb = csv
    ? XLSX.read(await lireTexte(f), { type: "string", raw: true })
    : XLSX.read(await f.arrayBuffer(), { type: "array" });
  const feuilles: Record<string, unknown[][]> = {};
  for (const nom of wb.SheetNames) {
    feuilles[nom] = XLSX.utils.sheet_to_json(wb.Sheets[nom], { header: 1, defval: "", raw: !csv }) as unknown[][];
  }
  return feuilles;
}

/** CSV en UTF-8 (avec ou sans BOM), sinon Windows-1252 (exports Excel français). */
async function lireTexte(f: File): Promise<string> {
  const buf = await f.arrayBuffer();
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(buf);
  }
}
