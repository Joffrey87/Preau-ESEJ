// Crédits Netlify (plan Personal : 1 000 / mois). Les crédits de packs achetés
// ne sont PAS pris en compte dans le pourcentage affiché : on compare toujours
// credits.used au quota mensuel fixe. Côté serveur uniquement.

export const QUOTA_CREDITS_MENSUEL = 1000;

/** Identifiants Préau (surchargeables par variables d'environnement). */
export const NETLIFY_SITE_ID_DEFAUT = "e4ec8ed9-279c-4fce-8654-f00055a17b5a";
export const NETLIFY_ACCOUNT_DEFAUT = "joffrey87";

export type ConsoNetlify = {
  /** Pourcentage du quota mensuel (0–100+ plafonné à l'affichage). */
  pct: number;
  credits_utilises: number;
  quota: number;
  /** Déploiements du site créés depuis le 1er du mois (Europe/Paris). */
  deploiements_mois: number;
  periode: { debut: string; fin: string | null };
};

type CompteCredits = {
  credits?: { included?: number; used?: number };
  current_billing_period?: { start?: string; end?: string } | null;
};

type DeployListe = { id?: string; created_at?: string; state?: string }[];

function tokenNetlify(): string | null {
  // TODO : ajouter NETLIFY_AUTH_TOKEN (Personal Access Token) dans les variables
  // Netlify du site Préau (scopes Functions + Runtime), puis redéployer.
  const t = process.env.NETLIFY_AUTH_TOKEN?.trim() || process.env.NETLIFY_API_TOKEN?.trim();
  return t || null;
}

/** Instant UTC du 1er du mois civil à 00:00 Europe/Paris. */
function debutMoisParis(maintenant = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(maintenant);
  const y = Number(parts.find((p) => p.type === "year")!.value);
  const m = Number(parts.find((p) => p.type === "month")!.value);
  // Approximation stable : midi UTC le 1er, puis on ramène à minuit Paris du même jour civil.
  const midi = new Date(Date.UTC(y, m - 1, 1, 12, 0, 0));
  const jourParis = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(midi);
  const hp = Number(jourParis.find((p) => p.type === "hour")!.value);
  const mp = Number(jourParis.find((p) => p.type === "minute")!.value);
  const sp = Number(jourParis.find((p) => p.type === "second")!.value);
  return new Date(midi.getTime() - ((hp * 3600 + mp * 60 + sp) * 1000));
}

async function apiNetlify<T>(chemin: string, token: string): Promise<T> {
  const rep = await fetch(`https://api.netlify.com/api/v1${chemin}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "User-Agent": "Preau-ESEJ (netlify-credits)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(12_000),
  });
  if (!rep.ok) {
    const corps = await rep.text().catch(() => "");
    throw new Error(`Netlify ${rep.status}${corps ? ` : ${corps.slice(0, 200)}` : ""}`);
  }
  return (await rep.json()) as T;
}

/** Compte les déploiements du site depuis `depuis` (pagination). */
async function compterDeploiements(siteId: string, token: string, depuis: Date): Promise<number> {
  let page = 1;
  let total = 0;
  const lim = depuis.toISOString();
  for (;;) {
    const liste = await apiNetlify<DeployListe>(
      `/sites/${encodeURIComponent(siteId)}/deploys?per_page=100&page=${page}`,
      token,
    );
    if (!Array.isArray(liste) || liste.length === 0) break;
    for (const d of liste) {
      const c = d.created_at;
      if (!c) continue;
      if (c < lim) return total;
      total += 1;
    }
    if (liste.length < 100) break;
    page += 1;
    if (page > 20) break;
  }
  return total;
}

/**
 * Lit la conso Netlify (crédits du compte + nb de déploiements du site ce mois).
 * Renvoie null si le jeton n'est pas configuré.
 */
export async function lireConsoNetlify(): Promise<ConsoNetlify | null> {
  const token = tokenNetlify();
  if (!token) return null;

  const account = process.env.NETLIFY_ACCOUNT_SLUG?.trim() || process.env.NETLIFY_ACCOUNT_ID?.trim() || NETLIFY_ACCOUNT_DEFAUT;
  const siteId = process.env.NETLIFY_SITE_ID?.trim() || NETLIFY_SITE_ID_DEFAUT;

  const compte = await apiNetlify<CompteCredits>(`/accounts/${encodeURIComponent(account)}`, token);
  const utilises = Number(compte.credits?.used ?? 0);
  const quota = QUOTA_CREDITS_MENSUEL;
  const pct = Math.max(0, (utilises / quota) * 100);

  const debut = debutMoisParis();
  const deploiements_mois = await compterDeploiements(siteId, token, debut);

  return {
    pct,
    credits_utilises: utilises,
    quota,
    deploiements_mois,
    periode: {
      debut: debut.toISOString(),
      fin: compte.current_billing_period?.end ?? null,
    },
  };
}
