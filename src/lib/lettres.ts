// Conversion d'un montant en euros en toutes lettres (français).
// Utilisé pour les reçus fiscaux CERFA 11580 (mention obligatoire).

const UNITES = [
  "zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize",
  "dix-sept", "dix-huit", "dix-neuf",
];

const DIZAINES = [
  "", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante",
  "quatre-vingt", "quatre-vingt",
];

// `multiplicateur` = true quand le groupe précède « mille/million/milliard » :
// dans ce cas « vingt » et « cent » restent invariables (quatre-vingt mille,
// deux cent mille), le pluriel ne s'applique qu'en fin de nombre.
function centaineEnLettres(n: number, multiplicateur = false): string {
  // 0 <= n < 1000
  if (n === 0) return "";
  if (n < 20) return UNITES[n];

  if (n < 100) {
    const d = Math.floor(n / 10);
    const u = n % 10;
    // 70-79 et 90-99 : base soixante / quatre-vingt + 10..19
    if (d === 7 || d === 9) {
      const base = DIZAINES[d];
      const reste = UNITES[10 + u];
      // soixante et onze / quatre-vingt-onze (pas de « et » pour 91)
      if (d === 7 && u === 1) return "soixante et onze";
      return `${base}-${reste}`;
    }
    const mot = DIZAINES[d];
    if (u === 0) {
      // quatre-vingts prend un s, sauf s'il multiplie mille/million
      return d === 8 && !multiplicateur ? "quatre-vingts" : mot;
    }
    if (u === 1 && d !== 8) return `${mot} et un`;
    return `${mot}-${UNITES[u]}`;
  }

  // 100..999
  const c = Math.floor(n / 100);
  const reste = n % 100;
  const cent = c === 1 ? "cent" : `${UNITES[c]} cent`;
  if (reste === 0) {
    // « deux cents » (pluriel) sauf « cent » seul, ou si multiplicateur
    return c > 1 && !multiplicateur ? `${UNITES[c]} cents` : cent;
  }
  return `${cent} ${centaineEnLettres(reste, multiplicateur)}`;
}

function entierEnLettres(n: number): string {
  if (n === 0) return "zéro";

  const milliards = Math.floor(n / 1_000_000_000);
  const millions = Math.floor((n % 1_000_000_000) / 1_000_000);
  const milliers = Math.floor((n % 1_000_000) / 1000);
  const reste = n % 1000;

  const parts: string[] = [];

  if (milliards > 0) {
    parts.push(`${centaineEnLettres(milliards, true)} milliard${milliards > 1 ? "s" : ""}`);
  }
  if (millions > 0) {
    parts.push(`${centaineEnLettres(millions, true)} million${millions > 1 ? "s" : ""}`);
  }
  if (milliers > 0) {
    // « mille » invariable, et « mille » seul (pas « un mille »)
    parts.push(milliers === 1 ? "mille" : `${centaineEnLettres(milliers, true)} mille`);
  }
  if (reste > 0) {
    parts.push(centaineEnLettres(reste));
  }

  return parts.join(" ").trim();
}

/**
 * Retourne un montant en toutes lettres, ex. 1 234,50 →
 * « mille deux cent trente-quatre euros et cinquante centimes ».
 */
export function montantEnLettres(montant: number): string {
  const arrondi = Math.round(montant * 100) / 100;
  const euros = Math.floor(arrondi);
  const centimes = Math.round((arrondi - euros) * 100);

  const eurosMot = `${entierEnLettres(euros)} euro${euros > 1 ? "s" : ""}`;
  if (centimes === 0) return eurosMot;

  const centimesMot = `${entierEnLettres(centimes)} centime${centimes > 1 ? "s" : ""}`;
  return `${eurosMot} et ${centimesMot}`;
}
