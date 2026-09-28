// Détail des versements porté sur un reçu fiscal.
//
// Règle (trésorier, 28/09/2026) : un reçu qui couvre plusieurs dons les
// énumère, avec le total. Les dons réguliers (même montant, même mode, au
// moins trois dans l'année — typiquement un virement mensuel) sont
// synthétisés en une ligne : « 12 dons de 50,00 € (janvier à décembre 2025) ».

import { formatEuros, formatDate } from "@/lib/format";

export type Versement = { date: string; montant: number; mode: string | null };
export type LigneVersement = { libelle: string; montant: number };

const MOIS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Seuil à partir duquel des dons identiques sont synthétisés. */
const SEUIL_REGULIER = 3;

const modeLisible = (m: string | null) => {
  const t = (m ?? "").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : "";
};

/** « janvier à décembre 2025 », ou « mars 2025 » pour un seul mois. */
function periode(dates: string[]): string {
  const [d1, d2] = [dates[0], dates[dates.length - 1]];
  const m1 = MOIS[Number(d1.slice(5, 7)) - 1];
  const m2 = MOIS[Number(d2.slice(5, 7)) - 1];
  const a1 = d1.slice(0, 4);
  const a2 = d2.slice(0, 4);
  if (d1.slice(0, 7) === d2.slice(0, 7)) return `${m1} ${a1}`;
  return a1 === a2 ? `${m1} à ${m2} ${a2}` : `${m1} ${a1} à ${m2} ${a2}`;
}

/** Lignes du détail, dans l'ordre chronologique. */
export function syntheseVersements(versements: Versement[]): LigneVersement[] {
  const tries = [...versements].sort((a, b) => a.date.localeCompare(b.date));
  const groupes = new Map<string, Versement[]>();
  for (const v of tries) {
    const cle = `${Number(v.montant).toFixed(2)}|${modeLisible(v.mode).toLowerCase()}`;
    (groupes.get(cle) ?? groupes.set(cle, []).get(cle)!).push(v);
  }
  const lignes: (LigneVersement & { tri: string })[] = [];
  for (const g of groupes.values()) {
    const mode = modeLisible(g[0].mode);
    if (g.length >= SEUIL_REGULIER) {
      lignes.push({
        tri: g[0].date,
        libelle: `${g.length} dons de ${formatEuros(Number(g[0].montant))} (${periode(g.map((v) => v.date))})${mode ? ` — ${mode}` : ""}`,
        montant: g.reduce((s, v) => s + Number(v.montant), 0),
      });
    } else {
      for (const v of g) {
        lignes.push({
          tri: v.date,
          libelle: `Don du ${formatDate(v.date)}${mode ? ` — ${mode}` : ""}`,
          montant: Number(v.montant),
        });
      }
    }
  }
  return lignes.sort((a, b) => a.tri.localeCompare(b.tri)).map(({ libelle, montant }) => ({ libelle, montant }));
}
