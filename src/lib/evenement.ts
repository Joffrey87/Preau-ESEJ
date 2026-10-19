// Profil Événementiel : types partagés (événements, membres, carnet restreint, factures fournisseurs).
// Les factures fournisseurs sont prévues pour être reprises côté Trésorier (même table, mêmes composants).

export type MembreEvenement = {
  id: string;
  libelle: string;
  prenom: string;
  nom: string | null;
  courriel: string | null;
};

export type EvenementCaisse = {
  id: string;
  nom: string;
  date: string;
  responsable_id: string | null;
  caisse_avant: number | null;
  caisse_apres: number | null;
};

/** Contact du carnet restreint (vue `contacts_evenement` : jamais d'IBAN, seulement « RIB renseigné »). */
export type ContactEvenement = {
  id: string;
  est_personne_morale: boolean;
  nom: string;
  prenom: string | null;
  raison_sociale: string | null;
  categories: string[];
  courriel: string | null;
  telephone: string | null;
  adresse: string | null;
  cp_ville: string | null;
  notes: string | null;
  rib_renseigne: boolean;
  /** IBAN masqué (« FR76 •••• 1234 ») : l'IBAN complet n'est lisible que par le Trésorier (fournisseur_iban). */
  iban_masque?: string | null;
  bic?: string | null;
};

export type StatutFacture = "pas_importee" | "recue_a_payer" | "payee";
export const STATUTS_FACTURE: { v: StatutFacture; l: string; cls: string }[] = [
  { v: "pas_importee", l: "À payer", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
  { v: "recue_a_payer", l: "À payer", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
  { v: "payee", l: "Payée", cls: "bg-positive/10 text-positive" },
];
export const libelleStatut = (s: string) => STATUTS_FACTURE.find((x) => x.v === s);

export type FactureFournisseur = {
  id: string;
  fournisseur_id: string;
  montant: number;
  date: string;
  numero: string | null;
  evenement_id: string | null;
  fichier: string | null;
  statut: StatutFacture;
  operation_id: string | null;
  notes: string | null;
  libelle: string | null;
  categorie_id: string | null;
  doute: boolean;
  domaine?: "ecole" | "evenement";
  mode_paiement?: ModePaiementFacture | null;
  paye_le?: string | null;
  paye_par?: string | null;
  caisse_mouvement_id?: string | null;
  fournisseur_a_verifier?: boolean;
  fournisseur_lu?: string | null;
};

export type ModePaiementFacture = "virement" | "cheque" | "especes" | "carte" | "prelevement";
export const MODES_PAIEMENT_FACTURE: { v: ModePaiementFacture; l: string }[] = [
  { v: "virement", l: "Virement" },
  { v: "cheque", l: "Chèque" },
  { v: "especes", l: "Espèces" },
  { v: "carte", l: "Carte bancaire (SumUp)" },
  { v: "prelevement", l: "Prélèvement" },
];

export const BUCKET_FACTURES = "factures-fournisseurs";

export const nomContact = (c: Pick<ContactEvenement, "nom" | "prenom" | "raison_sociale">) =>
  c.raison_sociale || [c.prenom, c.nom].filter(Boolean).join(" ");

/** Recettes d'un événement : caisse après moins caisse avant (null tant que l'une manque). */
export const recettes = (e: EvenementCaisse) =>
  e.caisse_avant == null || e.caisse_apres == null ? null : Number(e.caisse_apres) - Number(e.caisse_avant);

export const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
export const bouton = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
export const nombre = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

export type ModeRecette = "cheque" | "carte" | "autre";
export const MODES_RECETTE: { v: ModeRecette; l: string }[] = [
  { v: "cheque", l: "Chèque" },
  { v: "carte", l: "Carte" },
  { v: "autre", l: "Autre" },
];
export type RecetteEvenement = {
  id: string;
  evenement_id: string;
  mode: ModeRecette;
  montant: number;
  date: string;
  libelle: string | null;
  operation_id: string | null;
};
export type OperationCandidate = { id: string; date_operation: string; libelle: string; libelle_origine: string | null; montant: number };

/** Opérations bancaires proposées pour valider une recette : même montant, date proche, libellé selon le mode. */
export function candidatsRecette(r: RecetteEvenement, ops: OperationCandidate[], dejaLiees: Set<string>, jours = 30) {
  const ecart = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 86400000;
  const motif = r.mode === "carte" ? /sumup/i : r.mode === "cheque" ? /rem\w*\s*ch(q|e)/i : null;
  return ops
    .filter((o) => !dejaLiees.has(o.id) && Number(o.montant) > 0 && ecart(o.date_operation, r.date) <= jours)
    .map((o) => {
      const txt = `${o.libelle} ${o.libelle_origine ?? ""}`;
      const score = (Number(o.montant) === Number(r.montant) ? 2 : 0) + (motif && motif.test(txt) ? 1 : 0);
      return { o, score, e: ecart(o.date_operation, r.date) };
    })
    .filter((x) => x.score > 0 && (!motif || x.score >= 1))
    .sort((a, b) => b.score - a.score || a.e - b.e)
    .slice(0, 5)
    .map((x) => x.o);
}
