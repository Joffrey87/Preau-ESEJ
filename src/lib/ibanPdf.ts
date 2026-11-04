// IBAN écrits dans le texte d'un PDF (copie exacte, sans lecture par Claude). Côté serveur uniquement.
import { ibanNu, ibanValide } from "@/lib/iban";

/** IBAN à la clé correcte trouvés dans un texte : chaque groupe imprimé s'ajoute jusqu'à former un IBAN valide. */
export function ibansDuTexte(texte: string): string[] {
  const trouves = new Set<string>();
  for (const m of texte.toUpperCase().matchAll(/\b[A-Z]{2}\d{2}(?:[  -]?[A-Z0-9]+){1,9}/g)) {
    const groupes = m[0].split(/[  -]+/);
    for (let n = groupes.length; n > 0; n--) {
      const v = ibanNu(groupes.slice(0, n).join(""));
      if (ibanValide(v)) {
        trouves.add(v);
        break;
      }
    }
  }
  return [...trouves];
}

/** IBAN valides du texte d'un PDF ; aucun si le PDF n'a pas de texte (scan) ou ne peut être lu. */
export async function ibansDuPdf(base64: string): Promise<string[]> {
  try {
    const { extractText, getDocumentProxy } = await import("unpdf");
    const pdf = await getDocumentProxy(new Uint8Array(Buffer.from(base64, "base64")));
    const { text } = await extractText(pdf, { mergePages: true });
    return ibansDuTexte(text);
  } catch (e) {
    console.error("lecture-facture : texte du PDF illisible", e instanceof Error ? e.message : e);
    return [];
  }
}
