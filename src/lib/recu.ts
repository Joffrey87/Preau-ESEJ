// Données d'un reçu fiscal. La composition du PDF est dans `recuPdf.ts`.

import type { Versement } from "@/lib/recuVersements";

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
  /** Dons couverts par le reçu (détail porté sur le reçu). Absent : le seul don. */
  versements?: Versement[];
  /** Date d'édition du reçu (ISO), celle de son numéro. Absent : aujourd'hui. */
  date_edition?: string;
};

export { genererRecuPdf, construireRecuPdf, nomFichierRecu, numeroCourt } from "@/lib/recuPdf";

/** Date d'édition portée par le numéro : « RE_000234_20260928 » → « 2026-09-28 ». */
export function dateEditionDuNumero(recuNumero: string | null): string | null {
  const m = (recuNumero ?? "").match(/_(\d{4})(\d{2})(\d{2})$/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}
