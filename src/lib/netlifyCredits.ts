// Crédits Netlify (plan Personal + packs) : solde réel via GET /{slug}/billing/credits
// (plan_credits + credit_addons). Le % affiché = crédits déjà utilisés / total alloué
// (mensuel + packs). Côté serveur uniquement.

export const QUOTA_CREDITS_MENSUEL = 1000;

/** Identifiants Préau (surchargeables par variables d'environnement). */
export const NETLIFY_SITE_ID_DEFAUT = "e4ec8ed9-279c-4fce-8654-f00055a17b5a";
export const NETLIFY_ACCOUNT_DEFAUT = "joffrey87";

export type BlocCredits = {
  /** Crédits restants sur ce bloc. */
  restants: number;
  /** Total alloué (mensuel ou pack). */
  total: number;
  /** Crédits déjà consommés sur ce bloc. */
  utilises: number;
  /** Date d'expiration ISO, ou null si pas d'expiration (packs). */
  expire_le: string | null;
};

export type ConsoNetlify = {
  /** Pourcentage consommé sur le total alloué (plan + packs), 0–100+. */
  pct: number;
  /** Crédits restants (plan + packs), ex. 1090.5. */
  credits_restants: number;
  /** Total alloué (plan + packs), ex. 1500. */
  credits_total: number;
  /** Crédits déjà utilisés (plan + packs). */
  credits_utilises: number;
  /** Détail plan mensuel. */
  plan: BlocCredits;
  /** Détail packs / add-ons (agrégé). */
  packs: BlocCredits;
  /** Déploiements du site créés depuis le 1er du mois (Europe/Paris). */
  deploiements_mois: number;
  /** Recharge auto (si l'API compte la fournit). */
  auto_recharge: boolean | null;
  periode: { debut: string; fin: string | null };
};

type CompteCredits = {
  credits?: { included?: number; used?: number };
  auto_topup_enabled?: boolean;
  current_billing_period?: { start?: string; end?: string } | null;
  next_billing_period_start?: string | null;
  current_usage_period_start?: string | null;
  next_usage_period_start?: string | null;
};

type BlocApi = {
  used?: number | string;
  available?: number | string;
  total?: number | string;
  expiry_date?: string | null;
  expires?: string | null;
  blocks?: { balance?: number | string; total?: number | string; expiry_date?: string | null; used?: number | string }[];
};

type BillingCredits = {
  plan_credits?: BlocApi;
  credit_addons?: BlocApi;
};

type DeployListe = { id?: string; created_at?: string; state?: string }[];

function tokenNetlify(): string | null {
  // TODO : ajouter NETLIFY_AUTH_TOKEN (Personal Access Token) dans les variables
  // Netlify du site Préau (scopes Functions + Runtime), puis redéployer.
  const t = process.env.NETLIFY_AUTH_TOKEN?.trim() || process.env.NETLIFY_API_TOKEN?.trim();
  return t || null;
}

const num = (v: unknown, repli = 0) => {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : repli;
};

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
  return new Date(midi.getTime() - (hp * 3600 + mp * 60 + sp) * 1000);
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

function blocDepuisApi(b: BlocApi | undefined, totalDefaut: number): BlocCredits {
  if (!b) return { restants: totalDefaut, total: totalDefaut, utilises: 0, expire_le: null };
  const total = num(b.total, totalDefaut);
  let restants = num(b.available, NaN);
  let utilises = num(b.used, NaN);
  // Certains payloads ne donnent que des blocs.
  if ((!Number.isFinite(restants) || !Number.isFinite(utilises)) && Array.isArray(b.blocks) && b.blocks.length) {
    restants = b.blocks.reduce((s, x) => s + num(x.balance), 0);
    const totBlocs = b.blocks.reduce((s, x) => s + num(x.total, num(x.balance) + num(x.used)), 0);
    utilises = Number.isFinite(utilises) ? utilises : Math.max(0, (totBlocs || total) - restants);
  }
  if (!Number.isFinite(restants)) restants = Math.max(0, total - (Number.isFinite(utilises) ? utilises : 0));
  if (!Number.isFinite(utilises)) utilises = Math.max(0, total - restants);
  const expire_le = b.expiry_date ?? b.expires ?? null;
  return { restants, total, utilises, expire_le: expire_le || null };
}

