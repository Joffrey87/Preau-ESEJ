// Erreurs du service de lecture automatique : messages clairs pour le crédit épuisé et la surcharge.

export const MSG_CREDIT = "Crédit du service de lecture épuisé : prévenez le Trésorier. Vous pouvez saisir les informations à la main.";
export const MSG_SURCHARGE = "Service de lecture momentanément surchargé, réessayez dans une minute.";

/** Erreur HTTP renvoyée par l'API de lecture (statut, type et message ; jamais la clé ni le fichier). */
export class ErreurApiLecture extends Error {
  constructor(public statut: number, public type: string, message: string) {
    super(`API ${statut} ${type ? `${type} ` : ""}${message}`.slice(0, 300));
  }
}

/** Lit le corps d'erreur de l'API et lève une ErreurApiLecture. */
export async function leverErreurApi(rep: Response): Promise<never> {
  const j = (await rep.json().catch(() => null)) as { error?: { type?: string; message?: string } } | null;
  throw new ErreurApiLecture(rep.status, j?.error?.type ?? "", (j?.error?.message ?? "").slice(0, 200));
}

/** Classe l'erreur : crédit épuisé, surcharge, ou autre (null). */
export function messageErreurLecture(e: unknown): { erreur: string; statut: number } | null {
  if (!(e instanceof ErreurApiLecture)) return null;
  const t = `${e.type} ${e.message}`.toLowerCase();
  if (e.statut === 402 || /billing|credit balance|insufficient|crédit/.test(t)) return { erreur: MSG_CREDIT, statut: 402 };
  if (e.statut === 429 || e.statut === 529 || /rate_limit|overloaded/.test(t)) return { erreur: MSG_SURCHARGE, statut: 503 };
  return null;
}

/** Réponse coupée (plafond de jetons atteint, souvent par la réflexion) ou sans texte : erreur explicite. */
export function verifierFin(d: { content?: { type: string; text?: string }[]; stop_reason?: string }) {
  const texte = (d.content ?? []).some((b) => b.type === "text" && b.text?.trim());
  if (d.stop_reason === "max_tokens") throw new Error(`Réponse tronquée (max_tokens atteint${texte ? "" : ", aucun texte"})`);
  if (!texte) throw new Error(`Réponse sans texte (stop_reason ${d.stop_reason ?? "?"})`);
}
