// Lecture automatique des chèques / bordereaux par Claude (vision). Utilisé côté serveur uniquement.
import { leverErreurApi, verifierFin } from "@/lib/erreurLecture";
import type { SuiviConso, UsageClaude } from "@/lib/consoClaude";

export const MODELE_LECTURE = "claude-sonnet-5-5";

export type ChequeLu = { montant: number | null; emetteur: string | null; date: string | null };
export type ResultatLecture = { type: "cheques" | "bordereau"; cheques: ChequeLu[]; total_bordereau: number | null };

export const CONSIGNE = `Tu lis une photo de chèques bancaires français ou d'un bordereau de remise de chèques.
Réponds UNIQUEMENT par un objet JSON, sans texte autour, de la forme :
{"type":"cheques"|"bordereau","cheques":[{"montant":123.45,"emetteur":"NOM Prénom","date":"AAAA-MM-JJ"}],"total_bordereau":123.45|null}
Règles :
- un élément par chèque visible ; pour un bordereau, une ligne par chèque listé ;
- montant en euros, nombre décimal (point), privilégie le montant en chiffres ;
- emetteur : nom et prénom du titulaire du compte (pas la banque) ; null si illisible ;
- date du chèque au format AAAA-MM-JJ, null si absente ou illisible ;
- total_bordereau : le total imprimé ou écrit sur le bordereau s'il est visible, sinon null ;
- n'invente rien : mets null pour ce que tu ne lis pas.`;

function nombre(x: unknown): number | null {
  if (typeof x === "number" && isFinite(x)) return Math.round(x * 100) / 100;
  if (typeof x === "string") {
    const n = Number(x.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) && x.trim() ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

export function analyserReponse(texte: string): ResultatLecture {
  const m = texte.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse illisible");
  const j = JSON.parse(m[0]) as Record<string, unknown>;
  const liste = Array.isArray(j.cheques) ? (j.cheques as Record<string, unknown>[]) : [];
  return {
    type: j.type === "bordereau" ? "bordereau" : "cheques",
    cheques: liste.map((c) => ({
      montant: nombre(c.montant),
      emetteur: typeof c.emetteur === "string" && c.emetteur.trim() ? c.emetteur.trim() : null,
      date: typeof c.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(c.date) ? c.date : null,
    })),
    total_bordereau: nombre(j.total_bordereau),
  };
}

/** Appel à l'API Anthropic. La clé n'est jamais journalisée ni renvoyée. */
export async function lireAvecClaude(cle: string, base64: string, mediaType: string, suivi?: SuiviConso): Promise<ResultatLecture> {
  const source = { type: "base64", media_type: mediaType, data: base64 };
  const bloc = mediaType === "application/pdf" ? { type: "document", source } : { type: "image", source };
  const rep = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": cle,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
      // Nécessaire si la clé n'est pas rattachée à un espace de travail Anthropic.
      ...(process.env.ANTHROPIC_WORKSPACE_ID ? { "anthropic-workspace-id": process.env.ANTHROPIC_WORKSPACE_ID } : {}),
    },
    body: JSON.stringify({
      model: MODELE_LECTURE,
      max_tokens: 6000,
      // Sonnet 5.5 « réfléchit » par défaut (effort high) et cette réflexion compte dans max_tokens :
      // effort bas pour une simple lecture (plus rapide, la réponse JSON n'est pas tronquée).
      output_config: { effort: "low" },
      messages: [{ role: "user", content: [bloc, { type: "text", text: CONSIGNE }] }],
    }),
  });
  if (!rep.ok) await leverErreurApi(rep);
  const d = (await rep.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string; usage?: UsageClaude };
  // Jetons facturés (même si la réponse est ensuite inexploitable) : pour le suivi du crédit.
  if (suivi) suivi.usage = d.usage ?? null;
  verifierFin(d);
  const texte = (d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join("");
  return analyserReponse(texte);
}
