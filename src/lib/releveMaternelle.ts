// Relevé d'appréciations de maternelle (PS, MS, GS) : matières fixées par classe, un niveau et un commentaire par
// matière, une appréciation générale ; par période ou par trimestre. Validé par la Directrice avant d'être visible
// des familles ou imprimable.

export type NiveauAcquis = "acquis" | "en_cours" | "non_acquis";
export type StatutReleve = "brouillon" | "pret" | "valide";
export type MatiereMaternelle = { id: string; classe_id: string; nom: string; ordre: number; actif: boolean };
export type ReleveMaternelle = {
  id: string;
  classe_id: string;
  eleve_id: string;
  annee_scolaire: string;
  periode_id: string | null;
  trimestre: number | null;
  appreciation: string | null;
  statut: StatutReleve;
  valide_le: string | null;
};
export type LigneReleve = { releve_id: string; matiere_id: string; niveau: NiveauAcquis | null; commentaire: string | null };

export const NIVEAUX_ACQUIS: { v: NiveauAcquis; label: string; court: string; classe: string }[] = [
  { v: "acquis", label: "Acquis", court: "A", classe: "border-positive/40 bg-positive/10 text-positive" },
  { v: "en_cours", label: "En cours d'acquisition", court: "EC", classe: "border-gold/50 bg-gold-soft text-gold" },
  { v: "non_acquis", label: "Non acquis", court: "NA", classe: "border-negative/40 bg-negative/10 text-negative" },
];
export const niveauLabel = (n: NiveauAcquis | null | undefined) => NIVEAUX_ACQUIS.find((x) => x.v === n)?.label ?? null;

export const STATUTS_RELEVE: { v: StatutReleve; label: string; classe: string }[] = [
  { v: "brouillon", label: "Brouillon", classe: "bg-surface-2 text-muted" },
  { v: "pret", label: "Prêt", classe: "bg-accent-soft text-accent" },
  { v: "valide", label: "Validé", classe: "bg-positive/10 text-positive" },
];
export const statutReleve = (s: StatutReleve | undefined) => STATUTS_RELEVE.find((x) => x.v === s) ?? STATUTS_RELEVE[0];

export const NIVEAUX_MATERNELLE = ["PS", "MS", "GS"];
/** La classe accueille-t-elle des élèves de maternelle ? */
export const estMaternelle = (niveaux: string[]) => niveaux.some((n) => NIVEAUX_MATERNELLE.includes(n));

export const libelleTrimestre = (t: number) => `${t === 1 ? "1er" : `${t}e`} trimestre`;
