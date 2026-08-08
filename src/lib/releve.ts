// Analyse d'un export bancaire Excel (Crédit Mutuel « Situation de votre compte »).
// Feuille type : en-tête Date | Valeur | Libellé | Débit | Crédit | Solde | Dev,
// Débit en négatif, Crédit en positif. On repère l'en-tête puis on lit les lignes.

import * as XLSX from "xlsx";

export type LigneReleve = {
  date: string; // ISO YYYY-MM-DD
  libelle: string;
  montant: number; // positif
  type: "recette" | "depense";
};

const norm = (s: unknown) =>
  String(s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

const pad = (n: number) => String(n).padStart(2, "0");

function toISO(v: unknown): string | null {
  // Numéro de série Excel → date sans décalage de fuseau (via XLSX.SSF).
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    if (d && d.y) return `${d.y}-${pad(d.m)}-${pad(d.d)}`;
    return null;
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = String(v ?? "").trim();
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const [, dd, mm, yy] = m;
    const year = yy.length === 2 ? "20" + yy : yy;
    return `${year}-${pad(Number(mm))}-${pad(Number(dd))}`;
  }
  return null;
}

function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return v;
  const s = String(v)
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Analyse un classeur (ArrayBuffer) et retourne toutes les opérations trouvées. */
export function parseReleve(buffer: ArrayBuffer): LigneReleve[] {
  // Pas de cellDates : on lit le numéro de série brut (converti sans fuseau dans toISO).
  const wb = XLSX.read(buffer, { type: "array" });
  const lignes: LigneReleve[] = [];

  for (const sheetName of wb.SheetNames) {
    const ws = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, blankrows: false });

    // Repérer la ligne d'en-tête (contient « libellé » + « débit » ou « crédit »).
    let headerIdx = -1;
    let cDate = -1, cLib = -1, cDeb = -1, cCred = -1;
    for (let i = 0; i < rows.length; i++) {
      const cells = Array.from(rows[i] ?? [], norm);
      const has = (kw: string) => cells.findIndex((c) => c.includes(kw));
      const iLib = has("libell");
      const iDeb = has("debit");
      const iCred = has("credit");
      if (iLib !== -1 && (iDeb !== -1 || iCred !== -1)) {
        headerIdx = i;
        cLib = iLib;
        cDeb = iDeb;
        cCred = iCred;
        cDate = has("date");
        break;
      }
    }
    if (headerIdx === -1) continue;

    for (let i = headerIdx + 1; i < rows.length; i++) {
      const r = rows[i] ?? [];
      const libelle = String(r[cLib] ?? "").trim();
      const iso = toISO(r[cDate]);
      const deb = cDeb !== -1 ? toNum(r[cDeb]) : null;
      const cred = cCred !== -1 ? toNum(r[cCred]) : null;
      if (!iso || !libelle) continue;
      // Montant : débit (négatif) → dépense ; crédit (positif) → recette.
      let montant: number | null = null;
      let type: "recette" | "depense" | null = null;
      if (deb !== null && deb !== 0) {
        montant = Math.abs(deb);
        type = "depense";
      } else if (cred !== null && cred !== 0) {
        montant = Math.abs(cred);
        type = "recette";
      }
      if (montant === null || type === null) continue;
      lignes.push({ date: iso, libelle, montant, type });
    }
  }
  return lignes;
}

/** Devine le mode de paiement d'après le libellé bancaire. */
export function devineMode(libelle: string): string | null {
  const s = norm(libelle);
  if (s.startsWith("vir") || s.includes("virement")) return "virement";
  if (s.startsWith("prlv") || s.includes("prelevement") || s.includes("sepa")) return "prelevement";
  if (s.includes("cheque") || s.startsWith("chq") || s.includes("rem chq")) return "cheque";
  if (s.includes("carte") || s.includes("cb ")) return "carte";
  if (s.includes("vrst") || s.includes("espece") || s.includes("remise")) return "especes";
  return null;
}

