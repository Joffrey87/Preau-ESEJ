// Chiffrement des données sensibles (donateurs) CÔTÉ NAVIGATEUR.
// AES-GCM 256 bits, clé dérivée d'une phrase secrète (PBKDF2) que SEUL
// l'utilisateur connaît — jamais stockée en base, dans le code, ni ailleurs.
// La base ne contient que du chiffré : une fuite (ou l'assistant) n'y voit rien.

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function unb64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Sel aléatoire (non secret) à stocker à côté du coffre pour la dérivation. */
export function nouveauSel(): string {
  return b64(crypto.getRandomValues(new Uint8Array(16)));
}

// Web Crypto attend un BufferSource (backed par ArrayBuffer) ; on caste pour
// contourner le typage générique strict des TypedArray (TS 5.7).
const bs = (u: Uint8Array): BufferSource => u as unknown as BufferSource;

/** Dérive la clé AES-GCM depuis la phrase secrète + le sel (PBKDF2, 200k tours). */
export async function deriveKey(phrase: string, selB64: string): Promise<CryptoKey> {
  const baseKey = await crypto.subtle.importKey("raw", bs(enc.encode(phrase)), "PBKDF2", false, ["deriveKey"]);
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: bs(unb64(selB64)), iterations: 200_000, hash: "SHA-256" },
    baseKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

/** Chiffre une chaîne → base64(iv || ciphertext). IV aléatoire à chaque appel. */
export async function chiffrer(key: CryptoKey, texte: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(enc.encode(texte))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv, 0);
  out.set(ct, iv.length);
  return b64(out);
}

/** Déchiffre base64(iv || ciphertext) → chaîne. Lève si la clé est mauvaise. */
export async function dechiffrer(key: CryptoKey, blob: string): Promise<string> {
  const data = unb64(blob);
  const iv = data.slice(0, 12);
  const ct = data.slice(12);
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: bs(iv) }, key, bs(ct));
  return dec.decode(pt);
}

export async function chiffrerObjet(key: CryptoKey, obj: unknown): Promise<string> {
  return chiffrer(key, JSON.stringify(obj));
}
export async function dechiffrerObjet<T>(key: CryptoKey, blob: string): Promise<T> {
  return JSON.parse(await dechiffrer(key, blob)) as T;
}

// « Canari » : témoin connu chiffré à la création du coffre. Pour vérifier
// qu'une phrase secrète saisie est la bonne (déchiffrer → doit valoir la valeur).
export const CANARI_CLAIR = "PREAU_COFFRE_OK";

/** Vérifie une phrase secrète : true si elle déchiffre correctement le canari. */
export async function verifiePhrase(key: CryptoKey, canariChiffre: string): Promise<boolean> {
  try {
    return (await dechiffrer(key, canariChiffre)) === CANARI_CLAIR;
  } catch {
    return false;
  }
}
