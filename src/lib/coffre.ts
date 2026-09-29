// Opérations des coffres de chiffrement (données donateurs, carnet d'adresses).
// Chaque coffre est une ligne de la table `coffre` : id 1 = dons, id 2 = carnet.
// Les deux sont indépendants et ont chacun leur phrase et leur code de secours.
// La phrase secrète / le code de secours ne sont JAMAIS envoyés à la base :
// tout (dérivation, emballage, déballage) se passe dans le navigateur.

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deriveKey,
  genererDEK,
  emballerDEK,
  deballerDEK,
  genererCodeSecours,
  nouveauSel,
  chiffrer,
  verifiePhrase,
  CANARI_CLAIR,
} from "@/lib/crypto";

export type CoffreMeta = {
  sel_phrase: string;
  sel_secours: string;
  dek_phrase: string;
  dek_secours: string;
  canari: string;
};

// Le code de secours est affiché avec des tirets mais dérivé sans (saisie tolérante).
const normaliseCode = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

export const COFFRE_DONS = 1;

export async function chargerMeta(supabase: SupabaseClient, id = COFFRE_DONS): Promise<CoffreMeta | null> {
  const { data } = await supabase.from("coffre").select("*").eq("id", id).maybeSingle();
  return (data as CoffreMeta | null) ?? null;
}

/**
 * Crée le coffre : DEK aléatoire, emballée par la phrase ET par un code de
 * secours généré. Renvoie le code (à afficher UNE fois) et la DEK (déverrouillée).
 */
export async function configurerCoffre(
  supabase: SupabaseClient,
  phrase: string,
  id = COFFRE_DONS,
): Promise<{ code: string; dek: CryptoKey }> {
  const dek = await genererDEK();
  const sel_phrase = nouveauSel();
  const sel_secours = nouveauSel();
  const code = genererCodeSecours();

  const kekPhrase = await deriveKey(phrase, sel_phrase);
  const kekSecours = await deriveKey(normaliseCode(code), sel_secours);
  const dek_phrase = await emballerDEK(kekPhrase, dek);
  const dek_secours = await emballerDEK(kekSecours, dek);
  const canari = await chiffrer(dek, CANARI_CLAIR);

  const { error } = await supabase
    .from("coffre")
    .insert({ id, sel_phrase, sel_secours, dek_phrase, dek_secours, canari });
  if (error) throw new Error("Création du coffre impossible : " + error.message);
  return { code, dek };
}

/** Ouvre le coffre avec la phrase OU le code de secours. Renvoie la DEK ou lève. */
export async function ouvrirCoffre(meta: CoffreMeta, secret: string): Promise<CryptoKey> {
  // 1) tentative « phrase secrète »
  try {
    const kek = await deriveKey(secret, meta.sel_phrase);
    const dek = await deballerDEK(kek, meta.dek_phrase);
    if (await verifiePhrase(dek, meta.canari)) return dek;
  } catch {
    /* essai suivant */
  }
  // 2) tentative « code de secours »
  try {
    const kek = await deriveKey(normaliseCode(secret), meta.sel_secours);
    const dek = await deballerDEK(kek, meta.dek_secours);
    if (await verifiePhrase(dek, meta.canari)) return dek;
  } catch {
    /* rien */
  }
  throw new Error("Phrase secrète ou code de secours incorrect.");
}

/**
 * Change la phrase secrète SANS toucher au code de secours : la même DEK est
 * simplement ré-emballée avec un nouveau sel. Le code de secours déjà remis à
 * l'utilisateur reste donc valable, et aucune donnée chiffrée n'est réécrite.
 * Nécessite un coffre ouvert (DEK en mémoire).
 */
export async function changerPhrase(
  supabase: SupabaseClient,
  dek: CryptoKey,
  nouvellePhrase: string,
  id = COFFRE_DONS,
): Promise<void> {
  const sel_phrase = nouveauSel();
  const kek = await deriveKey(nouvellePhrase, sel_phrase);
  const dek_phrase = await emballerDEK(kek, dek);

  const { error } = await supabase.from("coffre").update({ sel_phrase, dek_phrase }).eq("id", id);
  if (error) throw new Error("Changement de phrase impossible : " + error.message);
}

/**
 * Génère un NOUVEAU code de secours et invalide l'ancien. La phrase secrète
 * n'est pas touchée. Renvoie le code, à afficher une seule fois.
 */
export async function regenererCodeSecours(
  supabase: SupabaseClient,
  dek: CryptoKey,
  id = COFFRE_DONS,
): Promise<string> {
  const code = genererCodeSecours();
  const sel_secours = nouveauSel();
  const kek = await deriveKey(normaliseCode(code), sel_secours);
  const dek_secours = await emballerDEK(kek, dek);

  const { error } = await supabase.from("coffre").update({ sel_secours, dek_secours }).eq("id", id);
  if (error) throw new Error("Régénération du code de secours impossible : " + error.message);
  return code;
}

/**
 * Teste un secret (phrase ou code de secours) SANS rien modifier ni consommer.
 * Sert au bouton « Vérifier mon code de secours » : le vrai risque n'est pas
 * qu'un code fuite, c'est de découvrir trop tard qu'il ne fonctionne plus.
 */
export async function verifierSecret(meta: CoffreMeta, secret: string): Promise<boolean> {
  try {
    await ouvrirCoffre(meta, secret);
    return true;
  } catch {
    return false;
  }
}
