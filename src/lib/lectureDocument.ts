// Outils communs aux lectures automatiques : limite de pages d'un PDF, réponse de Claude en plusieurs objets JSON.
import { PDFDocument } from "pdf-lib";

export const PAGES_MAX = 10;
export const MSG_TROP_DE_PAGES = `Fichier trop gros : plus de ${PAGES_MAX} pages.`;

/** Vrai si le PDF dépasse la limite. Un PDF que l'on ne sait pas compter n'est pas refusé ici : la lecture tranchera. */
export async function pdfTropLong(f: File): Promise<boolean> {
  if (f.type !== "application/pdf") return false;
  try {
    const pdf = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    return pdf.getPageCount() > PAGES_MAX;
  } catch {
    return false;
  }
}

/**
 * Fichier ne gardant que ces pages d'un PDF (numérotées à partir de 1). Fichier entier s'il ne peut être découpé :
 * photo, PDF protégé, numéros de pages inexploitables.
 */
export async function extrairePages(f: File, pages: number[]): Promise<File> {
  if (f.type !== "application/pdf" || !pages.length) return f;
  try {
    const source = await PDFDocument.load(await f.arrayBuffer(), { ignoreEncryption: true, updateMetadata: false });
    const indices = [...new Set(pages)].map((p) => p - 1).filter((i) => i >= 0 && i < source.getPageCount());
    if (!indices.length || indices.length === source.getPageCount()) return f;
    const extrait = await PDFDocument.create();
    (await extrait.copyPages(source, indices)).forEach((p) => extrait.addPage(p));
    const octets = await extrait.save();
    return new File([octets.slice()], f.name, { type: f.type });
  } catch {
    return f;
  }
}

/** Objets JSON de premier niveau d'un texte, dans l'ordre (les accolades dans les chaînes sont ignorées). */
export function objetsJson(t: string): Record<string, unknown>[] {
  const objets: Record<string, unknown>[] = [];
  let debut = -1;
  let niveau = 0;
  let chaine = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (chaine) {
      if (c === "\\") i++;
      else if (c === '"') chaine = false;
    } else if (c === '"' && niveau > 0) chaine = true;
    else if (c === "{" && niveau++ === 0) debut = i;
    else if (c === "}" && niveau > 0 && --niveau === 0) objets.push(JSON.parse(t.slice(debut, i + 1)) as Record<string, unknown>);
  }
  return objets;
}
