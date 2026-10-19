// Lecture d'une feuille de caisse (photo prioritaire) ou d'un tableau Excel importé côté client.
import { leverErreurApi, verifierFin } from "@/lib/erreurLecture";
import type { SuiviConso, UsageClaude } from "@/lib/consoClaude";

export const MODELE_LECTURE = "claude-sonnet-5-5";

export type LigneCaisseLue = {
  date: string | null;
  libelle: string | null;
  montant: number | null;
};

const CONSIGNE = `Tu lis UNE feuille de papier manuscrite (ou un relevé de caisse) listant des mouvements de liquide.
Réponds UNIQUEMENT par un objet JSON, sans texte autour :
{"lignes":[{"date":"AAAA-MM-JJ"|null,"libelle":"…"|null,"montant":12.50|null}]}
Règles :
- chaque ligne = un mouvement (entrée ou sortie de caisse) ;
- date au format AAAA-MM-JJ si lisible, sinon null ;
- libelle : ce qui est écrit (nom, motif) en quelques mots ;
- montant : nombre décimal avec point ; positif pour une entrée (reçu), négatif pour une sortie (dépensé / remis) ; si le sens n'est pas clair, mets le montant positif et laisse le libelle indiquer le sens ;
- n'invente rien : omets une ligne illisible plutôt que d'inventer ;
- maximum 80 lignes.`;

const texte = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);
function nombre(x: unknown): number | null {
  if (typeof x === "number" && isFinite(x) && x !== 0) return Math.round(x * 100) / 100;
  if (typeof x === "string" && x.trim()) {
    const n = Number(x.replace(/\s/g, "").replace(",", "."));
    return isFinite(n) && n !== 0 ? Math.round(n * 100) / 100 : null;
  }
  return null;
}

export function analyserReponseCaisse(t: string): LigneCaisseLue[] {
  const m = t.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("Réponse illisible");
  const j = JSON.parse(m[0]) as { lignes?: unknown };
  if (!Array.isArray(j.lignes)) throw new Error("Pas de lignes");
  return j.lignes
    .map((l) => {
      const r = l as Record<string, unknown>;
      const d = texte(r.date);
      return {
        date: d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null,
        libelle: texte(r.libelle),
        montant: nombre(r.montant),
      };
    })
    .filter((l) => l.libelle || l.montant != null);
}

export async function lireCaisseAvecClaude(cle: string, base64: string, mediaType: string, suivi?: SuiviConso): Promise<LigneCaisseLue[]> {
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
      max_tokens: 8000,
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
  return analyserReponseCaisse((d.content ?? []).filter((b) => b.type === "text").map((b) => b.text).join(""));
}
