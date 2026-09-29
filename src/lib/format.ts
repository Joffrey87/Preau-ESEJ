export function formatEuros(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(n ?? 0);
}

/**
 * Montant sans les centimes quand ils sont nuls : « 4 300 € » plutôt que
 * « 4 300,00 € ». Les centimes réels restent affichés.
 */
export function formatEurosCourt(n: number): string {
  const v = n ?? 0;
  const entier = Math.abs(v % 1) < 0.005;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: entier ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(v);
}

export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

/** Date du jour (AAAA-MM-JJ) à l'heure de Paris, quel que soit le fuseau du serveur. */
export function todayISO(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris" }).format(date);
}
