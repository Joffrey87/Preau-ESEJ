// Opérations du coffre de chiffrement des données donateurs.
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

export async function chargerMeta(supabase: SupabaseClient): Promise<CoffreMeta | null> {
  const { data } = await supabase.from("coffre").select("*").eq("id", 1).maybeSingle();
  return (data as CoffreMeta | null) ?? null;
}

/**
 * Crée le coffre : DEK aléatoire, emballée par la phrase ET par un code de
 * secours généré. Renvoie le code (à afficher UNE fois) et la DEK (déverrouillée).
 */
export async function configurerCoffre(
  supabase: SupabaseClient,
  phrase: string,
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
    .insert({ id: 1, sel_phrase, sel_secours, dek_phrase, dek_secours, canari });
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
