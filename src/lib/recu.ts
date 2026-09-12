// Données d'un reçu fiscal. La composition du PDF est dans `recuPdf.ts`.

export type DonPourRecu = {
  recu_numero: string | null;
  donateur_titre: string | null;
  donateur_nom: string;
  donateur_prenom: string | null;
  raison_sociale: string | null;
  est_personne_morale: boolean;
  adresse: string | null;
  cp_ville: string | null;
  montant: number;
  date_don: string;
  mode_paiement: string | null;
  /** Texte de la date du versement (ex. « du … au … » pour un reçu annuel).
      Si absent, on formate date_don. */
  date_affichee?: string;
};

export { genererRecuPdf, construireRecuPdf, nomFichierRecu, numeroCourt } from "@/lib/recuPdf";
