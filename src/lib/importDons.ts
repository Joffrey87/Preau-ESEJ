// Lecture d'un classeur .xlsx de dons + mappage souple des colonnes vers les
// champs d'un don. Le fichier est lu DANS LE NAVIGATEUR ; le PII est chiffré
// avant tout envoi en base (voir ImportDons.tsx).

import * as XLSX from "xlsx";

export type LigneBrute = Record<string, string>;

/** Lit la 1re feuille : 1re ligne = entêtes, puis les lignes en objets. */
export function lireClasseurDons(buffer: ArrayBuffer): { headers: string[]; lignes: LigneBrute[] } {
  const wb = XLSX.read(buffer, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return { headers: [], lignes: [] };
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
  const headers = rows.length ? Object.keys(rows[0]) : [];
  const lignes = rows.map((r) => {
    const o: LigneBrute = {};
    for (const h of headers) o[h] = String(r[h] ?? "").trim();
    return o;
  });
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
    if (trouve) {
      map[champ.key] = trouve;
      pris.add(trouve);
    } else {
      map[champ.key] = "";
    }
  }
  return map;
}

/** Date FR (jj/mm/aaaa, jj-mm-aaaa) ou ISO → ISO YYYY-MM-DD. "" si vide/illisible. */
export function toISODate(v: string): string {
  const s = v.trim();
  if (!s) return "";
  const m = s.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const an = y.length === 2 ? "20" + y : y;
    return `${an}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return "";
}

/** Montant « 1 234,56 » / « 1234.56 » → nombre, ou null. */
export function toMontant(v: string): number | null {
  const s = v.replace(/\s/g, "").replace(/[^\d,.-]/g, "").replace(",", ".");
  const n = Number(s);
  return Number.isFinite(n) && n !== 0 ? Math.abs(n) : null;
}
