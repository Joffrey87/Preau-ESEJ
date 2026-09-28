// Modèle du reçu fiscal : ce qui, sur le PDF, appartient à l'association et
// non au don — signataires, adresse de l'école, contact donateurs, signatures.
//
// Une ligne unique en base (`modele_recu`), les signatures dans le bucket privé
// « modeles ». À défaut, on retombe sur les valeurs et images livrées avec
// l'application (celles du modèle ESEJ).

import type { SupabaseClient } from "@supabase/supabase-js";

export const MODELES_BUCKET = "modeles";

export type ModeleRecuRow = {
  president_nom: string | null;
  tresorier_nom: string | null;
  adresse_rue: string | null;
  adresse_cp_ville: string | null;
  courriel_contact: string | null;
  signature_president_path: string | null;
  signature_tresorier_path: string | null;
};

/** Valeurs prêtes pour la composition du PDF. */
export type ModeleRecu = {
  presidentNom: string;
  tresorierNom: string;
  adresseRue: string;
  adresseCpVille: string;
  courrielContact: string;
  /** Images des signatures (bucket privé) ; null → le reçu s'imprime sans. */
  signaturePresident: ArrayBuffer | null;
  signatureTresorier: ArrayBuffer | null;
};

export const MODELE_DEFAUT: ModeleRecu = {
  presidentNom: "Jean-François ANTONA",
  tresorierNom: "Joffrey Lenoble",
  adresseRue: "6 rue du Colonel Charbonneaux",
  adresseCpVille: "51100 Reims",
  courrielContact: "ecole@saint-enfant-jesus.fr",
  signaturePresident: null,
  signatureTresorier: null,
};

async function telecharger(supabase: SupabaseClient, path: string | null): Promise<ArrayBuffer | null> {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(MODELES_BUCKET).download(path);
  if (error || !data) {
    console.error("Signature introuvable dans le bucket :", path, error?.message);
    return null;
  }
  return data.arrayBuffer();
}

/** Lit le modèle en base et télécharge les signatures. Jamais bloquant : à défaut, le modèle par défaut. */
export async function chargerModeleRecu(supabase: SupabaseClient): Promise<ModeleRecu> {
  const { data, error } = await supabase.from("modele_recu").select("*").eq("id", 1).maybeSingle();
  if (error) {
    console.error("Lecture du modèle de reçu impossible :", error.message);
    return MODELE_DEFAUT;
  }
  const row = (data ?? null) as ModeleRecuRow | null;
  if (!row) return MODELE_DEFAUT;

  const [signaturePresident, signatureTresorier] = await Promise.all([
    telecharger(supabase, row.signature_president_path),
    telecharger(supabase, row.signature_tresorier_path),
  ]);

  const ou = (v: string | null, defaut: string) => (v && v.trim() ? v.trim() : defaut);
  return {
    presidentNom: ou(row.president_nom, MODELE_DEFAUT.presidentNom),
    tresorierNom: ou(row.tresorier_nom, MODELE_DEFAUT.tresorierNom),
    adresseRue: ou(row.adresse_rue, MODELE_DEFAUT.adresseRue),
    adresseCpVille: ou(row.adresse_cp_ville, MODELE_DEFAUT.adresseCpVille),
    courrielContact: ou(row.courriel_contact, MODELE_DEFAUT.courrielContact),
    signaturePresident,
    signatureTresorier,
  };
}

// Mémoire de session : le modèle ne change qu'à travers la boîte d'édition,
// qui l'invalide.
let memo: Promise<ModeleRecu> | null = null;

export function modeleRecuEnCache(supabase: SupabaseClient): Promise<ModeleRecu> {
  if (!memo) {
    memo = chargerModeleRecu(supabase).catch((e) => {
      memo = null;
      throw e;
    });
  }
  return memo;
}

export function invaliderModeleRecu(): void {
  memo = null;
}
