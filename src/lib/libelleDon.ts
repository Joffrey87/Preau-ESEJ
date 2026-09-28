// Libellés des opérations « Don » : aucun nom de donateur en clair dans la
// comptabilité. L'opération porte le libellé neutre « Don » ; le libellé
// bancaire brut et le libellé saisi sont conservés, chiffrés avec le coffre des
// dons, dans `operations.libelle_origine_chiffre`.

export const LIBELLE_DON = "Don";

export type LibellesDon = { brut: string | null; libelle: string | null };

/** Chiffre les libellés d'origine d'une opération « Don ». */
export async function chiffrerLibellesDon(
  chiffrer: (texte: string) => Promise<string>,
  l: LibellesDon,
): Promise<string> {
  return chiffrer(JSON.stringify({ brut: l.brut ?? null, libelle: l.libelle ?? null }));
}

/** Déchiffre les libellés d'origine ; null si illisible. */
export async function dechiffrerLibellesDon(
  dechiffrer: (blob: string) => Promise<string>,
  blob: string | null,
): Promise<LibellesDon | null> {
  if (!blob) return null;
  try {
    const v = JSON.parse(await dechiffrer(blob)) as Partial<LibellesDon>;
    return { brut: v.brut ?? null, libelle: v.libelle ?? null };
  } catch {
    return null;
  }
}

/** Texte le plus parlant pour reconnaître le donateur (brut bancaire, sinon libellé saisi). */
export function texteDonateur(l: LibellesDon | null): string | null {
  if (!l) return null;
  return [l.brut, l.libelle].filter(Boolean).join(" ") || null;
}
