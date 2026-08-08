// Module « En cours » : ce qui n'est pas soldé — à encaisser (créances) et à
// régler (dettes), plus les échéances récurrentes connues à venir.

export type Sens = "a_payer" | "a_recevoir";
export type Statut = "en_attente" | "regle" | "annule";
export type Recurrence = "mensuel" | "trimestriel" | "annuel";

export type Echeance = {
  id: string;
  sens: Sens;
  libelle: string;
  tiers: string | null;
  montant: number;
  date_echeance: string | null;
  statut: Statut;
  recurrence: Recurrence | null;
  categorie_id: string | null;
  contact_id: string | null;
  notes: string | null;
  regle_le: string | null;
};

// --- Impayés de scolarité (créances calculées depuis les inscriptions) ---

const MOIS_COLS = [
  "m_sept", "m_oct", "m_nov", "m_dec", "m_jan",
  "m_fev", "m_mars", "m_avr", "m_mai", "m_juin",
] as const;

export type InscriptionRow = {
  famille_nom: string;
  annee_scolaire: string;
  emails: string | null;
  montant_mensuel: number | null;
  avance: number | null;
} & Partial<Record<(typeof MOIS_COLS)[number], number | null>>;

export type ImpayeScolarite = {
  famille_nom: string;
  annee_scolaire: string;
  emails: string | null;
  du: number;
  regle: number;
  reste: number;
};

/**
 * Reste à percevoir par famille : dû = mensuel × 10 (sept→juin),
 * réglé = avance + Σ des 10 mois. On ne retient que reste > 0.
 */
export function impayesScolarite(inscriptions: InscriptionRow[]): ImpayeScolarite[] {
  const res: ImpayeScolarite[] = [];
  for (const i of inscriptions) {
    const mensuel = Number(i.montant_mensuel) || 0;
    if (mensuel <= 0) continue; // familles au mensuel non renseigné : ignorées
    const du = mensuel * 10;
    const paye = MOIS_COLS.reduce((s, c) => s + (Number(i[c]) || 0), 0);
    const regle = (Number(i.avance) || 0) + paye;
    const reste = Math.round((du - regle) * 100) / 100;
    if (reste > 0.005) {
      res.push({ famille_nom: i.famille_nom, annee_scolaire: i.annee_scolaire, emails: i.emails, du, regle, reste });
    }
  }
  return res.sort((a, b) => b.reste - a.reste);
}

// --- Échéances récurrentes : prochaine occurrence ---

const pad = (n: number) => String(n).padStart(2, "0");
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Prochaine occurrence d'une échéance récurrente à partir de sa date d'ancrage :
 * on avance d'un pas (mois/trimestre/an) tant que la date est < aujourd'hui.
 * Renvoie l'ancrage tel quel si pas de récurrence.
 */
export function prochaineOccurrence(
  ancreISO: string,
  recurrence: Recurrence | null,
  todayISO: string,
): string {
  if (!recurrence) return ancreISO;
  const [ay, am, ad] = ancreISO.split("-").map(Number);
  const d = new Date(ay, am - 1, ad);
  const [ty, tm, td] = todayISO.split("-").map(Number);
  const today = new Date(ty, tm - 1, td);
  const pasMois = recurrence === "mensuel" ? 1 : recurrence === "trimestriel" ? 3 : 12;
  let garde = 0;
  while (d < today && garde++ < 600) {
    d.setMonth(d.getMonth() + pasMois);
  }
  return iso(d);
}

/** Nombre de jours (signé) entre deux dates ISO : cible − aujourd'hui. */
export function joursRestants(cibleISO: string, todayISO: string): number {
  const [cy, cm, cd] = cibleISO.split("-").map(Number);
  const [ty, tm, td] = todayISO.split("-").map(Number);
  return Math.round((Date.UTC(cy, cm - 1, cd) - Date.UTC(ty, tm - 1, td)) / 86400000);
}

export const SENS_LABEL: Record<Sens, string> = {
  a_payer: "À régler",
  a_recevoir: "À encaisser",
};

export const RECURRENCE_LABEL: Record<Recurrence, string> = {
  mensuel: "Mensuel",
  trimestriel: "Trimestriel",
  annuel: "Annuel",
};