type Cat = { id: string; nom: string; type: "recette" | "depense" };

// Mots-clés (libellé bancaire) → nom de catégorie. Déterministe, à titre de suggestion.
const REGLES: { kw: RegExp; cat: string }[] = [
  { kw: /\bdon\b|barroux|abbaye/i, cat: "Don" },
  { kw: /scolarit/i, cat: "Paiement frais de scolarité" },
  { kw: /sumup|vrst|vente|marche de noel|sapin|porte-couteaux/i, cat: "Ventes diverses au profit de l'école" },
  { kw: /free|internet|hautdebit/i, cat: "Frais internet : Abonnement FREE" },
  { kw: /urssaf/i, cat: "Frais de personnel : URSSAF" },
  { kw: /b2v/i, cat: "Frais B2V protection sociale" },
  { kw: /helium|mutuelle/i, cat: "Frais de mutuelle HELIUM" },
  { kw: /fides|assuranc/i, cat: "Frais d'assurances FIDES" },
  { kw: /fidem/i, cat: "Frais de gestion FIDEM" },
  { kw: /salaire/i, cat: "Frais de personnel : Salaires" },
  { kw: /dgfip|prelevement a la source|pas /i, cat: "Frais de personnel : Prélèvement à la source" },
  { kw: /loyer|logement|immobilier|s\.c\.i|sci /i, cat: "Frais de logement" },
  { kw: /f comm|f frais|commission|frais prlv|cotis|agios|frais bancaire/i, cat: "Frais bancaires" },
];

/** Suggère un categorie_id d'après le libellé et le type. Renvoie "" si rien. */
export function suggereCategorie(libelle: string, type: "recette" | "depense", cats: Cat[]): string {
  const dispo = cats.filter((c) => c.type === type);
  for (const r of REGLES) {
    if (r.kw.test(libelle)) {
      const c = dispo.find((x) => x.nom === r.cat);
      if (c) return c.id;
    }
  }
  return "";
}

/** Clé de dédoublonnage : date + montant + type (+ début du libellé). */
export function cleDedup(date: string, montant: number, type: string, libelle: string): string {
  return `${date}|${montant.toFixed(2)}|${type}|${norm(libelle).slice(0, 18)}`;
}

/** Clé « marchand » d'un libellé bancaire : mots signifiants, sans chiffres ni réfs. */
export function libelleKey(libelle: string): string {
  return norm(libelle)
    .replace(/\d+/g, " ")
    .replace(/[^a-z ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 4)
    .join(" ")
    .trim();
}

type OpHist = { libelle: string; categorie_id: string | null };

/**
 * Apprend la correspondance intitulé → catégorie depuis les opérations déjà
 * classées : pour chaque clé-libellé, retient la catégorie la plus fréquente.
 */
export function construireHistorique(ops: OpHist[]): Map<string, string> {
  const compte = new Map<string, Map<string, number>>();
  for (const o of ops) {
    if (!o.categorie_id) continue;
    const k = libelleKey(o.libelle);
    if (!k) continue;
    const m = compte.get(k) ?? new Map<string, number>();
    m.set(o.categorie_id, (m.get(o.categorie_id) ?? 0) + 1);
    compte.set(k, m);
  }
  const res = new Map<string, string>();
  for (const [k, m] of compte) {
    let best = "";
    let n = -1;
    for (const [cat, c] of m) if (c > n) [best, n] = [cat, c];
    if (best) res.set(k, best);
  }
  return res;
}

/** Catégorie suggérée : d'abord l'historique (intitulé déjà classé), sinon les mots-clés. */
export function suggereCategorieAvecHistorique(
  libelle: string,
  type: "recette" | "depense",
  cats: Cat[],
  historique: Map<string, string>,
): string {
  const h = historique.get(libelleKey(libelle));
  if (h && cats.some((c) => c.id === h && c.type === type)) return h;
  return suggereCategorie(libelle, type, cats);
}
