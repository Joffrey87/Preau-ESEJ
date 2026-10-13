// Dépôt de chèques : une remise (photo de plusieurs chèques ou bordereau) et ses chèques,
// rapprochés de la comptabilité.
//
// - La REMISE correspond à UNE opération bancaire : un crédit égal au total des chèques, à
//   quelques jours de la date de remise, avec un libellé de remise (« REM CHQ », « REMISE CHEQUE »).
// - Chaque CHÈQUE correspond à un don (même montant, date proche, nom du donateur dans
//   l'émetteur) ou à l'inscription de scolarité d'une famille (nom de famille dans l'émetteur).
//
// « Évident » = un seul candidat sûr : Préau pose le lien seul (« auto »). Sinon, les candidats
// sont proposés au Trésorier, qui confirme (« manuel »). Même logique que rapprochementDons.

import { joursEcart, normaliser } from "@/lib/reconciliation";

export type MotifCheque = "don" | "frais_scolarite" | "frais_dossier" | "fourniture" | "activite" | "evenement" | "autre";

export const MOTIFS: { v: MotifCheque; l: string }[] = [
  { v: "don", l: "Don" },
  { v: "frais_scolarite", l: "Frais de scolarité" },
  { v: "frais_dossier", l: "Frais de dossier" },
  { v: "fourniture", l: "Fournitures" },
  { v: "activite", l: "Activité" },
  { v: "evenement", l: "Événement" },
  { v: "autre", l: "Autre" },
];

export const libelleMotif = (m: string) => MOTIFS.find((x) => x.v === m)?.l ?? m;

export type Lien = "auto" | "manuel" | null;

export type Remise = {
  id: string;
  date_remise: string;
  photo_path: string | null;
  notes: string | null;
  operation_id: string | null;
  lien_operation: Lien;
  created_at: string;
};

export type Cheque = {
  id: string;
  remise_id: string;
  montant: number;
  emetteur: string;
  date_cheque: string | null;
  motif: MotifCheque;
  don_id: string | null;
  inscription_id: string | null;
  famille_id: string | null;
  activite_id: string | null;
  affectation_id: string | null;
  participations_payees: string[];
  lien: Lien;
};

export const COLONNES_CHEQUE =
  "id, remise_id, montant, emetteur, date_cheque, motif, don_id, inscription_id, famille_id, activite_id, affectation_id, participations_payees, lien";

/** Ce que chaque catégorie met à jour dans le suivi (fait en base, par déclencheur, une fois la remise reliée à son crédit). */
export const SUIVI_MOTIF: Partial<Record<MotifCheque, string>> = {
  frais_scolarite: "Compté dans le suivi des frais de scolarité de la famille",
  frais_dossier: "Compté en frais de dossier dans le suivi de scolarité",
  activite: "Participations non payées des enfants marquées payées",
  fourniture: "Pas de suivi des fournitures : le chèque en garde la trace",
};

export type FamilleCandidate = { id: string; nom: string };
export type ActiviteCandidate = { id: string; titre: string; annee_scolaire: string; date_activite: string | null };
/** Participation non payée, pour proposer l'activité d'une famille. */
export type ParticipationCandidate = { activite_id: string; famille_id: string; montant: number };

export type OpRemise = {
  id: string;
  date_operation: string;
  montant: number;
  libelle: string;
  libelle_origine: string | null;
  parent_id: string | null;
};

/** Don réduit à ce qui sert au rapprochement (nom déjà déchiffré). */
export type DonCandidat = { id: string; montant: number; date_don: string; nom: string; operation_id: string | null };

export type InscriptionCandidate = { id: string; annee_scolaire: string; famille_nom: string };

export const BUCKET_CHEQUES = "cheques";
/** Écart toléré entre la remise et son crédit bancaire (la banque crédite en général sous 1 à 5 jours ouvrés). */
export const JOURS_REMISE = 10;
/** Écart toléré entre la date du chèque et celle du don. */
export const JOURS_DON = 20;

const LIBELLE_REMISE = /\b(rem(ise)?\s*(de\s*)?(chq|cheques?|ch[eè]ques?)|remise)\b/i;

export const estLibelleRemise = (op: Pick<OpRemise, "libelle" | "libelle_origine">) =>
  LIBELLE_REMISE.test(normaliser(op.libelle_origine ?? "")) || LIBELLE_REMISE.test(normaliser(op.libelle ?? ""));

export const totalCheques = (cheques: Pick<Cheque, "montant">[]) =>
  Math.round(cheques.reduce((s, c) => s + Number(c.montant || 0), 0) * 100) / 100;

/**
 * Opérations candidates pour une remise : crédit égal au total, à ±JOURS_REMISE jours, pas encore
 * reliée à une autre remise. Les opérations au libellé de remise passent devant. Évident = une
 * seule candidate, et son libellé est bien celui d'une remise.
 */
