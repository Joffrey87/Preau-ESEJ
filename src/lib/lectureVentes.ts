// Import de ventes (onglet Ventes diverses) : lecture d'une photo / d'un PDF par Claude, ou d'un tableau Excel / CSV
// côté client. Chaque ligne : objet de vente, montant, date (facultative), famille ou personne, mode de paiement.
import { leverErreurApi, verifierFin } from "@/lib/erreurLecture";

import { MODELE_LECTURE } from "@/lib/lectureCaisse";
import type { ModeAttendu } from "@/lib/ventes";

export type LigneVenteLue = {
  objet: string | null;
  montant: number | null;
  date: string | null;
  payeur: string | null;
  mode: ModeAttendu | null;
};

const CONSIGNE = `Tu lis UNE liste de ventes (feuille manuscrite, tableau photographié ou PDF) : pour chaque vente, ce qui a été vendu,
le montant, éventuellement la date, la famille (ou la personne) qui achète, et le mode de paiement.
Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"lignes":[{"objet":"…"|null,"montant":12.50|null,"date":"AAAA-MM-JJ"|null,"payeur":"…"|null,"mode":"liquide"|"cheque"|"virement"|null}]}
Règles :
- une ligne par vente ; si un objet ou une date est écrit en titre de colonne ou de section, reporte-le sur chaque ligne concernée ;
- objet : ce qui est vendu, en quelques mots (ex. « Photo de classe », « Sapin ») ;
- montant : nombre décimal avec point ;
- date au format AAAA-MM-JJ si lisible, sinon null ;
- payeur : nom de famille ou nom de la personne, tel qu'écrit ;
- mode : « liquide » (espèces), « cheque » (chèque), « virement » (virement à venir, IBAN, SumUp, carte) ; null si absent ;
- n'invente rien : omets une ligne illisible plutôt que d'inventer ;
- maximum 150 lignes.`;

const texte = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : x == null ? null : String(x).trim() || null);

export function nombreVente(x: unknown): number | null {
  if (typeof x === "number" && isFinite(x) && x > 0) return Math.round(x * 100) / 100;
  if (typeof x === "string" && x.trim()) {
    const n = Number(x.replace(/[\s€]/g, "").replace(",", "."));
    return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

/** Mode de paiement d'après le texte (« espèces », « chq », « virement à venir », « SumUp »…). */
export function modeVente(x: unknown): ModeAttendu | null {
  const t = (texte(x) ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
  if (!t) return null;
  if (/liquide|espece|cash|monnaie/.test(t)) return "liquide";
  if (/cheque|chq|chq\./.test(t)) return "cheque";
  if (/virement|vir|iban|sumup|carte|cb|a venir/.test(t)) return "virement";
  return null;
}

/** Date AAAA-MM-JJ d'après « JJ/MM/AAAA », « AAAA-MM-JJ », un numéro de série Excel ou un objet Date. */
export function dateVente(x: unknown): string | null {
  if (x instanceof Date && !isNaN(x.getTime())) return x.toISOString().slice(0, 10);
  if (typeof x === "number" && x > 20000 && x < 80000) return new Date(Math.round((x - 25569) * 86400000)).toISOString().slice(0, 10);
  const t = texte(x);
  if (!t) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const m = t.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (!m) return null;
  const an = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${an}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}

export function analyserReponseVentes(t: string): LigneVenteLue[] {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse illisible");
  const j = JSON.parse(m[0]) as { lignes?: unknown };
  if (!Array.isArray(j.lignes)) throw new Error("Pas de lignes");
  return j.lignes
    .map((l) => {
      const r = l as Record<string, unknown>;
      return { objet: texte(r.objet), montant: nombreVente(r.montant), date: dateVente(r.date), payeur: texte(r.payeur), mode: modeVente(r.mode) };
    })
    .filter((l) => l.objet || l.payeur || l.montant != null);
}

const sansAccent = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim();

/** Tableau Excel / CSV (première feuille) : colonnes reconnues d'après leur titre. */
export function lignesDepuisTableau(rangees: unknown[][]): LigneVenteLue[] {
  const iEntete = rangees.findIndex((r) => r.some((c) => /objet|montant|famille|payeur|prix/.test(sansAccent(String(c ?? "")))));
  if (iEntete < 0) throw new Error("Colonnes introuvables : la première ligne doit porter les titres (Objet, Montant, Date, Famille, Mode).");
  const entete = rangees[iEntete].map((c) => sansAccent(String(c ?? "")));
  const col = (re: RegExp) => entete.findIndex((c) => re.test(c));
  const c = {
    objet: col(/objet|article|intitule|produit|vente/),
    montant: col(/montant|prix|somme|total/),
    date: col(/date/),
    payeur: col(/famille|payeur|nom|acheteur|client|personne/),
    mode: col(/mode|paiement|reglement/),
  };
  if (c.montant < 0) throw new Error("Colonne « Montant » introuvable.");
  return rangees
    .slice(iEntete + 1)
    .map((r) => ({
      objet: c.objet >= 0 ? texte(r[c.objet]) : null,
      montant: nombreVente(r[c.montant]),
      date: c.date >= 0 ? dateVente(r[c.date]) : null,
      payeur: c.payeur >= 0 ? texte(r[c.payeur]) : null,
      mode: c.mode >= 0 ? modeVente(r[c.mode]) : null,
    }))
    .filter((l) => l.objet || l.payeur || l.montant != null);
}

export async function lireVentesAvecClaude(cle: string, base64: string, mediaType: string): Promise<LigneVenteLue[]> {
  const source = { type: "base64", media_type: mediaType, data: base64 };
  const bloc = mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source };
  const rep = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cle,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: MODELE_LECTURE,
      max_tokens: 12000,
      // Sonnet 5.5 « réfléchit » par défaut (effort high) et cette réflexion compte dans max_tokens :
      // effort bas pour une simple lecture (plus rapide, la réponse JSON n'est pas tronquée).
      output_config: { effort: "low" },
      messages: [{ role: "user", content: [bloc, { type: "text", text: CONSIGNE }] }],
    }),
  });
  if (!rep.ok) await leverErreurApi(rep);
  const d = (await rep.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string };
  verifierFin(d);
  return analyserReponseVentes((d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
}
