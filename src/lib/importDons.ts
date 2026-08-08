// Lecture d'un classeur .xlsx de dons + mappage souple des colonnes vers les
// champs d'un don. Le fichier est lu DANS LE NAVIGATEUR ; le PII est chiffré
// avant tout envoi en base (voir ImportDons.tsx).

import * as XLSX from "xlsx";

export type LigneBrute = Record<string, unknown>;

/** Lit la 1re feuille : 1re ligne = entêtes. Valeurs BRUTES (dates = n° de série
 *  Excel, montants = nombres) pour éviter toute ambiguïté de format. */
export function lireClasseurDons(buffer: ArrayBuffer): { headers: string[]; lignes: LigneBrute[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], lignes: [] };
  const lignes = XLSX.utils.sheet_to_json<LigneBrute>(ws, { defval: "", raw: true });
  const headers = lignes.length ? Object.keys(lignes[0]) : [];
  return { headers, lignes };
}

// Champs cibles d'un don + mots-clés pour deviner la colonne source.
export type ChampDon = {
  key: string;
  label: string;
  pii?: boolean; // champ personnel (chiffré)
  kw: string[];
};

export const CHAMPS_DON: ChampDon[] = [
  { key: "date_don", label: "Date du don", kw: ["date", "encaiss", "versement"] },
  { key: "montant", label: "Montant", kw: ["montant", "somme"] },
  { key: "donateur_titre", label: "Titre", pii: true, kw: ["titre", "civilit"] },
  { key: "donateur_nom", label: "Nom", pii: true, kw: ["nom"] },
  { key: "donateur_prenom", label: "Prénom", pii: true, kw: ["prenom", "prénom"] },
  { key: "raison_sociale", label: "Raison sociale", pii: true, kw: ["raison", "societe", "société", "organisme"] },
  { key: "adresse", label: "Adresse", pii: true, kw: ["adresse", "rue"] },
  { key: "cp_ville", label: "CP et ville", pii: true, kw: ["cp", "ville", "code postal", "commune"] },
  { key: "courriel", label: "Courriel", pii: true, kw: ["courriel", "mail", "email", "e-mail"] },
  { key: "categorie_donateur", label: "Catégorie donateur", kw: ["categorie", "catégorie", "type"] },
  { key: "mode_paiement", label: "Mode de paiement", kw: ["mode", "paiement", "reglement", "règlement"] },
  { key: "recu_numero", label: "N° de reçu", kw: ["recu", "reçu", "numero", "n°"] },
  { key: "recu_etat", label: "État du reçu", kw: ["etat", "état", "statut", "envoye", "envoyé"] },
  { key: "origine", label: "Origine", kw: ["origine", "apporteur", "amene", "amené"] },
  { key: "observations", label: "Observations", kw: ["observ", "note", "remarque", "commentaire"] },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const pad = (n: number) => String(n).padStart(2, "0");

/** Devine, pour chaque champ, la colonne source la plus probable (ou ""). */
export function devineMapping(headers: string[]): Record<string, string> {
  const map: Record<string, string> = {};
  const pris = new Set<string>();
  for (const champ of CHAMPS_DON) {
    const trouve = headers.find((h) => {
      if (pris.has(h)) return false;
      const nh = norm(h);
      return champ.kw.some((k) => nh.includes(norm(k)));
    });
    map[champ.key] = trouve ?? "";
    if (trouve) pris.add(trouve);
  }
  return map;
}

/** Valeur → texte affichable (pour les champs personnels). */
export function toTexte(v: unknown): string {
  return String(v ?? "").trim();
}

/**
 * Valeur → ISO YYYY-MM-DD. Gère le n° de série Excel (via SSF, sans décalage de
 * fuseau), un objet Date, et le texte (jj/mm/aaaa FR, mm/jj/aaaa si le mois > 12,
 * ou ISO). "" si vide/illisible.
 */
export function toISODate(v: unknown): string {
  if (typeof v === "number") {
    const d = XLSX.SSF.parse_date_code(v);
    return d && d.y ? `${d.y}-${pad(d.m)}-${pad(d.d)}` : "";
  }
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const a = Number(m[1]);
    const b = Number(m[2]);
    const y = m[3].length === 2 ? "20" + m[3] : m[3];
    // Si l'un des deux > 12, il ne peut être que le jour → on lève l'ambiguïté.
    let jour = a;
    let mois = b;
    if (b > 12 && a <= 12) {
      jour = b;
      mois = a;
    }
    return `${y}-${pad(mois)}-${pad(jour)}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

/** Valeur → montant positif (nombre Excel ou texte « 1 234,56 »), ou null. */
export function toMontant(v: unknown): number | null {
  if (typeof v === "number") return v !== 0 ? Math.abs(v) : null;
  const s = String(v ?? "")
    .replace(/\s/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}
