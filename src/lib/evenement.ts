// Profil Événement : types partagés (événements, membres, carnet restreint, factures fournisseurs).
// Les factures fournisseurs sont prévues pour être reprises côté Trésorier (même table, mêmes composants).

export type MembreEvenement = {
  id: string;
  libelle: string;
  prenom: string;
  nom: string | null;
  courriel: string | null;
  famille: { nom: string; membre_recherche: string | null } | null;
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
};

export type StatutFacture = "pas_importee" | "recue_a_payer" | "payee";
export const STATUTS_FACTURE: { v: StatutFacture; l: string; cls: string }[] = [
  { v: "pas_importee", l: "Pas importée", cls: "bg-surface-2 text-muted" },
  { v: "recue_a_payer", l: "Reçue, à payer", cls: "bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-300" },
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
};

export const BUCKET_FACTURES = "factures-fournisseurs";

export const nomContact = (c: Pick<ContactEvenement, "nom" | "prenom" | "raison_sociale">) =>
  c.raison_sociale || [c.prenom, c.nom].filter(Boolean).join(" ");

/** Recettes d'un événement : caisse après moins caisse avant (null tant que l'une manque). */
export const recettes = (e: EvenementCaisse) =>
  e.caisse_avant == null || e.caisse_apres == null ? null : Number(e.caisse_apres) - Number(e.caisse_avant);

export const champ = "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent";
export const bouton = "rounded-lg bg-accent px-4 py-2 text-sm font-medium text-accent-fg hover:opacity-90 disabled:opacity-50";
export const nombre = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));