/**
 * Lit la conso Netlify (crédits plan + packs, nb de déploiements du site ce mois).
 * Renvoie null si le jeton n'est pas configuré.
 */
export async function lireConsoNetlify(): Promise<ConsoNetlify | null> {
  const token = tokenNetlify();
  if (!token) return null;

  const account = process.env.NETLIFY_ACCOUNT_SLUG?.trim() || process.env.NETLIFY_ACCOUNT_ID?.trim() || NETLIFY_ACCOUNT_DEFAUT;
  const siteId = process.env.NETLIFY_SITE_ID?.trim() || NETLIFY_SITE_ID_DEFAUT;

  // Solde réel (plan + packs) — pas capabilities.credits.used, souvent à 0 à tort.
  let plan: BlocCredits;
  let packs: BlocCredits;
  let auto_recharge: boolean | null = null;
  let finPeriode: string | null = null;

  try {
    const billing = await apiNetlify<BillingCredits>(`/${encodeURIComponent(account)}/billing/credits`, token);
    plan = blocDepuisApi(billing.plan_credits, QUOTA_CREDITS_MENSUEL);
    packs = blocDepuisApi(billing.credit_addons, 0);
  } catch {
    // Repli : compte (quota mensuel seul — les packs ne sont pas fiables ici).
    const compte = await apiNetlify<CompteCredits>(`/accounts/${encodeURIComponent(account)}`, token);
    const inclus = num(compte.credits?.included, QUOTA_CREDITS_MENSUEL);
    const utilises = num(compte.credits?.used, 0);
    plan = { restants: Math.max(0, inclus - utilises), total: inclus, utilises, expire_le: null };
    packs = { restants: 0, total: 0, utilises: 0, expire_le: null };
    auto_recharge = typeof compte.auto_topup_enabled === "boolean" ? compte.auto_topup_enabled : null;
    finPeriode = compte.next_usage_period_start ?? compte.next_billing_period_start ?? compte.current_billing_period?.end ?? null;
  }

  // Auto-recharge + fin de période si pas encore lus.
  if (auto_recharge === null || !finPeriode) {
    try {
      const compte = await apiNetlify<CompteCredits>(`/accounts/${encodeURIComponent(account)}`, token);
      if (auto_recharge === null && typeof compte.auto_topup_enabled === "boolean") auto_recharge = compte.auto_topup_enabled;
      if (!finPeriode) {
        finPeriode = compte.next_usage_period_start ?? compte.next_billing_period_start ?? compte.current_billing_period?.end ?? null;
      }
      // Si le plan n'a pas d'expiration et le compte en a une, on l'attache au plan.
      if (!plan.expire_le && finPeriode) plan = { ...plan, expire_le: finPeriode };
    } catch {
      /* optionnel */
    }
  }

  const credits_restants = plan.restants + packs.restants;
  const credits_total = plan.total + packs.total;
  const credits_utilises = plan.utilises + packs.utilises;
  const denom = credits_total > 0 ? credits_total : QUOTA_CREDITS_MENSUEL;
  const pct = Math.max(0, (credits_utilises / denom) * 100);

  const debut = debutMoisParis();
  const deploiements_mois = await compterDeploiements(siteId, token, debut);

  return {
    pct,
    credits_restants,
    credits_total,
    credits_utilises,
    plan,
    packs,
    deploiements_mois,
    auto_recharge,
    periode: {
      debut: debut.toISOString(),
      fin: finPeriode,
    },
  };
}
