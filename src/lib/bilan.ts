// Calcul des bornes de période pour le bilan financier (mois / trimestre / année).
// L'« année » = exercice comptable de l'ARIL (1er sept → 31 août).

export type Periode = "mois" | "trimestre" | "annee";

export const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

const pad = (n: number) => String(n).padStart(2, "0");
const dernierJour = (y: number, m: number) => new Date(y, m, 0).getDate(); // m = 1..12

/** 1er jour du mois précédent (défaut pour un bilan de CA). */
export function moisPrecedentISO(base = new Date()): string {
  const dt = new Date(base.getFullYear(), base.getMonth() - 1, 1);
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-01`;
}

export type Bornes = { debut: string; fin: string; libelle: string };

/** Bornes [debut, fin] (ISO) et libellé lisible pour la période choisie. */
export function bornesPeriode(periode: Periode, refISO: string): Bornes {
  const [Y, M] = refISO.split("-").map(Number);
  if (periode === "mois") {
    return {
      debut: `${Y}-${pad(M)}-01`,
      fin: `${Y}-${pad(M)}-${pad(dernierJour(Y, M))}`,
      libelle: `${MOIS_FR[M - 1]} ${Y}`,
    };
  }
  if (periode === "trimestre") {
    const q = Math.floor((M - 1) / 3); // 0..3
    const m1 = q * 3 + 1;
    const m3 = q * 3 + 3;
    return {
      debut: `${Y}-${pad(m1)}-01`,
      fin: `${Y}-${pad(m3)}-${pad(dernierJour(Y, m3))}`,
      libelle: `${q + 1}ᵉ trimestre ${Y} (${MOIS_FR[m1 - 1]}–${MOIS_FR[m3 - 1]})`,
    };
  }
  // Année = exercice scolaire (sept→août) contenant la date de référence.
  const yStart = M >= 9 ? Y : Y - 1;
  return {
    debut: `${yStart}-09-01`,
    fin: `${yStart + 1}-08-31`,
    libelle: `Exercice ${yStart}-${yStart + 1}`,
  };
}

/** Fraction d'année civile écoulée au {fin} (pour extrapoler une estimation annuelle). */
export function fractionAnneeEcoulee(finISO: string): number {
  const [Y, M, D] = finISO.split("-").map(Number);
  const debutAnnee = Date.UTC(Y, 0, 1);
  const jour = Date.UTC(Y, M - 1, D);
  const finAnnee = Date.UTC(Y + 1, 0, 1);
  return Math.min(1, Math.max(0.01, (jour - debutAnnee) / (finAnnee - debutAnnee)));
}

export function formatPct(x: number | null): string {
  return x === null || !Number.isFinite(x) ? "—" : `${Math.round(x)} %`;
}
