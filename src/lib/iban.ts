/** IBAN sans espaces, en majuscules. */
export const ibanNu = (s: string) => s.replace(/[\s-]/g, "").toUpperCase();
/** IBAN groupé par 4 caractères. */
export const ibanFormate = (s: string) => ibanNu(s).replace(/(.{4})/g, "$1 ").trim();
/** Clé de contrôle IBAN (ISO 13616, modulo 97). */
export function ibanValide(s: string): boolean {
  const v = ibanNu(s);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) return false;
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, (c) => String(c.charCodeAt(0) - 55));
  let reste = 0;
  for (const ch of r) reste = (reste * 10 + Number(ch)) % 97;
  return reste === 1;
}
export const bicValide = (s: string) => /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(s.replace(/\s/g, "").toUpperCase());
const simple = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
/** Vrai si le titulaire n'a aucun mot significatif (4 lettres et plus) en commun avec le nom du fournisseur. */
export function titulaireDifferent(titulaire: string, nomFournisseur: string): boolean {
  if (!titulaire.trim()) return false;
  const nom = simple(nomFournisseur);
  return !simple(titulaire).split(/[^a-z0-9]+/).some((w) => w.length >= 4 && nom.includes(w));
}
export const BUCKET_RIBS = "ribs-fournisseurs";
