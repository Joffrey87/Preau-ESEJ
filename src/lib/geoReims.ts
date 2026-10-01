/**
 * Position et distance à Reims d'après le code postal : centre de la commune
 * quand le code postal figure dans `communesProches.json` (communes à moins de
 * ~200 km, données publiques intégrées à Préau — aucune adresse n'est envoyée à
 * l'extérieur), sinon préfecture du département (deux premiers chiffres).
 */

import COMMUNES from "./communesProches.json";

export const REIMS = { lat: 49.2583, lon: 4.0317 };
const communes = COMMUNES as unknown as Record<string, [number, number]>;

/** Rayon retenu pour le filtre « Alentours Reims ». */
export const RAYON_ALENTOURS_KM = 200;

// Préfectures des départements situés à moins de ~300 km de Reims ; au-delà, hors rayon.
const PREFECTURES: Record<string, [number, number]> = {
  "02": [49.564, 3.62], "08": [49.773, 4.72], "10": [48.297, 4.074], "51": [48.957, 4.363],
  "52": [48.111, 5.139], "55": [48.772, 5.16], "54": [48.692, 6.184], "57": [49.119, 6.176],
  "60": [49.43, 2.081], "77": [48.54, 2.66], "75": [48.857, 2.352], "78": [48.804, 2.13],
  "91": [48.629, 2.441], "92": [48.892, 2.207], "93": [48.909, 2.44], "94": [48.79, 2.455],
  "95": [49.05, 2.1], "80": [49.894, 2.296], "59": [50.629, 3.057], "62": [50.291, 2.778],
  "89": [47.798, 3.567], "45": [47.903, 1.909], "88": [48.173, 6.45], "67": [48.573, 7.752],
  "21": [47.322, 5.041], "27": [49.024, 1.151], "28": [48.446, 1.489], "76": [49.443, 1.099],
  "70": [47.62, 6.155], "58": [46.99, 3.159], "68": [47.75, 7.336], "14": [49.183, -0.371],
  "61": [48.432, 0.091], "41": [47.586, 1.336], "18": [47.081, 2.399], "25": [47.238, 6.024],
  "39": [46.674, 5.555], "71": [46.307, 4.828],
};

function km(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const r = (x: number) => (x * Math.PI) / 180;
  const dLat = r(b.lat - a.lat);
  const dLon = r(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

export const codePostal = (cpVille: string | null | undefined) => (cpVille ?? "").match(/\b(\d{5})\b/)?.[1] ?? null;

/** Coordonnées du code postal : commune si connue, sinon préfecture ; `precis` = commune. */
export function coordonneesCp(cp: string): { lat: number; lon: number; precis: boolean } | null {
  const c = communes[cp];
  if (c) return { lat: c[0], lon: c[1], precis: true };
  const pr = PREFECTURES[cp.slice(0, 2)];
  return pr ? { lat: pr[0], lon: pr[1], precis: false } : null;
}

/** Distance à Reims en km (arrondie), ou null si le code postal est absent ou inconnu. */
export function distanceReims(cpVille: string | null | undefined): number | null {
  const cp = codePostal(cpVille);
  if (!cp) return null;
  const c = communes[cp];
  if (c) return Math.round(km(REIMS, { lat: c[0], lon: c[1] }));
  const pref = PREFECTURES[cp.slice(0, 2)];
  if (!pref) return cp.startsWith("97") || cp.startsWith("20") ? 9999 : 999;
  // Dans la Marne, on compte depuis Reims même (Reims, Tinqueux, Bétheny… : ≈ 0 km).
  if (cp.startsWith("51")) return cp.startsWith("511") ? 0 : Math.round(km(REIMS, { lat: pref[0], lon: pref[1] }));
  return Math.round(km(REIMS, { lat: pref[0], lon: pref[1] }));
}

export function auxAlentoursDeReims(cpVille: string | null | undefined): boolean {
  const d = distanceReims(cpVille);
  return d != null && d <= RAYON_ALENTOURS_KM;
}
