// Suivi du crédit Claude consommé par Préau : chaque appel à l'API Anthropic (lectures automatiques) est journalisé
// (jetons facturés, coût en $ d'après la table claude_tarifs, coût en € au taux BCE du jour archivé). Côté serveur
// uniquement. Le journal ne doit JAMAIS faire échouer la lecture : toute erreur est seulement écrite dans les logs.
import type { SupabaseClient } from "@supabase/supabase-js";

/** Champ `usage` de la réponse de l'API Messages. */
export type UsageClaude = {
  input_tokens?: number;
  output_tokens?: number;
  cache_creation_input_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation?: { ephemeral_5m_input_tokens?: number; ephemeral_1h_input_tokens?: number };
};

/** Rempli par la fonction de lecture dès que l'API a répondu (même si la réponse est ensuite jugée inexploitable). */
export type SuiviConso = { modele: string; usage: UsageClaude | null };

export type TypeDocument = "facture" | "rib" | "facture_rib" | "cheques" | "caisse" | "ventes" | "autre";

export const nouveauSuivi = (modele: string): SuiviConso => ({ modele, usage: null });

const entier = (n: unknown) => (typeof n === "number" && isFinite(n) && n > 0 ? Math.round(n) : 0);

/** Taux BCE du jour (1 USD = x EUR) via Frankfurter ; null si le service ne répond pas (la base reprend alors le dernier taux connu). */
async function tauxBce(): Promise<{ taux: number; date: string | null } | null> {
  try {
    const rep = await fetch("https://api.frankfurter.dev/v1/latest?base=USD&symbols=EUR", {
      signal: AbortSignal.timeout(4000),
      cache: "no-store",
    });
    if (!rep.ok) return null;
    const j = (await rep.json()) as { date?: string; rates?: { EUR?: number } };
    const t = j.rates?.EUR;
    return typeof t === "number" && t > 0.3 && t < 3 ? { taux: t, date: typeof j.date === "string" ? j.date : null } : null;
  } catch {
    return null;
  }
}

/** Journalise un appel à l'API. Sans `usage` (appel refusé, réseau…) : zéro jeton, en échec. Ne lève jamais. */
export async function journaliserConso(supabase: SupabaseClient, type: TypeDocument, suivi: SuiviConso, succes: boolean): Promise<void> {
  try {
    const u = suivi.usage ?? {};
    const c1h = entier(u.cache_creation?.ephemeral_1h_input_tokens);
    // Écritures en cache : le détail 5 min / 1 h quand l'API le donne, sinon tout au tarif 5 min.
    const c5m = u.cache_creation ? entier(u.cache_creation.ephemeral_5m_input_tokens) : entier(u.cache_creation_input_tokens);
    // Le taux n'est cherché à la BCE qu'au premier appel du jour (ensuite, la base a déjà le taux archivé).
    const { data: connu } = await supabase.rpc("claude_taux_du_jour_connu");
    const taux = connu === true ? null : await tauxBce();
    const { error } = await supabase.rpc("claude_conso_enregistrer", {
      p_type: type,
      p_modele: suivi.modele,
      p_entree: entier(u.input_tokens),
      p_sortie: entier(u.output_tokens),
      p_cache_ecriture: c5m,
      p_cache_ecriture_1h: c1h,
      p_cache_lecture: entier(u.cache_read_input_tokens),
      p_succes: succes && !!suivi.usage,
      p_taux: taux?.taux ?? null,
      p_date_bce: taux?.date ?? null,
    });
    if (error) console.error("conso Claude : journal non enregistré", error.message);
  } catch (e) {
    console.error("conso Claude : journal non enregistré", e instanceof Error ? e.message : e);
  }
}
