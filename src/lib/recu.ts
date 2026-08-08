// Génération d'un reçu fiscal par publipostage du modèle .docx (côté navigateur).
// Le modèle est stocké dans le bucket Supabase Storage « modeles » (fichier
// RECU_TEMPLATE_PATH) et contient des champs <<NUM>>, <<TITRE>>, etc.

import PizZip from "pizzip";
import Docxtemplater from "docxtemplater";
import { createClient } from "@/lib/supabase/client";
import { formatEuros, formatDate, todayISO } from "@/lib/format";
import { montantEnLettres } from "@/lib/lettres";

export const RECU_BUCKET = "modeles";
export const RECU_TEMPLATE_PATH = "recu-esej.docx";

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
  /** Texte affiché dans <<DATE>> (ex. période « du … au … » pour un reçu annuel).
      Si absent, on formate date_don. */
  date_affichee?: string;
};

function capitaliser(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Construit le jeu de valeurs injectées dans le modèle. */
export function champsRecu(don: DonPourRecu, dateEdition = todayISO()) {
  const montant = Number(don.montant);
  return {
    // Le modèle affiche déjà « RE_ » en texte fixe → on retire le préfixe.
    NUM: (don.recu_numero ?? "").replace(/^RE_/, ""),
    MODE: don.mode_paiement ?? "",
    DATE: don.date_affichee ?? formatDate(don.date_don),
    SOMME: formatEuros(montant),
    SOMMELETTRES: capitaliser(montantEnLettres(montant)),
    DATE_EDITION: formatDate(dateEdition),
    ADRESSE: don.adresse ?? "",
    CP: don.cp_ville ?? "",
    TITRE: don.est_personne_morale ? "" : don.donateur_titre ?? "",
    NOM: don.est_personne_morale ? "" : don.donateur_nom,
    PRENOM: don.est_personne_morale ? "" : don.donateur_prenom ?? "",
    RAISON: don.est_personne_morale ? don.raison_sociale ?? don.donateur_nom : "",
  };
}

/**
 * Télécharge le modèle, le remplit avec les données du don et déclenche le
 * téléchargement du .docx personnalisé. Lève une erreur explicite si le modèle
 * est absent du bucket.
 */
export async function genererRecuDocx(don: DonPourRecu): Promise<void> {
  const supabase = createClient();
  const { data, error } = await supabase.storage.from(RECU_BUCKET).download(RECU_TEMPLATE_PATH);
  if (error || !data) {
    throw new Error(
      "Modèle de reçu introuvable. Importez-le dans Paramètres → Association (bouton « Modèle de reçu »).",
    );
  }

  const buffer = await data.arrayBuffer();
  const zip = new PizZip(buffer);
  const doc = new Docxtemplater(zip, {
    delimiters: { start: "<<", end: ">>" },
    paragraphLoop: true,
    linebreaks: true,
    nullGetter: () => "",
  });

  doc.render(champsRecu(don));

  const blob = doc.getZip().generate({
    type: "blob",
    mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });

  const nomFichier = `Recu_${don.recu_numero ?? "sans-numero"}_${don.donateur_nom}.docx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