export function candidatsRemise(
  remise: Pick<Remise, "date_remise">,
  total: number,
  operations: OpRemise[],
  dejaLiees: Set<string>,
): { candidats: OpRemise[]; evident: boolean } {
  if (total <= 0) return { candidats: [], evident: false };
  const candidats = operations
    .filter(
      (o) =>
        !dejaLiees.has(o.id) &&
        Math.abs(Number(o.montant) - total) < 0.005 &&
        joursEcart(o.date_operation, remise.date_remise) <= JOURS_REMISE,
    )
    .sort(
      (a, b) =>
        Number(estLibelleRemise(b)) - Number(estLibelleRemise(a)) ||
        joursEcart(a.date_operation, remise.date_remise) - joursEcart(b.date_operation, remise.date_remise),
    );
  return { candidats, evident: candidats.length === 1 && estLibelleRemise(candidats[0]) };
}

const PARTICULES = new Set(["de", "du", "des", "d", "le", "la", "l", "et", "mr", "mme", "m", "famille", "ou"]);
const mots = (s: string) => normaliser(s).split(" ").filter((m) => m.length > 1 && !PARTICULES.has(m));

/** Tous les mots significatifs de `nom` figurent dans l'émetteur. */
function nomDansEmetteur(nom: string, emetteur: string): boolean {
  const m = mots(nom);
  if (m.length === 0) return false;
  const e = new Set(mots(emetteur));
  return m.every((x) => e.has(x));
}

/**
 * Dons candidats pour un chèque : même montant, date à ±JOURS_DON jours ; ceux dont le nom figure
 * dans l'émetteur d'abord. Évident = un seul don au bon montant et à la bonne date ET au bon nom.
 */
export function candidatsDon(
  cheque: Pick<Cheque, "montant" | "emetteur" | "date_cheque">,
  dateRemise: string,
  dons: DonCandidat[],
  dejaLies: Set<string>,
): { candidats: DonCandidat[]; evident: boolean } {
  const ref = cheque.date_cheque || dateRemise;
  const memes = dons.filter(
    (d) => !dejaLies.has(d.id) && Math.abs(Number(d.montant) - Number(cheque.montant)) < 0.005 && joursEcart(d.date_don, ref) <= JOURS_DON,
  );
  const nommes = memes.filter((d) => nomDansEmetteur(d.nom, cheque.emetteur));
  const autres = memes.filter((d) => !nommes.includes(d));
  return { candidats: [...nommes, ...autres], evident: nommes.length === 1 };
}

/** Année scolaire (« 2026-2027 ») d'une date : septembre → août. */
export function anneeScolaire(iso: string): string {
  const y = Number(iso.slice(0, 4));
  return Number(iso.slice(5, 7)) >= 9 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
}

/**
 * Inscriptions candidates pour un chèque de scolarité ou de frais de dossier : nom de la famille
 * dans l'émetteur. L'année scolaire de la remise passe devant (les frais de dossier de l'été
 * concernent souvent l'année suivante, d'où les deux années proposées). Évident = une seule
 * famille sur l'année de la remise.
 */
export function candidatsInscription(
  cheque: Pick<Cheque, "emetteur">,
  dateRemise: string,
  inscriptions: InscriptionCandidate[],
): { candidats: InscriptionCandidate[]; evident: boolean } {
  const annee = anneeScolaire(dateRemise);
  const suivante = `${Number(annee.slice(0, 4)) + 1}-${Number(annee.slice(5)) + 1}`;
  const candidats = inscriptions
    .filter((i) => (i.annee_scolaire === annee || i.annee_scolaire === suivante) && nomDansEmetteur(i.famille_nom, cheque.emetteur))
    .sort((a, b) => Number(b.annee_scolaire === annee) - Number(a.annee_scolaire === annee));
  const courantes = candidats.filter((i) => i.annee_scolaire === annee);
  return { candidats, evident: courantes.length === 1 };
}

/** Familles dont le nom figure dans l'émetteur. Évident = une seule. */
export function candidatsFamille(cheque: Pick<Cheque, "emetteur">, familles: FamilleCandidate[]) {
  const candidats = familles.filter((f) => nomDansEmetteur(f.nom, cheque.emetteur));
  return { candidats, evident: candidats.length === 1 };
}

/**
 * Activités candidates pour un chèque « activité » d'une famille : celles où la famille a des
 * participations non payées ; évident = une seule activité dont le reste dû égale le chèque.
 */
export function candidatsActivite(
  cheque: Pick<Cheque, "montant">,
  familleId: string,
  participations: ParticipationCandidate[],
  activites: ActiviteCandidate[],
) {
  const du = new Map<string, number>();
  for (const p of participations) if (p.famille_id === familleId) du.set(p.activite_id, (du.get(p.activite_id) ?? 0) + Number(p.montant));
  const candidats = activites.filter((a) => du.has(a.id));
  const exactes = candidats.filter((a) => Math.abs((du.get(a.id) ?? 0) - Number(cheque.montant)) < 0.005);
  return { candidats: [...exactes, ...candidats.filter((a) => !exactes.includes(a))], evident: exactes.length === 1 };
}
